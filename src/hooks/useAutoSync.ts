import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { syncCallLogsToBackend } from '../services/sync';

const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes while the app is open

/**
 * Automatically syncs the call log whenever the app comes to the foreground, and on a timer while
 * it stays open. There is no true background sync (app closed) — that needs a dev build with
 * expo-background-task/task-manager, which is a bigger, separate lift.
 */
export function useAutoSync() {
  const accessToken = useAppStore((s) => s.accessToken);
  const currentOrganizationId = useAppStore((s) => s.currentOrganizationId);
  const autoSyncEnabled = useAppStore((s) => s.autoSyncEnabled);
  const isReady = Boolean(accessToken && currentOrganizationId && autoSyncEnabled);
  const inFlight = useRef(false);

  const runSync = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await syncCallLogsToBackend();
    } catch (err) {
      console.warn('Auto-sync failed', err);
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    if (!isReady) return;

    runSync();

    const interval = setInterval(runSync, AUTO_SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') runSync();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);
}
