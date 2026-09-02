import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Moon, Shield, Download, Trash2, RefreshCw, LogOut, User, Clock, CalendarClock, Calendar, X, FolderOpen } from 'lucide-react-native';
import { syncCallLogsToBackend } from '../services/sync';
import { resetUploadedRecordings } from '../services/database';

function formatDateInput(timestamp: number): string {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function SettingsScreen() {
  const {
    theme: storedTheme,
    setTheme,
    appLockEnabled,
    setAppLockEnabled,
    showDuration,
    setShowDuration,
    user,
    organizations,
    currentOrganizationId,
    lastSyncedAt,
    autoSyncEnabled,
    setAutoSyncEnabled,
    syncFromDate,
    setSyncFromDate,
    clearSyncFromDate,
    recordingsFolderUri,
    setRecordingsFolderUri,
    logout,
  } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [isSyncing, setIsSyncing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const currentOrg = organizations.find((o) => o.id === currentOrganizationId);

  const handlePickRecordingsFolder = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not supported', 'Call recording folders are only available on Android.');
      return;
    }
    try {
      const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (result.granted) {
        setRecordingsFolderUri(result.directoryUri);
        // A file that was wrongly marked "handled" by an earlier version of the matching logic
        // (before it could actually match/upload) would otherwise stay stuck forever — re-picking
        // the folder is the user-facing way to force every file to be reconsidered.
        resetUploadedRecordings();
        // Without this, nothing actually syncs until the next foreground/interval auto-sync (up to
        // 10 min later) or the user finds "Sync Now" separately — picking the folder looked like it
        // did nothing. Sync right away so recordings already sitting in the folder go up immediately.
        await handleSyncNow();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not select the recordings folder.');
    }
  };

  const handleToggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const formatRecordingDiag = (result: Awaited<ReturnType<typeof syncCallLogsToBackend>>) => {
    const d = result.recordingDiagnostics;
    if (!d) return '';
    const nameLine = d.lastUnmatchedFileName ? `\nUnmatched file example: ${d.lastUnmatchedFileName}` : '';
    return `\n\nRecording debug: ${d.filesInFolder} file(s) in folder, ${d.filesAlreadyHandled} already handled, ${d.candidatesWithDuration} connected call(s) considered, ${d.matchFailures} file(s) didn't match any call, ${d.uploadedCount} uploaded.${nameLine}`;
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const result = await syncCallLogsToBackend();
      if (result.synced === 0 && result.recordingsSynced === 0) {
        Alert.alert('Up to date', 'No new data was added to the CRM.');
      } else {
        Alert.alert('Successfully added', `${result.synced} call(s) and ${result.recordingsSynced} call record(s) added successfully.`);
      }
    } catch (err: any) {
      Alert.alert('Sync failed', err.message || 'Could not sync call log.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePickSyncFromDate = (event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (event.type !== 'set' || !date) {
      return;
    }
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    setSyncFromDate(normalized.getTime());
  };

  const handleSyncFromDate = async () => {
    setIsSyncing(true);
    try {
      const result = await syncCallLogsToBackend();
      if (result.synced === 0 && result.recordingsSynced === 0) {
        Alert.alert('Up to date', 'No new data was added to the CRM.');
      } else {
        Alert.alert('Successfully added', `${result.synced} call(s) and ${result.recordingsSynced} call record(s) added successfully.`);
      }
    } catch (err: any) {
      Alert.alert('Sync failed', err.message || 'Could not sync call log.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearSyncFromDate = () => {
    clearSyncFromDate();
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Stop syncing and log out of this account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleToggleAppLock = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        Alert.alert('Not Supported', 'Your device does not support biometric authentication or no biometrics are enrolled.');
        return;
      }
      
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to enable App Lock',
      });
      
      if (result.success) {
        setAppLockEnabled(true);
      }
    } else {
      setAppLockEnabled(false);
    }
  };

  const handleExport = () => {
    Alert.alert('Export', 'Export functionality will generate a CSV or PDF file.');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Moon color={colors.primary} size={20} />
              <Text style={[styles.rowText, { color: colors.text }]}>Dark Mode</Text>
            </View>
            <Switch value={isDark} onValueChange={handleToggleTheme} />
          </View>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowText, { color: colors.text, marginLeft: 32 }]}>Show Duration in List</Text>
            </View>
            <Switch value={showDuration} onValueChange={setShowDuration} />
          </View>
        </View>
      </View>

      {/*
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>SECURITY</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Shield color={colors.primary} size={20} />
              <Text style={[styles.rowText, { color: colors.text }]}>App Lock (Biometrics)</Text>
            </View>
            <Switch value={appLockEnabled} onValueChange={handleToggleAppLock} />
          </View>
        </View>
      </View>
      */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>CRM SYNC</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <User color={colors.primary} size={20} />
              <View>
                <Text style={[styles.rowText, { color: colors.text }]}>
                  {user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Not logged in'}
                </Text>
                {currentOrg ? (
                  <Text style={[styles.rowSubText, { color: colors.textMuted }]}>{currentOrg.name}</Text>
                ) : null}
              </View>
            </View>
          </View>
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={[styles.rowLeft, { flex: 1, marginRight: 12 }]}>
              <Clock color={colors.primary} size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.rowText, { color: colors.text, marginLeft: 0 }]}>Automatic Sync</Text>
                <Text style={[styles.rowSubText, { color: colors.textMuted, marginLeft: 0 }]}>
                  On app open and every 10 minutes while open
                </Text>
              </View>
            </View>
            <Switch value={autoSyncEnabled} onValueChange={setAutoSyncEnabled} />
          </View>
          <TouchableOpacity
            style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border, opacity: isSyncing ? 0.6 : 1 }]}
            onPress={handlePickRecordingsFolder}
            disabled={isSyncing}
          >
            <View style={[styles.rowLeft, { flex: 1, marginRight: 12 }]}>
              <FolderOpen color={colors.primary} size={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.rowText, { color: colors.text, marginLeft: 0 }]}>Call Recordings Folder</Text>
                <Text style={[styles.rowSubText, { color: colors.textMuted, marginLeft: 0 }]} numberOfLines={1}>
                  {recordingsFolderUri ? decodeURIComponent(recordingsFolderUri.split('/').pop() || 'Selected') : 'Not set — tap to select'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-start' }]}>
            <View style={[styles.rowLeft, { flex: 1 }]}>
              <CalendarClock color={colors.primary} size={20} style={{ marginTop: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.text }]}>Sync From Date</Text>
                <Text style={[styles.rowSubText, { color: colors.textMuted, marginBottom: 8 }]}>
                  {syncFromDate
                    ? `Currently syncing from ${formatDateInput(syncFromDate)}`
                    : 'Only sync calls on/after this date'}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.dateInput,
                    { borderColor: colors.border, backgroundColor: colors.background, opacity: isSyncing ? 0.6 : 1 },
                  ]}
                  onPress={() => setShowDatePicker(true)}
                  disabled={isSyncing}
                >
                  <Calendar color={colors.textMuted} size={16} />
                  <Text style={{ color: syncFromDate ? colors.text : colors.textMuted, fontSize: 14, marginLeft: 8 }}>
                    {syncFromDate ? formatDateInput(syncFromDate) : 'Select a date'}
                  </Text>
                </TouchableOpacity>
                {showDatePicker ? (
                  <DateTimePicker
                    value={syncFromDate ? new Date(syncFromDate) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    onChange={handlePickSyncFromDate}
                  />
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.syncBtn, { backgroundColor: colors.primary, opacity: isSyncing ? 0.6 : 1 }]}
                    onPress={handleSyncFromDate}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <RefreshCw color="#fff" size={14} />
                    )}
                    <Text style={styles.syncBtnText}>Sync</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.clearBtn,
                      { borderColor: colors.border, opacity: syncFromDate && !isSyncing ? 1 : 0.5 },
                    ]}
                    onPress={handleClearSyncFromDate}
                    disabled={!syncFromDate || isSyncing}
                  >
                    <X color={colors.text} size={14} />
                    <Text style={[styles.clearBtnText, { color: colors.text }]}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}
            onPress={handleSyncNow}
            disabled={isSyncing}
          >
            <View style={styles.rowLeft}>
              <RefreshCw color={colors.primary} size={20} />
              <View>
                <Text style={[styles.rowText, { color: colors.text }]}>Sync Call Logs Now</Text>
                {lastSyncedAt ? (
                  <Text style={[styles.rowSubText, { color: colors.textMuted }]}>
                    Last synced {new Date(lastSyncedAt).toLocaleString()}
                  </Text>
                ) : (
                  <Text style={[styles.rowSubText, { color: colors.textMuted }]}>Never synced</Text>
                )}
              </View>
            </View>
            {isSyncing ? <ActivityIndicator color={colors.primary} /> : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}
            onPress={handleLogout}
          >
            <View style={styles.rowLeft}>
              <LogOut color={colors.notification} size={20} />
              <Text style={[styles.rowText, { color: colors.notification }]}>Log Out</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>DATA & EXPORT</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.row} onPress={handleExport}>
            <View style={styles.rowLeft}>
              <Download color={colors.primary} size={20} />
              <Text style={[styles.rowText, { color: colors.text }]}>Export Call History</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={styles.rowLeft}>
              <Trash2 color={colors.notification} size={20} />
              <Text style={[styles.rowText, { color: colors.notification }]}>Clear App Data</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>APP INFO</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16, alignItems: 'center' }]}>
          <Text style={[styles.rowText, { color: colors.text, fontWeight: 'bold', fontSize: 18, marginLeft: 0 }]}>Sales Tracker</Text>
          <Text style={[styles.rowSubText, { color: colors.textMuted, marginLeft: 0, marginTop: 4 }]}>Version 1.0.0</Text>
          <Text style={[styles.rowSubText, { color: colors.textMuted, marginLeft: 0, marginTop: 4 }]}>Developer by Hotcoders@2026</Text>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 20,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowText: {
    fontSize: 16,
    marginLeft: 12,
  },
  rowSubText: {
    fontSize: 12,
    marginLeft: 12,
    marginTop: 2,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
