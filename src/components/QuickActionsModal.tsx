import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Linking,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import {
  Phone,
  BarChart2,
  RefreshCw,
  Users,
  X,
  Sparkles,
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { syncCallLogsToBackend } from '../services/sync';
import Toast from 'react-native-toast-message';

interface QuickActionsModalProps {
  visible: boolean;
  onClose: () => void;
  navigation: any;
}

export default function QuickActionsModal({ visible, onClose, navigation }: QuickActionsModalProps) {
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [isSyncing, setIsSyncing] = useState(false);

  const handleQuickCall = () => {
    onClose();
    Linking.openURL('tel:').catch((err) => {
      console.error('Failed to open dialer', err);
      Toast.show({
        type: 'error',
        text1: 'Dialer Error',
        text2: 'Could not open phone dialer.',
      });
    });
  };

  const handleOpenAnalytics = () => {
    onClose();
    navigation.navigate('Analytics');
  };

  const handleOpenLeads = () => {
    onClose();
    navigation.navigate('Leads');
  };

  const handleSyncLogs = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await syncCallLogsToBackend();
      Toast.show({
        type: res.recordingError ? 'info' : 'success',
        text1: res.recordingError ? 'Sync Notice' : 'Sync Complete',
        text2: res.recordingError
          ? `Synced ${res.synced} calls (${res.recordingError})`
          : `Synced ${res.synced} calls (${res.recordingsSynced || 0} recordings)`,
      });
      onClose();
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Sync Error',
        text2: e?.message || 'Failed to sync call logs',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheetContainer,
                {
                  backgroundColor: isDark ? '#1E232A' : '#FFFFFF',
                  borderColor: isDark ? '#2D3748' : '#F1F5F9',
                },
              ]}
            >
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.titleBadge}>
                  <View style={styles.purpleDot} />
                  <Text style={[styles.headerTitle, { color: colors.text }]}>Quick Actions</Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={[
                    styles.closeButton,
                    { backgroundColor: isDark ? '#2D3748' : '#F3F4F6' },
                  ]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={18} color={isDark ? '#E2E8F0' : '#4B5563'} />
                </TouchableOpacity>
              </View>

              {/* Action Grid / List */}
              <View style={styles.actionsContainer}>
                {/* Quick Call */}
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: isDark ? '#141A21' : '#F8FAFC',
                      borderColor: isDark ? '#283141' : '#EDF2F7',
                    },
                  ]}
                  onPress={handleQuickCall}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
                    <Phone size={22} color="#059669" />
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={[styles.actionTitle, { color: colors.text }]}>Quick Call</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>
                      Open device dialer to make a call
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Call Analytics */}
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: isDark ? '#141A21' : '#F8FAFC',
                      borderColor: isDark ? '#283141' : '#EDF2F7',
                    },
                  ]}
                  onPress={handleOpenAnalytics}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
                    <BarChart2 size={22} color="#2563EB" />
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={[styles.actionTitle, { color: colors.text }]}>Call Analytics</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>
                      View inbound/outbound call statistics
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Sync Call Logs & Recordings */}
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: isDark ? '#141A21' : '#F8FAFC',
                      borderColor: isDark ? '#283141' : '#EDF2F7',
                    },
                  ]}
                  onPress={handleSyncLogs}
                  disabled={isSyncing}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, { backgroundColor: '#F5F3FF' }]}>
                    {isSyncing ? (
                      <ActivityIndicator size="small" color="#7C3AED" />
                    ) : (
                      <RefreshCw size={22} color="#7C3AED" />
                    )}
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={[styles.actionTitle, { color: colors.text }]}>
                      {isSyncing ? 'Syncing Logs...' : 'Sync Logs & Audio'}
                    </Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>
                      Upload recent call logs & recordings
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Leads */}
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: isDark ? '#141A21' : '#F8FAFC',
                      borderColor: isDark ? '#283141' : '#EDF2F7',
                    },
                  ]}
                  onPress={handleOpenLeads}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
                    <Users size={22} color="#D97706" />
                  </View>
                  <View style={styles.actionTextContainer}>
                    <Text style={[styles.actionTitle, { color: colors.text }]}>Leads</Text>
                    <Text style={[styles.actionSub, { color: colors.textMuted }]}>
                      Manage customer leads and contacts
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  purpleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#A21E33',
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsContainer: {
    gap: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  actionSub: {
    fontSize: 12,
  },
});
