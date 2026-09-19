import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('callAnalytics.db');

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS contacts_meta (
      phoneNumber TEXT PRIMARY KEY,
      name TEXT,
      isFavorite INTEGER DEFAULT 0,
      notes TEXT,
      tag TEXT
    );
    
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phoneNumber TEXT,
      reminderText TEXT,
      reminderDate INTEGER,
      isCompleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS uploaded_recordings (
      fileUri TEXT PRIMARY KEY,
      uploadedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS recording_availability (
      phoneNumber TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      callId TEXT NOT NULL,
      PRIMARY KEY (phoneNumber, timestamp)
    );
  `);
}

export function isRecordingFileUploaded(fileUri: string): boolean {
  return db.getFirstSync('SELECT 1 FROM uploaded_recordings WHERE fileUri = ?', [fileUri]) !== null;
}

export function markRecordingFileUploaded(fileUri: string): void {
  db.runSync(
    'INSERT INTO uploaded_recordings (fileUri, uploadedAt) VALUES (?, ?) ON CONFLICT(fileUri) DO NOTHING',
    [fileUri, Date.now()],
  );
}

/** Clears every "already handled" file mark, so the next sync re-scans the whole recordings folder from scratch. */
export function resetUploadedRecordings(): void {
  db.runSync('DELETE FROM uploaded_recordings');
}

export function setRecordingAvailability(entries: { phoneNumber: string; timestamp: number; callId: string }[]): void {
  for (const entry of entries) {
    db.runSync(
      'INSERT INTO recording_availability (phoneNumber, timestamp, callId) VALUES (?, ?, ?) ON CONFLICT(phoneNumber, timestamp) DO UPDATE SET callId = excluded.callId',
      [entry.phoneNumber, entry.timestamp, entry.callId],
    );
  }
}

export function getRecordingCallId(phoneNumber: string, timestamp: number): string | null {
  const row = db.getFirstSync<{ callId: string }>(
    'SELECT callId FROM recording_availability WHERE phoneNumber = ? AND timestamp = ?',
    [phoneNumber, timestamp],
  );
  return row?.callId ?? null;
}

export function getContactMeta(phoneNumber: string) {
  return db.getFirstSync<{
    phoneNumber: string;
    name: string | null;
    isFavorite: number;
    notes: string | null;
    tag: string | null;
  }>('SELECT * FROM contacts_meta WHERE phoneNumber = ?', [phoneNumber]);
}

export function setContactFavorite(phoneNumber: string, name: string | null, isFavorite: boolean) {
  db.runSync(
    'INSERT INTO contacts_meta (phoneNumber, name, isFavorite) VALUES (?, ?, ?) ON CONFLICT(phoneNumber) DO UPDATE SET isFavorite = excluded.isFavorite, name = excluded.name',
    [phoneNumber, name, isFavorite ? 1 : 0]
  );
}

export function setContactNotes(phoneNumber: string, name: string | null, notes: string | null, tag: string | null) {
  db.runSync(
    'INSERT INTO contacts_meta (phoneNumber, name, notes, tag) VALUES (?, ?, ?, ?) ON CONFLICT(phoneNumber) DO UPDATE SET notes = excluded.notes, tag = excluded.tag, name = excluded.name',
    [phoneNumber, name, notes, tag]
  );
}

export interface ReminderItem {
  id: number;
  phoneNumber: string;
  contactName?: string | null;
  reminderText: string;
  reminderDate: number;
  priority?: string | null;
  isCompleted: number;
}

export function addReminder(data: {
  phoneNumber: string;
  contactName?: string | null;
  reminderText: string;
  reminderDate: number;
  priority?: string;
}) {
  try {
    db.runSync(
      'INSERT INTO reminders (phoneNumber, contactName, reminderText, reminderDate, priority, isCompleted) VALUES (?, ?, ?, ?, ?, 0)',
      [data.phoneNumber, data.contactName || null, data.reminderText, data.reminderDate, data.priority || 'medium']
    );
  } catch (err) {
    // Fallback if priority/contactName columns aren't present yet
    db.runSync(
      'INSERT INTO reminders (phoneNumber, reminderText, reminderDate, isCompleted) VALUES (?, ?, ?, 0)',
      [data.phoneNumber, data.reminderText, data.reminderDate]
    );
  }
}

export function getReminders(includeCompleted = false): ReminderItem[] {
  try {
    if (includeCompleted) {
      return db.getAllSync<ReminderItem>('SELECT * FROM reminders ORDER BY reminderDate ASC');
    }
    return db.getAllSync<ReminderItem>('SELECT * FROM reminders WHERE isCompleted = 0 ORDER BY reminderDate ASC');
  } catch {
    return [];
  }
}

export function toggleReminderComplete(id: number, completed: boolean) {
  db.runSync('UPDATE reminders SET isCompleted = ? WHERE id = ?', [completed ? 1 : 0, id]);
}

export function deleteReminder(id: number) {
  db.runSync('DELETE FROM reminders WHERE id = ?', [id]);
}
