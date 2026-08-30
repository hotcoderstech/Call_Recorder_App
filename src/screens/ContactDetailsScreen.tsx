import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Linking, Alert, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { fetchEnrichedCallHistory, EnrichedCallRecord } from '../services/callLog';
import { leadsApi, LeadSummary } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import { ArrowLeft, PhoneIncoming, PhoneOutgoing, Clock, Phone, MessageSquare, Link2, Mic } from 'lucide-react-native';
import CallListItem from '../components/CallListItem';

type Props = NativeStackScreenProps<RootStackParamList, 'ContactDetails'>;

export default function ContactDetailsScreen({ route, navigation }: Props) {
  const { contactId, name } = route.params;
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [calls, setCalls] = useState<EnrichedCallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Link to Lead
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadResults, setLeadResults] = useState<LeadSummary[]>([]);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [linkingLeadId, setLinkingLeadId] = useState<string | null>(null);

  // Stats
  const [totalIncoming, setTotalIncoming] = useState(0);
  const [totalOutgoing, setTotalOutgoing] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0); // in seconds

  useEffect(() => {
    const loadDetails = async () => {
      const allCalls = await fetchEnrichedCallHistory();
      // Filter for this specific contact
      const contactCalls = allCalls.filter(call => call.number === contactId);
      
      let incoming = 0;
      let outgoing = 0;
      let duration = 0;

      contactCalls.forEach(call => {
        if (call.type === 1) incoming++; // INCOMING
        if (call.type === 2) outgoing++; // OUTGOING
        if (call.duration) duration += call.duration;
      });

      setCalls(contactCalls);
      setTotalIncoming(incoming);
      setTotalOutgoing(outgoing);
      setTotalDuration(duration);
      setLoading(false);
    };

    loadDetails();
  }, [contactId]);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  useEffect(() => {
    if (!linkModalVisible) return;
    setSearchingLeads(true);
    const timer = setTimeout(async () => {
      try {
        const results = await leadsApi.searchMine(leadSearch.trim());
        setLeadResults(results);
      } catch (err: any) {
        setLeadResults([]);
        const message = err?.response?.data?.error?.message || err.message || 'Could not load your leads.';
        Alert.alert('Search failed', message);
      } finally {
        setSearchingLeads(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [leadSearch, linkModalVisible]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const recordedCallCount = calls.filter((c) => c.recordingPath).length;

  const handleCall = () => {
    const url = `tel:${contactId}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Alert.alert('Error', 'Calling is not supported on this device');
    });
  };

  const handleSMS = () => {
    const url = `sms:${contactId}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Alert.alert('Error', 'Messaging is not supported on this device');
    });
  };

  const openLinkModal = () => {
    setLeadSearch('');
    setLeadResults([]);
    setLinkModalVisible(true);
  };

  const handleSelectLead = async (lead: LeadSummary) => {
    setLinkingLeadId(lead.id);
    try {
      const result = await leadsApi.linkAlternateNumber(lead.id, contactId);
      setLinkModalVisible(false);
      Alert.alert(
        'Linked to lead',
        `${contactId} is now linked to ${lead.fullName || lead.firstName}.` +
          (result.callsRelinked > 0 ? ` ${result.callsRelinked} past call(s) now show under this lead.` : ''),
      );
    } catch (err: any) {
      const message = err?.response?.data?.error?.message || err.message || 'Could not link this number.';
      Alert.alert('Link failed', message);
    } finally {
      setLinkingLeadId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Custom Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Contact Details</Text>
        <View style={{ width: 24 }} /> {/* Balance the header */}
      </View>

      {/* Profile Section */}
      <View style={styles.profileSection}>
        <View style={[styles.avatar, { backgroundColor: colors.border }]}>
          <Text style={[styles.avatarText, { color: colors.text }]}>{initial}</Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
        <Text style={[styles.number, { color: colors.textMuted }]}>{contactId}</Text>

        {recordedCallCount > 0 && (
          <View style={[styles.recordedBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Mic color={colors.primary} size={13} />
            <Text style={[styles.recordedBadgeText, { color: colors.primary }]}>
              {recordedCallCount} call{recordedCallCount > 1 ? 's' : ''} recorded
            </Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} 
            onPress={handleCall}
          >
            <Phone color={colors.primary} size={20} />
            <Text style={[styles.actionText, { color: colors.text }]}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleSMS}
          >
            <MessageSquare color={colors.primary} size={20} />
            <Text style={[styles.actionText, { color: colors.text }]}>SMS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={openLinkModal}
          >
            <Link2 color={colors.primary} size={20} />
            <Text style={[styles.actionText, { color: colors.text }]}>Link to Lead</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={linkModalVisible} animationType="slide" transparent onRequestClose={() => setLinkModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Link to Lead</Text>
              <TouchableOpacity onPress={() => setLinkModalVisible(false)}>
                <Text style={[styles.modalClose, { color: colors.textMuted }]}>Close</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Search your leads by name or company"
              placeholderTextColor={colors.textMuted}
              value={leadSearch}
              onChangeText={setLeadSearch}
              autoFocus
            />
            {searchingLeads ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
            ) : (
              <FlatList
                data={leadResults}
                keyExtractor={(item) => item.id}
                style={{ marginTop: 8, maxHeight: 320 }}
                ListEmptyComponent={
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                    No matching leads assigned to you.
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.leadRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleSelectLead(item)}
                    disabled={linkingLeadId !== null}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.leadName, { color: colors.text }]}>{item.fullName || item.firstName}</Text>
                      <Text style={[styles.leadPhone, { color: colors.textMuted }]}>{item.phone}</Text>
                    </View>
                    {linkingLeadId === item.id ? <ActivityIndicator color={colors.primary} /> : null}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Analytics Cards */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PhoneIncoming color={colors.incoming} size={20} />
          <Text style={[styles.statValue, { color: colors.text }]}>{totalIncoming}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Incoming</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PhoneOutgoing color={colors.outgoing} size={20} />
          <Text style={[styles.statValue, { color: colors.text }]}>{totalOutgoing}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Outgoing</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Clock color={colors.primary} size={20} />
          <Text style={[styles.statValue, { color: colors.text }]}>{formatDuration(totalDuration)}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Talk Time</Text>
        </View>
      </View>

      {/* History List */}
      <View style={styles.historyHeader}>
        <Text style={[styles.historyTitle, { color: colors.text }]}>Call History</Text>
      </View>
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CallListItem call={item} onPress={() => {}} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  number: {
    fontSize: 16,
  },
  recordedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  recordedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
  },
  historyHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalClose: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leadName: {
    fontSize: 16,
    fontWeight: '600',
  },
  leadPhone: {
    fontSize: 13,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 14,
  },
});
