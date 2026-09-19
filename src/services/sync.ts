import { PermissionsAndroid, Platform } from 'react-native';
import { getCallHistory } from '../../modules/expo-call-log-reader';
import { useAppStore, CURRENT_SYNC_WATERMARK_VERSION } from '../store/useAppStore';
import { callsApi, DeviceCallPayload, SyncCallsResult } from './api';
import { matchAndUploadRecordings, refreshRecordingAvailability, RecordingSyncDiagnostics } from './recordings';

async function ensureCallLogPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG, {
    title: 'Call Log Permission',
    message: 'This app needs access to your call log to sync it to your CRM.',
    buttonNeutral: 'Ask Me Later',
    buttonNegative: 'Cancel',
    buttonPositive: 'OK',
  });
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

const BATCH_SIZE = 200;
// Recording files can appear (or the folder can be picked) any time after a call's metadata was
// already synced — so recording matching is intentionally NOT bounded by the sync watermark like
// metadata is. It re-scans this trailing window on every sync instead; matching/upload is
// idempotent (backend returns the existing CallRecording, and uploaded files are tracked locally),
// so re-checking already-recorded calls is cheap and harmless.
const RECORDING_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type Candidate = { number: string; type: number; timestamp: number; duration: number | null; name: string | null };

/**
 * Pushes call-log entries newer than the last successful sync to the backend. Uses the device's
 * own history each time (not local SQLite meta) since the backend only needs number/type/time/duration.
 *
 * Connected calls (duration > 0) are deliberately NOT sent through this metadata-only path — a
 * call log is only allowed into the DB together with proof of the conversation (its recording), so
 * those go exclusively through matchAndUploadRecordings below. Missed/rejected/no-answer calls
 * (duration 0) have nothing to record, so they still sync here as before.
 */
export function syncCallLogsToBackend(): Promise<SyncCallsResult> {
  // Auto-sync and the manual Sync button can fire at the same moment. Two overlapping runs match and
  // upload the same recording twice (the second gets a DUPLICATE_VALUE from the backend), and the
  // manual run would then report "Up to date" even though the auto run just added the data. Sharing
  // one in-flight run means every caller gets the real result.
  if (!inFlightSync) {
    inFlightSync = runSync().finally(() => {
      inFlightSync = null;
    });
  }
  return inFlightSync;
}

let inFlightSync: Promise<SyncCallsResult> | null = null;

async function runSync(): Promise<SyncCallsResult> {
  const { accessToken, currentOrganizationId, lastSyncedAt, syncWatermarkVersion, syncStartAt, markSynced } = useAppStore.getState();
  if (!accessToken || !currentOrganizationId) {
    throw new Error('Not logged in');
  }

  const hasPermission = await ensureCallLogPermission();
  if (!hasPermission) {
    throw new Error('Call log permission was denied');
  }

  // A stale watermark from before a matching fix would otherwise skip calls forever — do one full re-scan.
  // Calls made before the user logged in are never synced, so the login time is a floor either way.
  const baseLastSyncedAt = syncWatermarkVersion < CURRENT_SYNC_WATERMARK_VERSION ? null : lastSyncedAt;
  const effectiveLastSyncedAt = Math.max(baseLastSyncedAt ?? 0, syncStartAt ?? 0) || null;

  const rawCalls = await getCallHistory();
  const candidates = rawCalls.filter(
    (call): call is Candidate =>
      Boolean(call.number && call.timestamp && (!effectiveLastSyncedAt || call.timestamp > effectiveLastSyncedAt)),
  );
  const missedCandidates = candidates.filter((c) => !c.duration || c.duration <= 0);

  const totals: SyncCallsResult = { synced: 0, skipped: 0, total: 0, recordingsSynced: 0 };

  if (missedCandidates.length > 0) {
    const payloads: DeviceCallPayload[] = missedCandidates.map((call) => ({
      phoneNumber: call.number,
      contactName: call.name ?? undefined,
      type: call.type,
      timestamp: call.timestamp,
      durationSeconds: call.duration ?? 0,
    }));

    for (const batch of chunk(payloads, BATCH_SIZE)) {
      const result = await callsApi.syncDevice(batch);
      totals.synced += result.synced;
      totals.skipped += result.skipped;
      totals.total += result.total;
    }
  }

  if (candidates.length > 0) {
    const maxTimestamp = Math.max(...candidates.map((c) => c.timestamp));
    markSynced(maxTimestamp, CURRENT_SYNC_WATERMARK_VERSION);
  }

  // Independent of whether there was anything new to sync — a recording file (or the folder pick
  // itself) can show up well after a call's metadata was already synced by an earlier run.
  let recordingDiagnostics: RecordingSyncDiagnostics | undefined;
  try {
    const recordingCutoff = Math.max(Date.now() - RECORDING_LOOKBACK_MS, syncStartAt ?? 0);
    const recordingCandidates = rawCalls.filter(
      (call): call is Candidate => Boolean(call.number && call.timestamp && call.timestamp > recordingCutoff),
    );
    recordingDiagnostics = await matchAndUploadRecordings(recordingCandidates);
    totals.recordingsSynced = recordingDiagnostics.uploadedCount;
    if (recordingDiagnostics.uploadFailures > 0) {
      totals.recordingError = `${recordingDiagnostics.uploadFailures} recording(s) failed to upload: ${recordingDiagnostics.lastUploadError}`;
    }
    await refreshRecordingAvailability(recordingCandidates);
  } catch (err: any) {
    // Recording capture is best-effort — never let it fail the call-log sync itself, but still
    // surface why it didn't run (e.g. an unreadable recordings folder) instead of only logging it.
    console.error('Recording sync step failed', err);
    totals.recordingError = err?.message || 'Recording sync failed';
  }

  totals.recordingDiagnostics = recordingDiagnostics;
  return totals;
}
