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
// Pass 1/2 (phone number or contact name embedded in the filename) are stronger signals than mtime
// alone, so they tolerate a looser window than MATCH_WINDOW_MS — but without ANY bound, an old,
// previously-unmatched recording (e.g. from a call that never got logged) whose filename happens to
// contain the same number/name as today's call would still win the match over the real, current
// recording. Bounding it to a day prevents a stale file from being attached to a fresh call log entry.
const NAME_OR_NUMBER_MATCH_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIME_BY_EXT: Record<string, string> = {
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  amr: 'audio/amr',
  awb: 'audio/amr-wb',
  '3gp': 'audio/3gpp',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
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
  alreadyInCrm: number;
  uploadFailures: number;
  lastUploadError?: string;
}

export async function matchAndUploadRecordings(candidates: CallCandidate[]): Promise<RecordingSyncDiagnostics> {
  const empty: RecordingSyncDiagnostics = {
    uploadedCount: 0,
    filesInFolder: 0,
    filesAlreadyHandled: 0,
    candidatesWithDuration: 0,
    matchFailures: 0,
    alreadyInCrm: 0,
    uploadFailures: 0,
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
    // Most commonly this is a "Downloads" shortcut URI picked in the SAF folder browser, which
    // looks like a valid tree URI but can't actually be listed — surface it instead of failing silently.
    throw new Error(
      'Could not read the selected Call Recordings Folder. Go to Settings and re-pick it — make sure to browse into Internal Storage and select the actual recordings folder, not "Downloads".',
    );
  }

  const diag: RecordingSyncDiagnostics = {
    uploadedCount: 0,
    filesInFolder: fileUris.length,
    filesAlreadyHandled: 0,
    candidatesWithDuration: withDuration.length,
    matchFailures: 0,
    alreadyInCrm: 0,
    uploadFailures: 0,
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

    // Some OEM recorders (e.g. "Name (Tag)-2609031017.awb") instead embed a YYMMDDHHmm timestamp
    // right before the extension — decode that too rather than leaving modificationTimeMs unknown.
    if (modificationTimeMs === null) {
      // Must follow a separator (not be the whole name, e.g. a bare phone number) and be a real date.
      const shortMatch = decodedName.match(/[-_ ](\d{10})\.\w+$/);
      if (shortMatch) {
        const [, yy, mm, dd, hh, min] = shortMatch[1].match(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/) || [];
        if (yy) {
          const year = 2000 + parseInt(yy, 10);
          const month = parseInt(mm, 10);
          const day = parseInt(dd, 10);
          const hour = parseInt(hh, 10);
          const minute = parseInt(min, 10);
          const valid =
            year >= 2015 && year <= new Date().getFullYear() + 1 &&
            month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59;
          if (valid) {
            const parsed = new Date(year, month - 1, day, hour, minute);
            // Reject dates that Date silently rolled over (e.g. Feb 31 -> Mar 3).
            if (parsed.getMonth() === month - 1 && parsed.getDate() === day) {
              modificationTimeMs = parsed.getTime();
            }
          }
        }
      }
    }

    const timeDelta = (i: number) =>
      modificationTimeMs === null ? Infinity : Math.abs(unmatchedCalls[i].timestamp - modificationTimeMs);

    const normalizedFileName = normalizeForNameMatch(decodedName);

    // Pass 1: exact phone-number-in-filename match (strongest signal) — among ties, closest in time.
    let bestIndex = -1;
    let bestDelta = Infinity;
    let phoneMatchCount = 0;
    for (let i = 0; i < unmatchedCalls.length; i++) {
      const key = phoneMatchKey(unmatchedCalls[i].number);
      if (key === null || !decodedName.includes(key)) continue;
      const delta = timeDelta(i);
      // A file with a known mtime that's nowhere near this call is almost certainly an old,
      // previously-unmatched recording from a different call with the same number — don't let it
      // steal the match from the actual current call.
      if (modificationTimeMs !== null && delta > NAME_OR_NUMBER_MATCH_WINDOW_MS) continue;
      phoneMatchCount++;
      // bestIndex === -1 check matters when modificationTimeMs is unknown for every candidate:
      // delta is then Infinity for all of them, and "Infinity < Infinity" is false, so without this
      // the very first (and only) match would never get selected.
      if (bestIndex === -1 || delta < bestDelta) {
        bestDelta = delta;
        bestIndex = i;
      }
    }
    // With no file time we can't tell which call a number-only match belongs to — only accept it
    // when it's unambiguous, otherwise leave the file unmatched rather than attach it to the wrong call.
    if (modificationTimeMs === null && phoneMatchCount > 1) bestIndex = -1;

    // Pass 2: saved-contact-name-in-filename match — many recorders (e.g. built-in dialer call
    // recording) name files after the contact ("Prakash Rvs MCA_...m4a"), not the raw number.
    // Require a reasonably long normalized name to avoid short-string false positives.
    if (bestIndex === -1) {
      let nameMatchCount = 0;
      for (let i = 0; i < unmatchedCalls.length; i++) {
        const rawName = unmatchedCalls[i].name;
        if (!rawName) continue;
        const normalizedName = normalizeForNameMatch(rawName);
        if (normalizedName.length < 4 || !normalizedFileName.includes(normalizedName)) continue;
        const delta = timeDelta(i);
        // Same staleness guard as the phone-number pass — a distant mtime means this is likely an
        // old recording of a different call with the same contact, not today's call.
        if (modificationTimeMs !== null && delta > NAME_OR_NUMBER_MATCH_WINDOW_MS) continue;
        nameMatchCount++;
        if (bestIndex === -1 || delta < bestDelta) {
          bestDelta = delta;
          bestIndex = i;
        }
      }
      // Same reasoning as the phone-number pass: with no file time, an ambiguous name match across
      // multiple calls can't be resolved safely, so leave it unmatched rather than guess wrong.
      if (modificationTimeMs === null && nameMatchCount > 1) bestIndex = -1;
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
      const outcome = await callsApi.syncRecordedCall(
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
      if (outcome === 'created') diag.uploadedCount++;
      else if (outcome === 'duplicate') diag.alreadyInCrm++;
      // 'not_a_lead' means the number isn't linked to any lead — expected, not an error;
      // the file is still marked handled since retrying won't change that outcome on its own.
    } catch (err: any) {
      console.error('Failed to upload call recording', fileUri, err?.response?.data || err.message);
      diag.uploadFailures++;
      diag.lastUploadError = err?.response?.data?.error?.message || err?.message || 'Upload failed';
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
