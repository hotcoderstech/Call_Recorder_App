import { PermissionsAndroid, Platform } from 'react-native';
import { getCallHistory, CallLogRecord } from '../../modules/expo-call-log-reader';
import { getContactMeta, getRecordingCallId } from './database';
import { useAppStore } from '../store/useAppStore';

export interface EnrichedCallRecord extends CallLogRecord {
  id: string; // Unique ID for list rendering
  dateGroup: string; // YYYY-MM-DD for grouping
  contactName: string | null;
  isFavorite: boolean;
  notes: string | null;
  tag: string | null;
  recordingPath?: string; // Optional path to recording
}

export async function fetchEnrichedCallHistory(): Promise<EnrichedCallRecord[]> {
  try {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        {
          title: 'Call Log Permission',
          message: 'This app needs access to your call log to display your call history and analytics.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Call log permission denied');
        return [];
      }
    }

    const rawCalls = await getCallHistory();
    const enriched: EnrichedCallRecord[] = rawCalls.map((call, index) => {
      let isFavorite = false;
      let notes = null;
      let tag = null;
      let metaName = null;

      if (call.number) {
        const meta = getContactMeta(call.number);
        if (meta) {
          isFavorite = meta.isFavorite === 1;
          notes = meta.notes;
          tag = meta.tag;
          metaName = meta.name;
        }
      }

      const dateObj = new Date(call.timestamp || 0);
      const dateGroup = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;

      // A real recording, if the device's own call recorder produced one and it's been matched/uploaded during sync.
      let recordingPath: string | undefined = undefined;
      if (call.number && call.timestamp) {
        const callId = getRecordingCallId(call.number, call.timestamp);
        if (callId) {
          const { apiBaseUrl, accessToken } = useAppStore.getState();
          recordingPath = `${apiBaseUrl}/calls/${callId}/recording?token=${accessToken}`;
        }
      }

      return {
        ...call,
        id: `${call.number}-${call.timestamp}-${index}`,
        dateGroup,
        contactName: metaName || call.name, // Local alias overrides device alias
        isFavorite,
        notes,
        tag,
        recordingPath
      };
    });

    return enriched;
  } catch (error) {
    console.error("Error fetching call history:", error);
    return [];
  }
}
