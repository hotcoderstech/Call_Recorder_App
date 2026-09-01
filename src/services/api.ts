import axios from 'axios';
import { useAppStore } from '../store/useAppStore';

export const apiClient = axios.create({ timeout: 15000 });

apiClient.interceptors.request.use((config) => {
  const { apiBaseUrl, accessToken } = useAppStore.getState();
  config.baseURL = apiBaseUrl;
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
      `${apiBaseUrl}/auth/refresh`,
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

export const authApi = {
  async login(identifier: string, password: string): Promise<LoginResult> {
    const { data } = await apiClient.post('/auth/login', { identifier, password });
    return data.data;
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

export const leadsApi = {
  async searchMine(search: string): Promise<LeadSummary[]> {
    const { data } = await apiClient.get('/leads', { params: { search, limit: 20 } });
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
  };
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
   * Returns false (instead of throwing) when the number just isn't linked to any lead, since
   * that's an expected, common outcome the caller shouldn't treat as a failure.
   */
  async syncRecordedCall(payload: DeviceCallPayload, fileUri: string, mimeType: string): Promise<boolean> {
    const form = new FormData();
    form.append('phoneNumber', payload.phoneNumber);
    form.append('timestamp', String(payload.timestamp));
    form.append('type', String(payload.type));
    form.append('durationSeconds', String(payload.durationSeconds));
    if (payload.contactName) form.append('contactName', payload.contactName);
    const name = fileUri.split('/').pop() || 'recording.m4a';
    form.append('file', { uri: fileUri, name, type: mimeType } as unknown as Blob);

    try {
      await apiClient.post('/calls/recordings', form);
      return true;
    } catch (err: any) {
      if (err?.response?.data?.error?.code === 'NOT_A_LEAD') return false;
      throw err;
    }
  },

  async lookupRecordings(calls: { phoneNumber: string; timestamp: number }[]): Promise<RecordingMatch[]> {
    const { data } = await apiClient.post('/calls/lookup-recordings', { calls });
    return data.data;
  },
};
