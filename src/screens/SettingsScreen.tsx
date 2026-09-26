import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  Moon,
  Clock,
  User,
  FolderOpen,
  Calendar,
  RefreshCw,
  LogOut,
  Download,
  Trash2,
  ChevronRight,
  AlertCircle,
  X,
} from 'lucide-react-native';
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
    lastSyncError,
    setLastSyncError,
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
        try {
          await FileSystem.StorageAccessFramework.readDirectoryAsync(result.directoryUri);
        } catch {
          Alert.alert(
            'Wrong folder selected',
            "That folder (likely \"Downloads\") can't be scanned for recordings. Please pick the actual folder your phone saves call recordings to — browse into Internal Storage and look for a folder like \"Call\", \"Recordings\", or \"CallRecordings\", not the Downloads shortcut.",
          );
          return;
        }
        setRecordingsFolderUri(result.directoryUri);
        resetUploadedRecordings();
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
    if (result.recordingError) return `\n\nRecording sync error: ${result.recordingError}`;
    const d = result.recordingDiagnostics;
    if (!d) return '';
    const nameLine = d.lastUnmatchedFileName ? `\nUnmatched file example: ${d.lastUnmatchedFileName}` : '';
    return `\n\nRecording debug: ${d.filesInFolder} file(s) in folder, ${d.filesAlreadyHandled} already handled, ${d.candidatesWithDuration} connected call(s) considered, ${d.matchFailures} file(s) didn't match any call, ${d.uploadedCount} uploaded, ${d.alreadyInCrm} already in CRM.${nameLine}`;
  };

  const runSyncWithAlert = async () => {
    setIsSyncing(true);
    try {
      const result = await syncCallLogsToBackend();
      setLastSyncError(result.recordingError ?? null);
      const added = result.synced > 0 || result.recordingsSynced > 0;
      if (result.recordingError) {
        const addedLine = added ? `${result.synced} call(s) and ${result.recordingsSynced} call record(s) were added.\n\n` : '';
        Alert.alert('Sync failed', `${addedLine}${result.recordingError}`);
      } else if (added) {
        Alert.alert(
          'Successfully added',
          `${result.synced} call(s) and ${result.recordingsSynced} call record(s) added successfully.${formatRecordingDiag(result)}`,
        );
      } else {
        Alert.alert('Up to date', `Everything on this phone is already in the CRM.${formatRecordingDiag(result)}`);
      }
    } catch (err: any) {
      setLastSyncError(err.message || 'Could not sync call log.');
      Alert.alert('Sync failed', err.message || 'Could not sync call log.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncNow = runSyncWithAlert;

  const handlePickSyncFromDate = (event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (event.type !== 'set' || !date) {
      return;
    }
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    setSyncFromDate(normalized.getTime());
  };

  const handleSyncFromDate = runSyncWithAlert;

  const handleClearSyncFromDate = () => {
    clearSyncFromDate();
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Stop syncing and log out of this account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleExport = () => {
    Alert.alert('Export', 'Export functionality will generate a CSV or PDF file.');
  };

  const handleClearAppData = () => {
    Alert.alert(
      'Clear App Data',
      'Are you sure you want to reset app cache and sync state? You will not lose calls on your phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: () => {
            resetUploadedRecordings();
            Alert.alert('Success', 'Local sync cache has been reset.');
          },
        },
      ],
    );
  };

  // Reusable card & badge colors
  const cardBg = isDark ? '#1C1F26' : '#FFFFFF';
  const cardBorder = isDark ? '#2B3240' : '#EDF2F7';
  const dividerColor = isDark ? '#262D3D' : '#F1F5F9';
  const pinkBadgeBg = isDark ? '#311820' : '#FDF2F4';
  const tealBadgeBg = isDark ? '#132C28' : '#E6F7F5';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. APPEARANCE */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Dark Mode */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <Moon color="#A21E33" size={19} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={handleToggleTheme}
              trackColor={{
                false: isDark ? '#334155' : '#E2E8F0',
                true: isDark ? '#4A1D27' : '#FCE7EB',
              }}
              thumbColor={isDark ? (isDark ? '#E05B71' : '#94A3B8') : (isDark ? '#A21E33' : '#FFFFFF')}
              ios_backgroundColor={isDark ? '#334155' : '#E2E8F0'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Show Duration in List */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <Clock color="#A21E33" size={19} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Show Duration in List</Text>
            </View>
            <Switch
              value={showDuration}
              onValueChange={setShowDuration}
              trackColor={{
                false: isDark ? '#334155' : '#E2E8F0',
                true: isDark ? '#4A1D27' : '#FCE7EB',
              }}
              thumbColor={showDuration ? (isDark ? '#E05B71' : '#A21E33') : (isDark ? '#94A3B8' : '#FFFFFF')}
              ios_backgroundColor={isDark ? '#334155' : '#E2E8F0'}
            />
          </View>
        </View>
      </View>

      {/* 2. CRM SYNC */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>CRM SYNC</Text>

        {/* Warning Banner when recordings folder not set */}
        {!recordingsFolderUri ? (
          <View
            style={[
              styles.warningBanner,
              {
                backgroundColor: isDark ? '#2D171C' : '#FFF1F2',
                borderColor: isDark ? '#4A1E26' : '#FFE4E6',
              },
            ]}
          >
            <AlertCircle size={18} color="#E11D48" style={styles.warningIcon} />
            <Text
              style={[
                styles.warningText,
                { color: isDark ? '#FCA5A5' : '#881337' },
              ]}
            >
              Call Recordings Folder isn't set yet — answered calls won't sync until you pick it below.
            </Text>
          </View>
        ) : null}

        {/* Sync Error Banner if any */}
        {lastSyncError ? (
          <View
            style={[
              styles.warningBanner,
              {
                backgroundColor: isDark ? '#2D171C' : '#FFF1F2',
                borderColor: isDark ? '#4A1E26' : '#FFE4E6',
              },
            ]}
          >
            <AlertCircle size={18} color="#E11D48" style={styles.warningIcon} />
            <Text
              style={[
                styles.warningText,
                { color: isDark ? '#FCA5A5' : '#881337' },
              ]}
            >
              Last sync failed: {lastSyncError}
            </Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Salesperson Row */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <User color="#A21E33" size={19} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={[styles.rowTitleBold, { color: colors.text }]}>
                  {user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Salesperson 1'}
                </Text>
                <Text style={[styles.rowSubtitle, { color: '#64748B' }]}>
                  {currentOrg ? currentOrg.name : 'Demo Org'}
                </Text>
              </View>
            </View>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Automatic Sync */}
          <View style={styles.row}>
            <View style={[styles.rowLeft, { flex: 1, marginRight: 12 }]}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <Clock color="#A21E33" size={19} />
              </View>
              <View style={[styles.rowTextContainer, { flex: 1 }]}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Automatic Sync</Text>
                <Text style={[styles.rowSubtitle, { color: '#64748B' }]}>
                  On app open and every 10 minutes while open
                </Text>
              </View>
            </View>
            <Switch
              value={autoSyncEnabled}
              onValueChange={setAutoSyncEnabled}
              trackColor={{
                false: isDark ? '#334155' : '#E2E8F0',
                true: isDark ? '#4A1D27' : '#FCE7EB',
              }}
              thumbColor={autoSyncEnabled ? (isDark ? '#E05B71' : '#A21E33') : (isDark ? '#94A3B8' : '#FFFFFF')}
              ios_backgroundColor={isDark ? '#334155' : '#E2E8F0'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Call Recordings Folder */}
          <TouchableOpacity
            style={styles.row}
            onPress={handlePickRecordingsFolder}
            activeOpacity={0.7}
          >
            <View style={[styles.rowLeft, { flex: 1, marginRight: 8 }]}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <FolderOpen color="#A21E33" size={19} />
              </View>
              <View style={[styles.rowTextContainer, { flex: 1 }]}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Call Recordings Folder</Text>
                {recordingsFolderUri ? (
                  <Text style={[styles.rowSubtitle, { color: '#64748B' }]} numberOfLines={1}>
                    {decodeURIComponent(recordingsFolderUri.split('/').pop() || 'Selected')}
                  </Text>
                ) : (
                  <Text style={styles.notSetText}>Not set — tap to select</Text>
                )}
              </View>
            </View>
            <ChevronRight size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Sync From Date */}
          <View style={styles.syncDateBlock}>
            <Text style={[styles.rowTitleBold, { color: colors.text }]}>Sync From Date</Text>
            <Text style={[styles.rowSubtitle, { color: '#64748B', marginTop: 2, marginBottom: 12 }]}>
              Only sync calls on/after this date
            </Text>

            <View style={styles.datePickerRow}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <Calendar color="#A21E33" size={19} />
              </View>
              <TouchableOpacity
                style={[
                  styles.dateInputBox,
                  {
                    borderColor: isDark ? '#4A1D27' : '#F4C2C9',
                    backgroundColor: isDark ? '#261418' : '#FDF2F4',
                  },
                ]}
                onPress={() => setShowDatePicker(true)}
                disabled={isSyncing}
                activeOpacity={0.7}
              >
                <Calendar size={16} color="#A21E33" style={{ marginRight: 8 }} />
                <Text
                  style={{
                    color: syncFromDate ? colors.text : (isDark ? '#FCA5A5' : '#A21E33'),
                    fontSize: 13,
                    fontWeight: '500',
                  }}
                >
                  {syncFromDate ? formatDateInput(syncFromDate) : 'Select a date'}
                </Text>
              </TouchableOpacity>
            </View>

            {showDatePicker ? (
              <DateTimePicker
                value={syncFromDate ? new Date(syncFromDate) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={handlePickSyncFromDate}
              />
            ) : null}

            <View style={styles.dateButtonsRow}>
              <TouchableOpacity
                style={[styles.syncPillBtn, { opacity: isSyncing ? 0.7 : 1 }]}
                onPress={handleSyncFromDate}
                disabled={isSyncing}
                activeOpacity={0.8}
              >
                {isSyncing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <RefreshCw color="#fff" size={13} style={{ marginRight: 6 }} />
                )}
                <Text style={styles.syncPillText}>Sync</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.clearPillBtn,
                  {
                    backgroundColor: isDark ? '#261418' : '#FDF2F4',
                    borderColor: isDark ? '#4A1D27' : '#F4C2C9',
                    opacity: syncFromDate && !isSyncing ? 1 : 0.6,
                  },
                ]}
                onPress={handleClearSyncFromDate}
                disabled={!syncFromDate || isSyncing}
                activeOpacity={0.8}
              >
                <X color="#A21E33" size={13} style={{ marginRight: 4 }} />
                <Text style={[styles.clearPillText, { color: '#A21E33' }]}>
                  Clear
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Sync Call Logs Now */}
          <TouchableOpacity
            style={styles.row}
            onPress={handleSyncNow}
            disabled={isSyncing}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <RefreshCw color="#A21E33" size={19} />
              </View>
              <View style={styles.rowTextContainer}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Sync Call Logs Now</Text>
                <Text style={[styles.rowSubtitle, { color: '#64748B' }]}>
                  {lastSyncedAt
                    ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
                    : 'Never synced'}
                </Text>
              </View>
            </View>
            {isSyncing ? (
              <ActivityIndicator color="#A21E33" size="small" />
            ) : (
              <ChevronRight size={18} color="#94A3B8" />
            )}
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Log Out */}
          <TouchableOpacity
            style={styles.row}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <LogOut color="#A21E33" size={19} />
              </View>
              <Text style={styles.logoutText}>Log Out</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. DATA & EXPORT */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>DATA & EXPORT</Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Export Call History */}
          <TouchableOpacity style={styles.row} onPress={handleExport} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <Download color="#A21E33" size={19} />
              </View>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Export Call History</Text>
            </View>
            <ChevronRight size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: dividerColor }]} />

          {/* Clear App Data */}
          <TouchableOpacity style={styles.row} onPress={handleClearAppData} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: pinkBadgeBg }]}>
                <Trash2 color="#E11D48" size={19} />
              </View>
              <Text style={styles.clearDataText}>Clear App Data</Text>
            </View>
            <ChevronRight size={18} color="#E11D48" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. APP INFO */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>APP INFO</Text>
        <View
          style={[
            styles.card,
            styles.appInfoCard,
            { backgroundColor: cardBg, borderColor: cardBorder },
          ]}
        >
          <Image
            source={require('../../assets/fam-logo.png')}
            style={styles.appLogo}
            resizeMode="contain"
          />
          <Text style={[styles.appName, { color: colors.text }]}>FamInfo Sales</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appDeveloper}>Developed by Hotcoders@2026</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A94A6',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: {
        elevation: 1.5,
      },
    }),
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
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextContainer: {
    marginLeft: 12,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 12,
  },
  rowTitleBold: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  notSetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E11D48',
    marginTop: 2,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#A21E33',
    marginLeft: 12,
  },
  clearDataText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E11D48',
    marginLeft: 12,
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activeBadgeText: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  warningBanner: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningIcon: {
    marginTop: 1,
    marginRight: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  syncDateBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginLeft: 12,
  },
  dateButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginLeft: 52,
  },
  syncPillBtn: {
    backgroundColor: '#8B1728',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 20,
  },
  syncPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  clearPillBtn: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  clearPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  appInfoCard: {
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appLogo: {
    width: 140,
    height: 44,
    marginBottom: 6,
  },
  appName: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  appVersion: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  appDeveloper: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
});
