import * as FileSystem from 'expo-file-system/legacy';
import { callsApi } from './api';
import { useAppStore } from '../store/useAppStore';
import {
  isRecordingFileUploaded,
  markRecordingFileUploaded,
  setRecordingAvailability,
} from './database';

interface CallCandidate {
  number: string;
  timestamp: number;
  duration: number | null;
  type: number;
  name: string | null;
}

const MATCH_WINDOW_MS = 3 * 60 * 1000; // ±3 minutes between a call's start time and the recording file's mtime
const MIME_BY_EXT: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  amr: 'audio/amr',
  '3gp': 'audio/3gpp',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  awb: 'audio/amr-wb',
};

function guessMimeType(fileUri: string): string {
  const ext = fileUri.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'audio/mp4';
}

/** Last 10 digits of a phone number — mirrors the backend's phoneMatchKey so "+91xxxxxxxxxx", "0xxxxxxxxxx" etc. all compare equal. */
function phoneMatchKey(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  return digits.length >= 6 ? digits.slice(-10) : null;
}

/** Letters/digits only, lowercased — for comparing a saved contact name against a filename regardless of spacing/punctuation. */
function normalizeForNameMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * SAF `content://` document URIs usually embed the file's real path/name in their (URL-encoded)
 * document id — e.g. a Samsung recording named "CallRecording_+919876543210_250825_141251.m4a"
 * shows up as ".../document/primary%3ACall%2FCallRecording_%2B919876543210_250825_141251.m4a".
 * Decoding it recovers a real filename we can search for a phone number in.
 */
function decodedFileName(fileUri: string): string {
  try {
    return decodeURIComponent(fileUri);
  } catch {
    return fileUri;
  }
}

/**
 * Android blocks third-party apps from recording live calls directly (only the default
 * dialer/OEM recorder can) — so instead of capturing audio ourselves, we scan the folder the
 * phone's own call recorder already saves to (picked once via SAF in Settings) and match files to
 * synced calls two ways: how close the file's modification time is to the call's timestamp, and
 * whether the call's phone number appears in the (decoded) filename — OEM recorders very commonly
 * embed the number. Neither signal is reliable alone across every OEM/Android version, so both are
 * tried; a file that matches neither is left unmarked so it's retried on a later sync rather than
 * silently given up on forever.
 */
export interface RecordingSyncDiagnostics {
  uploadedCount: number;
  filesInFolder: number;
  filesAlreadyHandled: number;
  candidatesWithDuration: number;
  matchFailures: number;
  /** Decoded name of the last file that matched no call, so a mismatch can be diagnosed without device access. */
  lastUnmatchedFileName?: string;
}

export async function matchAndUploadRecordings(candidates: CallCandidate[]): Promise<RecordingSyncDiagnostics> {
  const empty: RecordingSyncDiagnostics = {
    uploadedCount: 0,
    filesInFolder: 0,
    filesAlreadyHandled: 0,
    candidatesWithDuration: 0,
    matchFailures: 0,
  };

  const { recordingsFolderUri } = useAppStore.getState();
  console.log(`[Recording Sync] folder uri:`, recordingsFolderUri);
  if (!recordingsFolderUri) return empty;

  const withDuration = candidates.filter((c) => c.duration && c.duration > 0);
  console.log(`[Recording Sync] Total candidates: ${candidates.length}, Connected calls: ${withDuration.length}`);
  if (withDuration.length === 0) return empty;

  let fileUris: string[];
  try {
    fileUris = await FileSystem.StorageAccessFramework.readDirectoryAsync(recordingsFolderUri);
  } catch (err) {
    console.error('Failed to read recordings folder', err);
    return empty;
  }

  const diag: RecordingSyncDiagnostics = {
    uploadedCount: 0,
    filesInFolder: fileUris.length,
    filesAlreadyHandled: 0,
    candidatesWithDuration: withDuration.length,
    matchFailures: 0,
  };

  const unmatchedCalls = [...withDuration];

  for (const fileUri of fileUris) {
    if (isRecordingFileUploaded(fileUri)) {
      diag.filesAlreadyHandled++;
      continue;
    }
    if (unmatchedCalls.length === 0) break;

    let modificationTimeMs: number | null = null;
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (info.exists && info.modificationTime) {
        modificationTimeMs = info.modificationTime * 1000;
      }
    } catch (err) {
      console.error('Failed to read recording file info', fileUri, err);
    }

    const decodedName = decodedFileName(fileUri);
    
    // Fallback: If FileSystem couldn't give us a modification time, try to extract it from the filename.
    // e.g. "record-1787646784338.wav" -> 1787646784338
    if (modificationTimeMs === null) {
      const timestampMatch = decodedName.match(/(\d{13})/);
      if (timestampMatch) {
        modificationTimeMs = parseInt(timestampMatch[1], 10);
      }
    }

    const timeDelta = (i: number) =>
      modificationTimeMs === null ? Infinity : Math.abs(unmatchedCalls[i].timestamp - modificationTimeMs);

    const normalizedFileName = normalizeForNameMatch(decodedName);

    // Pass 1: exact phone-number-in-filename match (strongest signal) — among ties, closest in time.
    let bestIndex = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < unmatchedCalls.length; i++) {
      const key = phoneMatchKey(unmatchedCalls[i].number);
      if (key === null || !decodedName.includes(key)) continue;
      const delta = timeDelta(i);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }

    // Pass 2: saved-contact-name-in-filename match — many recorders (e.g. built-in dialer call
    // recording) name files after the contact ("Prakash Rvs MCA_...m4a"), not the raw number.
    // Require a reasonably long normalized name to avoid short-string false positives.
    if (bestIndex === -1) {
      for (let i = 0; i < unmatchedCalls.length; i++) {
        const rawName = unmatchedCalls[i].name;
        if (!rawName) continue;
        const normalizedName = normalizeForNameMatch(rawName);
        if (normalizedName.length < 4 || !normalizedFileName.includes(normalizedName)) continue;
        const delta = timeDelta(i);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIndex = i;
        }
      }
    }

    // Pass 3: fall back to modification-time proximity alone, within the match window.
    if (bestIndex === -1 && modificationTimeMs !== null) {
      bestDelta = MATCH_WINDOW_MS + 1;
      for (let i = 0; i < unmatchedCalls.length; i++) {
        const delta = timeDelta(i);
        if (delta <= MATCH_WINDOW_MS && delta < bestDelta) {
          bestDelta = delta;
          bestIndex = i;
        }
      }
    }

    if (bestIndex === -1) {
      // No matching call yet — leave unmarked so a later sync (once the call itself is synced) can retry.
      console.log(`[Recording Sync] No match for file: ${decodedName}. Filesize/ModTime: ${modificationTimeMs}`);
      diag.matchFailures++;
      diag.lastUnmatchedFileName = decodedName.split('/').pop()?.slice(-80) ?? decodedName.slice(-80);
      continue;
    }
    
    console.log(`[Recording Sync] Found match! File: ${decodedName} matches Call Number: ${unmatchedCalls[bestIndex].number}`);

    if (!FileSystem.cacheDirectory) continue; // no writable cache — can't stage the upload, retry next sync

    const match = unmatchedCalls.splice(bestIndex, 1)[0];
    // React Native's networking layer generally can't read a scoped-storage `content://` (SAF) URI
    // directly as a FormData upload source — it needs a real `file://` path. Copy it into the
    // app's cache first (expo-file-system's copyAsync explicitly supports SAF sources for this).
    const localCopyUri = `${FileSystem.cacheDirectory}upload-${Date.now()}-${match.timestamp}.${fileUri.split('.').pop() || 'm4a'}`;
    try {
      await FileSystem.copyAsync({ from: fileUri, to: localCopyUri });
      const synced = await callsApi.syncRecordedCall(
        {
          phoneNumber: match.number,
          contactName: match.name ?? undefined,
          type: match.type,
          timestamp: match.timestamp,
          durationSeconds: match.duration ?? 0,
        },
        localCopyUri,
        guessMimeType(fileUri),
      );
      markRecordingFileUploaded(fileUri);
      if (synced) diag.uploadedCount++;
      // synced === false means the number isn't linked to any lead — expected, not an error;
      // the file is still marked handled since retrying won't change that outcome on its own.
    } catch (err: any) {
      console.error('Failed to upload call recording', fileUri, err?.response?.data || err.message);
      // Leave unmarked so it's retried on the next sync.
    } finally {
      FileSystem.deleteAsync(localCopyUri, { idempotent: true }).catch(() => {});
    }
  }

  return diag;
}

/** Batch-resolves which recently synced calls now have a recording, caching the result locally. */
export async function refreshRecordingAvailability(candidates: CallCandidate[]): Promise<void> {
  const calls = candidates
    .filter((c) => c.duration && c.duration > 0)
    .map((c) => ({ phoneNumber: c.number, timestamp: c.timestamp }));
  if (calls.length === 0) return;

  try {
    const matches = await callsApi.lookupRecordings(calls);
    if (matches.length > 0) setRecordingAvailability(matches);
  } catch (err: any) {
    if (err?.response?.status !== 401) {
      console.error('Failed to look up recording availability', err);
    }
  }
}
