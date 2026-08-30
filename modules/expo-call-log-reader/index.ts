import { requireNativeModule } from 'expo-modules-core';

export interface CallLogRecord {
  number: string | null;
  type: number | null;
  timestamp: number | null;
  duration: number | null;
  name: string | null;
}

const ExpoCallLogReader = requireNativeModule('ExpoCallLogReader');

export async function getCallHistory(): Promise<CallLogRecord[]> {
  return await ExpoCallLogReader.getCallHistory();
}
