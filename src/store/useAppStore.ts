import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';
import { normalizeApiBaseUrl } from '../utils/apiUrl';

/**
 * Bump this whenever a sync-affecting bug fix means previously-recorded watermarks can't be
 * trusted — e.g. the phone-matching fix that made early syncs silently store nothing while still
 * advancing lastSyncedAt. Devices below this version get one full re-scan instead of "since last time".
 */
export const CURRENT_SYNC_WATERMARK_VERSION = 1;

export interface AuthUser {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
}

export interface AuthOrganization {
  id: string;
  name: string;
  roleCode?: string;
}

interface AppState {
  theme: 'light' | 'dark' | 'system';
  appLockEnabled: boolean;
  groupRepeatedCalls: boolean;
  showDuration: boolean;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setAppLockEnabled: (enabled: boolean) => void;
  setGroupRepeatedCalls: (group: boolean) => void;
  setShowDuration: (show: boolean) => void;

  // Backend connection
  apiBaseUrl: string;
  setApiBaseUrl: (url: string) => void;

  // Auth
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  organizations: AuthOrganization[];
  currentOrganizationId: string | null;
  /** When the user logged in — calls/recordings from before this moment are never synced (unless a "sync from" date is picked). */
  syncStartAt: number | null;
  setSession: (accessToken: string, user: AuthUser, refreshToken: string) => void;
  setOrganizations: (organizations: AuthOrganization[]) => void;
  setCurrentOrganization: (organizationId: string, accessToken: string) => void;
  /** Updates just the tokens after a silent refresh — everything else about the session is unchanged. */
  updateTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;

  // Sync
  lastSyncedAt: number | null;
  syncWatermarkVersion: number;
  /** Records a successful sync's watermark and bumps syncWatermarkVersion to `version` in one atomic update. */
  markSynced: (timestamp: number, version: number) => void;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  /** The date the user picked to sync from, kept only for display in Settings. */
  syncFromDate: number | null;
  /** Resets the watermark so the next sync re-scans everything from this date forward. */
  setSyncFromDate: (timestamp: number) => void;
  /** Clears the picked "sync from" date without touching the sync watermark. */
  clearSyncFromDate: () => void;

  /** SAF (Storage Access Framework) URI for the folder where the device auto-saves call recordings. */
  recordingsFolderUri: string | null;
  setRecordingsFolderUri: (uri: string | null) => void;

  /** Message from the most recent auto-sync failure, so it can be surfaced in the UI instead of only logged. Cleared on the next successful sync. */
  lastSyncError: string | null;
  setLastSyncError: (message: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'light',
      appLockEnabled: false,
      groupRepeatedCalls: true,
      showDuration: true,
      setTheme: (theme) => set({ theme }),
      setAppLockEnabled: (enabled) => set({ appLockEnabled: enabled }),
      setGroupRepeatedCalls: (group) => set({ groupRepeatedCalls: group }),
      setShowDuration: (show) => set({ showDuration: show }),

      // Real production backend by default — this ships in the installed APK, so it must work
      // off the shelf, not just for a developer on the same LAN as a dev server. Change it in
      // Settings only for pointing a build at a local/staging backend during development.
      apiBaseUrl: 'https://api-faminfomedia.onrender.com/api/v1',
      setApiBaseUrl: (url) => set({ apiBaseUrl: normalizeApiBaseUrl(url) }),

      accessToken: null,
      refreshToken: null,
      user: null,
      organizations: [],
      currentOrganizationId: null,
      syncStartAt: null,
      // Keep an existing cutoff so a repeated setSession doesn't push the floor forward.
      setSession: (accessToken, user, refreshToken) =>
        set((state) => ({ accessToken, user, refreshToken, syncStartAt: state.syncStartAt ?? Date.now() })),
      setOrganizations: (organizations) => set({ organizations }),
      setCurrentOrganization: (organizationId, accessToken) =>
        set({ currentOrganizationId: organizationId, accessToken }),
      updateTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          organizations: [],
          currentOrganizationId: null,
          lastSyncedAt: null,
          syncStartAt: null,
        }),

      lastSyncedAt: null,
      markSynced: (timestamp, version) => set({ lastSyncedAt: timestamp, syncWatermarkVersion: version }),
      syncWatermarkVersion: 0,
      autoSyncEnabled: true,
      setAutoSyncEnabled: (enabled) => set({ autoSyncEnabled: enabled }),
      syncFromDate: null,
      setSyncFromDate: (timestamp) =>
        set({
          syncFromDate: timestamp,
          // An explicit "sync from" date overrides the login-time cutoff.
          syncStartAt: null,
          // One tick before the chosen date, so the next sync's ">" comparison includes it.
          lastSyncedAt: timestamp - 1,
          syncWatermarkVersion: CURRENT_SYNC_WATERMARK_VERSION,
        }),
      clearSyncFromDate: () => set({ syncFromDate: null }),

      recordingsFolderUri: null,
      setRecordingsFolderUri: (uri) => set({ recordingsFolderUri: uri }),

      lastSyncError: null,
      setLastSyncError: (message) => set({ lastSyncError: message }),
    }),
    {
      name: 'app-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<AppState> | undefined;
        if (state) {
          // Only repair known-bad URLs (old builds / the retired host) — never overwrite a
          // custom staging or local URL the developer picked in Settings.
          if (version < 3 || !state.apiBaseUrl || state.apiBaseUrl.includes('lead-management')) {
            state.apiBaseUrl = 'https://api-faminfomedia.onrender.com/api/v1';
          }
        }
        return state as AppState;
      },
    }
  )
);
