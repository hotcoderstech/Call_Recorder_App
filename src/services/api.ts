import axios from 'axios';
import { useAppStore } from '../store/useAppStore';
import { normalizeApiBaseUrl } from '../utils/apiUrl';

export const apiClient = axios.create({ timeout: 15000 });

apiClient.interceptors.request.use((config) => {
  const { apiBaseUrl, accessToken } = useAppStore.getState();
  config.baseURL = normalizeApiBaseUrl(apiBaseUrl);
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Access tokens are short-lived (15 min) — without this, any session left open longer than that
// starts failing every request with 401 until the user manually logs out and back in. Refreshes
// once (de-duped across concurrent 401s via `refreshPromise`) and retries the failed request; if
// the refresh itself fails, the session is genuinely dead and the user is logged out.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { apiBaseUrl, refreshToken, currentOrganizationId, updateTokens, logout } = useAppStore.getState();
  if (!refreshToken) return null;
  try {
    const response = await axios.post(
      `${normalizeApiBaseUrl(apiBaseUrl)}/auth/refresh`,
      { refreshToken, organizationId: currentOrganizationId ?? undefined },
      { timeout: 15000 },
    );
    const { accessToken, refreshToken: newRefreshToken } = response.data.data;
    updateTokens(accessToken, newRefreshToken);
    return accessToken;
  } catch {
    logout();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint && useAppStore.getState().refreshToken) {
      originalRequest._retry = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newAccessToken = await refreshPromise;
      if (newAccessToken) {
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      }
    }
    return Promise.reject(error);
  },
);

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; firstName: string; lastName?: string | null; email: string };
}

export interface OrganizationSummary {
  id: string;
  name: string;
  roleCode?: string;
}

// The backend sits on a host that sleeps when idle, so the first request after a quiet period can
// take 30-60s while it cold-starts. Login therefore uses a long timeout and retries when the server
// couldn't be reached (no HTTP response), instead of failing the user's first attempt.
const LOGIN_TIMEOUT_MS = 45000;
const LOGIN_MAX_ATTEMPTS = 3;

export const authApi = {
  /** Fire-and-forget ping to wake a sleeping backend before the user submits credentials. */
  warmUp(): void {
    apiClient.get('/health', { timeout: LOGIN_TIMEOUT_MS }).catch(() => {});
  },

  async login(identifier: string, password: string): Promise<LoginResult> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS; attempt++) {
      try {
        const { data } = await apiClient.post('/auth/login', { identifier, password }, { timeout: LOGIN_TIMEOUT_MS });
        return data.data;
      } catch (err: any) {
        // A server response (wrong password, 4xx/5xx) is a real answer — only retry when unreachable.
        if (err?.response) throw err;
        lastError = err;
      }
    }
    throw lastError;
  },
};

export const organizationsApi = {
  async list(): Promise<OrganizationSummary[]> {
    const { data } = await apiClient.get('/organizations');
    return data.data;
  },

  async switch(organizationId: string): Promise<{ accessToken: string }> {
    const { data } = await apiClient.post(`/organizations/${organizationId}/switch`);
    return data.data;
  },
};

export interface LeadSummary {
  id: string;
  leadNumber: string;
  fullName: string | null;
  firstName: string;
  lastName: string | null;
  phone: string;
}

export interface LeadActivityItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  timestamp: string | number;
}

export interface PipelineStageItem {
  id: string;
  name: string;
  code: string;
}

export interface LeadDetails extends LeadSummary {
  email?: string | null;
  source?: string | null;
  pipelineId?: string | null;
  stage?: PipelineStageItem | null;
  pipeline?: { id: string; name: string } | null;
  pipelineStage?: string | null;
  pipelineName?: string | null;
  status?: string | null;
  assignedTo?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  activities?: LeadActivityItem[];
}

export const leadsApi = {
  async searchMine(search: string): Promise<LeadSummary[]> {
    const { data } = await apiClient.get('/leads', { params: { search, limit: 20 } });
    return data.data;
  },

  async getAllMyLeads(): Promise<LeadSummary[]> {
    try {
      const { data } = await apiClient.get('/leads', { params: { limit: 100 } });
      return data.data || [];
    } catch (e) {
      console.warn('Failed to load user leads:', e);
      return [];
    }
  },

  async getById(leadId: string): Promise<LeadDetails> {
    const { data } = await apiClient.get(`/leads/${leadId}`);
    return data.data;
  },

  async getPipelineStages(pipelineId: string): Promise<PipelineStageItem[]> {
    const { data } = await apiClient.get(`/pipelines/${pipelineId}`);
    return data.data.stages;
  },

  async updateStage(leadId: string, stageId: string): Promise<any> {
    const { data } = await apiClient.post(`/leads/${leadId}/stage-change`, { stageId });
    return data.data;
  },

  async linkAlternateNumber(leadId: string, phoneNumber: string): Promise<{ callsRelinked: number }> {
    const { data } = await apiClient.post(`/leads/${leadId}/alternative-numbers`, { phoneNumber });
    return data.data;
  },
};

export interface DeviceCallPayload {
  phoneNumber: string;
  contactName?: string;
  type: number;
  timestamp: number;
  durationSeconds: number;
}

export interface SyncCallsResult {
  synced: number;
  skipped: number;
  total: number;
  /** Connected calls whose log + recording were both stored together this run. */
  recordingsSynced: number;
  /** Debug breakdown of the recording-matching step — set by services/recordings.ts. */
  recordingDiagnostics?: {
    uploadedCount: number;
    filesInFolder: number;
    filesAlreadyHandled: number;
    candidatesWithDuration: number;
    matchFailures: number;
    lastUnmatchedFileName?: string;
    /** Matched recordings the CRM already had (nothing new to add). */
    alreadyInCrm: number;
    /** Matched recordings whose upload failed (network/server error) — retried on the next sync. */
    uploadFailures: number;
    lastUploadError?: string;
  };
  /** Set when the recording-matching step failed outright (e.g. an unreadable folder) — surfaced separately since it doesn't fail the overall sync. */
  recordingError?: string;
}

export interface RecordingMatch {
  phoneNumber: string;
  timestamp: number;
  callId: string;
}

export const callsApi = {
  async syncDevice(calls: DeviceCallPayload[]): Promise<Omit<SyncCallsResult, 'recordingsSynced'>> {
    const { data } = await apiClient.post('/calls/sync-device', { calls });
    return data.data;
  },

  /**
   * Connected calls only ever land in the DB together with their recording (see backend
   * NOT_A_LEAD rejection) — this stores the call's metadata and its recording file in one request.
   * Returns 'not_a_lead' / 'duplicate' (instead of throwing) when the number isn't linked to any
   * lead or the call is already stored, since those are expected outcomes, not failures.
   */
  async syncRecordedCall(payload: DeviceCallPayload, fileUri: string, mimeType: string): Promise<'created' | 'duplicate' | 'not_a_lead'> {
    const form = new FormData();
    form.append('phoneNumber', payload.phoneNumber);
    form.append('timestamp', String(payload.timestamp));
    form.append('type', String(payload.type));
    form.append('durationSeconds', String(payload.durationSeconds));
    if (payload.contactName) form.append('contactName', payload.contactName);
    const name = fileUri.split('/').pop() || 'recording.m4a';
    form.append('file', { uri: fileUri, name, type: mimeType } as unknown as Blob);

    try {
      // Recording uploads carry an audio file (can be several MB over slow mobile data), so give
      // this request a much longer timeout than the default 15s used for plain JSON calls.
      await apiClient.post('/calls/recordings', form, { timeout: 60000 });
      return 'created';
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === 'NOT_A_LEAD') return 'not_a_lead';
      // The call + recording is already stored (e.g. uploaded by an earlier sync) — not a failure.
      if (code === 'DUPLICATE_VALUE') return 'duplicate';
      throw err;
    }
  },

  async lookupRecordings(calls: { phoneNumber: string; timestamp: number }[]): Promise<RecordingMatch[]> {
    const { data } = await apiClient.post('/calls/lookup-recordings', { calls });
    return data.data;
  },

  async getCalls(params?: { page?: number; limit?: number; leadId?: string }): Promise<any[]> {
    try {
      const { data } = await apiClient.get('/calls', { params: { limit: 100, ...params } });
      return data.data || [];
    } catch (e) {
      console.warn('Failed to load server calls:', e);
      return [];
    }
  },
};
