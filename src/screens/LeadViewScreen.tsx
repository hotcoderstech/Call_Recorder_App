import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Phone,
  MessageSquare,
  Calendar,
  FileText,
  Mail,
  Tag,
  X,
  PhoneCall,
} from 'lucide-react-native';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { RootStackParamList } from '../navigation/AppNavigator';
import { leadsApi, LeadDetails, LeadSummary, LeadActivityItem } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import {
  getContactMeta,
  setContactNotes,
  addReminder,
  getReminders,
  ReminderItem,
} from '../services/database';
import { fetchEnrichedCallHistory, EnrichedCallRecord } from '../services/callLog';

type Props = NativeStackScreenProps<RootStackParamList, 'LeadView'>;

const PIPELINE_STAGES = [
  'New',
  'Contact',
  'Qualified',
  'Won',
  'Loss',
];

// Backend stage codes (default pipeline) for each label shown in the app.
const STAGE_CODES: Record<string, string> = {
  New: 'NEW',
  Contact: 'CONTACTED',
  Qualified: 'QUALIFIED',
  Won: 'WON',
  Loss: 'LOST',
};

const stageLabelFromCode = (code?: string | null) =>
  PIPELINE_STAGES.find((label) => STAGE_CODES[label] === code);

const ACTIVE_STAGE = '#A21E33';
const LIGHT_STAGE = '#F4C2C9';

export default function LeadViewScreen({ route, navigation }: Props) {
  const { leadId, lead: initialLead } = route.params;
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [lead, setLead] = useState<LeadDetails | LeadSummary>(
    initialLead || {
      id: leadId,
      leadNumber: '',
      fullName: null,
      firstName: '',
      lastName: null,
      phone: '',
    }
  );
  const [loading, setLoading] = useState(!initialLead);
  const [refreshing, setRefreshing] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>('New');
  // stage label -> backend stage id
  const [stageIds, setStageIds] = useState<Record<string, string>>({});

  // Related calls & activities
  const [activities, setActivities] = useState<LeadActivityItem[]>([]);
  const [relatedCalls, setRelatedCalls] = useState<EnrichedCallRecord[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [notes, setNotes] = useState<string>('');

  // Note Modal
  const [noteModalVisible, setNoteModalVisible] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  // Follow-up Modal
  const [followUpModalVisible, setFollowUpModalVisible] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [followUpDays, setFollowUpDays] = useState<number>(1);

  const displayName =
    lead.fullName ||
    [lead.firstName, lead.lastName].filter(Boolean).join(' ') ||
    'Lead Details';

  const phoneNumber = lead.phone || '';
  const email = (lead as LeadDetails).email || '';
  const source = (lead as LeadDetails).source || '';
  const pipelineName = (lead as LeadDetails).pipeline?.name || '';

  const fetchLeadData = useCallback(async () => {
    try {
      if (leadId) {
        const details = await leadsApi.getById(leadId);
        if (details) {
          setLead(details);
          const label = stageLabelFromCode(details.stage?.code);
          if (label) setCurrentStage(label);
          if (details.pipelineId) {
            const stages = await leadsApi.getPipelineStages(details.pipelineId);
            const ids: Record<string, string> = {};
            for (const s of stages) {
              const l = stageLabelFromCode(s.code);
              if (l) ids[l] = s.id;
            }
            setStageIds(ids);
          }
          if (details.activities && details.activities.length > 0) {
            setActivities(details.activities);
          }
        }
      }
    } catch {
      // If backend details fails or route is not available, initial lead data is retained
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadId]);

  const loadLocalData = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      // Local meta & notes
      const meta = getContactMeta(phoneNumber);
      if (meta?.notes) {
        setNotes(meta.notes);
      }

      // Local reminders
      const allReminders = getReminders(true);
      const leadReminders = allReminders.filter((r) => r.phoneNumber === phoneNumber);
      setReminders(leadReminders);

      // Call logs for this lead
      const allCalls = await fetchEnrichedCallHistory();
      const cleanTarget = phoneNumber.replace(/[^0-9]/g, '').slice(-10);
      const matches = allCalls.filter((c) => {
        const cClean = (c.number || '').replace(/[^0-9]/g, '').slice(-10);
        return cClean && cleanTarget && cClean === cleanTarget;
      });
      setRelatedCalls(matches.slice(0, 5));
    } catch (err) {
      console.warn('Failed to load local lead details:', err);
    }
  }, [phoneNumber]);

  useEffect(() => {
    fetchLeadData();
    loadLocalData();
  }, [fetchLeadData, loadLocalData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeadData();
    loadLocalData();
  };

  const handleCall = () => {
    if (!phoneNumber) {
      Alert.alert('No Phone Number', 'This lead does not have a phone number.');
      return;
    }
    Linking.openURL(`tel:${phoneNumber}`).catch((err) => {
      console.error('Error opening dialer', err);
      Alert.alert('Error', 'Unable to open dialer.');
    });
  };

  const handleWhatsApp = () => {
    if (!phoneNumber) {
      Alert.alert('No Phone Number', 'This lead does not have a phone number.');
      return;
    }
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}`;
    Linking.openURL(url).catch((err) => {
      console.error('Error opening WhatsApp', err);
      Alert.alert('Error', 'WhatsApp is not installed or could not be opened.');
    });
  };

  const currentStageIndex = PIPELINE_STAGES.findIndex(
    (s) => s.toLowerCase() === currentStage.toLowerCase(),
  );

  const handleStageSelect = (stage: string) => {
    const targetIndex = PIPELINE_STAGES.indexOf(stage);
    if (targetIndex === currentStageIndex) return;

    if (targetIndex < currentStageIndex) {
      Toast.show({
        type: 'error',
        text1: 'Cannot move back',
        text2: `You can't move the lead to the previous stage (${stage}).`,
      });
      return;
    }

    if (targetIndex > currentStageIndex + 1) {
      Toast.show({
        type: 'error',
        text1: 'Cannot skip stages',
        text2: `Move to "${PIPELINE_STAGES[currentStageIndex + 1]}" first.`,
      });
      return;
    }

    Alert.alert(
      'Change stage',
      `Move this lead from "${currentStage}" to "${stage}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            const stageId = stageIds[stage];
            if (!stageId) {
              Toast.show({ type: 'error', text1: 'Update failed', text2: `"${stage}" stage not found in this pipeline.` });
              return;
            }
            const previousStage = currentStage;
            setCurrentStage(stage);
            try {
              await leadsApi.updateStage(leadId, stageId);
              Toast.show({ type: 'success', text1: 'Stage updated', text2: `Lead moved to ${stage}` });
            } catch {
              setCurrentStage(previousStage);
              Toast.show({ type: 'error', text1: 'Update failed', text2: 'Could not update the stage. Try again.' });
            }
          },
        },
      ],
    );
  };

  const handleSaveNote = () => {
    if (!noteInput.trim()) return;
    const newNote = notes ? `${notes}\n\n${noteInput.trim()}` : noteInput.trim();
    setNotes(newNote);
    if (phoneNumber) {
      setContactNotes(phoneNumber, displayName, newNote, null);
    }
    setNoteInput('');
    setNoteModalVisible(false);
  };

  const handleSaveFollowUp = () => {
    if (!followUpText.trim()) return;
    const targetDate = Date.now() + followUpDays * 24 * 60 * 60 * 1000;
    addReminder({
      phoneNumber: phoneNumber || 'N/A',
      contactName: displayName,
      reminderText: followUpText.trim(),
      reminderDate: targetDate,
      priority: 'high',
    });
    setFollowUpText('');
    setFollowUpModalVisible(false);
    loadLocalData();
    Alert.alert('Success', 'Follow-up scheduled successfully!');
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <ArrowLeft color={colors.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Phone & Top Action Pills */}
        <View style={styles.topActionSection}>
          <Text style={[styles.phoneSubheader, { color: colors.textMuted }]}>
            {phoneNumber || 'No phone number'}
          </Text>

          <View style={styles.actionPillsContainer}>
            {/* Call Pill */}
            <TouchableOpacity
              style={[styles.callPill, { backgroundColor: colors.primary }]}
              onPress={handleCall}
              activeOpacity={0.85}
            >
              <Phone color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
              <Text style={styles.callPillText}>Call</Text>
            </TouchableOpacity>

            {/* WhatsApp Pill */}
            <TouchableOpacity
              style={[
                styles.whatsappPill,
                {
                  backgroundColor: isDark ? '#064E3B' : '#F0FDF4',
                  borderColor: isDark ? '#059669' : '#86EFAC',
                },
              ]}
              onPress={handleWhatsApp}
              activeOpacity={0.85}
            >
              <MessageSquare
                color={isDark ? '#34D399' : '#16A34A'}
                size={18}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.whatsappPillText, { color: isDark ? '#34D399' : '#16A34A' }]}>
                WhatsApp
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Pipeline Stage Card */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={[styles.sectionSubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
            PIPELINE STAGE{pipelineName ? ` · ${pipelineName}` : ''}
          </Text>
        </View>

        <View style={[styles.pipelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.pipelineScroll}>
            {PIPELINE_STAGES.map((stage, idx) => {
              const isActive = idx === currentStageIndex;
              const isPast = idx < currentStageIndex;
              const lineColor = (reached: boolean) => (reached ? LIGHT_STAGE : colors.border);
              return (
                <TouchableOpacity
                  key={stage}
                  style={styles.stageItem}
                  onPress={() => handleStageSelect(stage)}
                  activeOpacity={0.7}
                >
                  <View style={styles.stageNodeContainer}>
                    <View
                      style={[
                        styles.stageLineLeft,
                        { backgroundColor: idx > 0 ? lineColor(idx <= currentStageIndex) : 'transparent' },
                      ]}
                    />
                    <View
                      style={[
                        styles.stageDot,
                        isActive
                          ? { backgroundColor: ACTIVE_STAGE, borderColor: ACTIVE_STAGE }
                          : isPast
                            ? { backgroundColor: LIGHT_STAGE, borderColor: LIGHT_STAGE }
                            : { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
                      {isActive && <View style={styles.innerDot} />}
                    </View>
                    <View
                      style={[
                        styles.stageLineRight,
                        {
                          backgroundColor:
                            idx < PIPELINE_STAGES.length - 1
                              ? lineColor(idx < currentStageIndex)
                              : 'transparent',
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.stageLabel,
                      { color: isActive ? ACTIVE_STAGE : colors.textMuted },
                      isActive && styles.stageLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {stage}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 4 Quick Action Circular Buttons */}
        <View style={styles.quickActionsRow}>
          {/* Call */}
          <View style={styles.quickActionCol}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: colors.primary }]}
              onPress={handleCall}
              activeOpacity={0.8}
            >
              <Phone color="#FFFFFF" size={22} />
            </TouchableOpacity>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>Call</Text>
          </View>

          {/* WhatsApp */}
          <View style={styles.quickActionCol}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: '#22C55E' }]}
              onPress={handleWhatsApp}
              activeOpacity={0.8}
            >
              <MessageSquare color="#FFFFFF" size={22} />
            </TouchableOpacity>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>WhatsApp</Text>
          </View>

          {/* Follow-up */}
          <View style={styles.quickActionCol}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: isDark ? '#BD2841' : '#8B1728' }]}
              onPress={() => setFollowUpModalVisible(true)}
              activeOpacity={0.8}
            >
              <Calendar color="#FFFFFF" size={22} />
            </TouchableOpacity>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>Follow-up</Text>
          </View>

          {/* Note */}
          <View style={styles.quickActionCol}>
            <TouchableOpacity
              style={[styles.quickActionButton, { backgroundColor: '#F59E0B' }]}
              onPress={() => setNoteModalVisible(true)}
              activeOpacity={0.8}
            >
              <FileText color="#FFFFFF" size={22} />
            </TouchableOpacity>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>Note</Text>
          </View>
        </View>

        {/* Lead Information Card */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={[styles.sectionSubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
            LEAD INFORMATION
          </Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Phone */}
          <TouchableOpacity style={styles.infoRow} onPress={handleCall} activeOpacity={0.7}>
            <View style={[styles.infoIconBox, { backgroundColor: isDark ? '#2D171C' : '#FDF2F4' }]}>
              <Phone color="#A21E33" size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Phone</Text>
              <Text style={[styles.infoFieldValue, { color: colors.text }]}>
                {phoneNumber || 'Not provided'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Email */}
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => email && Linking.openURL(`mailto:${email}`)}
            activeOpacity={0.7}
          >
            <View style={[styles.infoIconBox, { backgroundColor: isDark ? '#2D171C' : '#FDF2F4' }]}>
              <Mail color="#A21E33" size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Email</Text>
              <Text style={[styles.infoFieldValue, { color: colors.text }]}>{email || 'Not provided'}</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Source */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: isDark ? '#2D171C' : '#FDF2F4' }]}>
              <Tag color="#A21E33" size={18} />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={[styles.infoFieldLabel, { color: colors.textMuted }]}>Source</Text>
              <Text style={[styles.infoFieldValue, { color: colors.text }]}>{source || 'Not provided'}</Text>
            </View>
          </View>
        </View>

        {/* ACTIVITY Section */}
        <View style={styles.sectionHeaderContainer}>
          <Text style={[styles.sectionSubtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
            ACTIVITY
          </Text>
        </View>

        {/* Activity Items */}
        <View style={styles.activityContainer}>
          {/* Default/Server Activities */}
          {activities.length > 0 ? (
            activities.map((act) => (
              <View
                key={act.id}
                style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[styles.activityBadge, { backgroundColor: isDark ? '#2D171C' : '#FDF2F4' }]}>
                  <Tag color="#A21E33" size={16} />
                </View>
                <View style={styles.activityTextContainer}>
                  <Text style={[styles.activityTitle, { color: colors.text }]}>{act.title}</Text>
                  {act.description ? (
                    <Text style={[styles.activitySubtitle, { color: colors.textMuted }]}>
                      {act.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.activityTime, { color: colors.textMuted }]}>
                    {typeof act.timestamp === 'number'
                      ? format(new Date(act.timestamp), 'MMM d, h:mm a')
                      : act.timestamp}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View
              style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.activityBadge, { backgroundColor: isDark ? '#2D171C' : '#FDF2F4' }]}>
                <Tag color="#A21E33" size={16} />
              </View>
              <View style={styles.activityTextContainer}>
                <Text style={[styles.activityTitle, { color: colors.text }]}>Lead reassigned</Text>
                <Text style={[styles.activitySubtitle, { color: colors.textMuted }]}>
                  To: {displayName}
                </Text>
                <Text style={[styles.activityTime, { color: colors.textMuted }]}>
                  {format(new Date(), 'MMM d, h:mm a')}
                </Text>
              </View>
            </View>
          )}

          {/* Local Notes Activity */}
          {notes ? (
            <View
              style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.activityBadge, { backgroundColor: '#FEF3C7' }]}>
                <FileText color="#D97706" size={16} />
              </View>
              <View style={styles.activityTextContainer}>
                <Text style={[styles.activityTitle, { color: colors.text }]}>Notes</Text>
                <Text style={[styles.activitySubtitle, { color: colors.text }]}>{notes}</Text>
              </View>
            </View>
          ) : null}

          {/* Reminders / Follow-ups Activity */}
          {reminders.map((rem) => (
            <View
              key={rem.id}
              style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.activityBadge, { backgroundColor: '#DBEAFE' }]}>
                <Calendar color="#2563EB" size={16} />
              </View>
              <View style={styles.activityTextContainer}>
                <Text style={[styles.activityTitle, { color: colors.text }]}>Follow-up</Text>
                <Text style={[styles.activitySubtitle, { color: colors.textMuted }]}>
                  {rem.reminderText}
                </Text>
                <Text style={[styles.activityTime, { color: colors.textMuted }]}>
                  Due: {format(new Date(rem.reminderDate), 'MMM d, yyyy h:mm a')}
                </Text>
              </View>
            </View>
          ))}

          {/* Recent Call Logs for this lead */}
          {relatedCalls.map((call, idx) => (
            <View
              key={call.id || idx}
              style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View
                style={[
                  styles.activityBadge,
                  { backgroundColor: call.type === 2 ? '#E0F2FE' : '#DCFCE7' },
                ]}
              >
                <PhoneCall
                  color={call.type === 2 ? '#0284C7' : '#16A34A'}
                  size={16}
                />
              </View>
              <View style={styles.activityTextContainer}>
                <Text style={[styles.activityTitle, { color: colors.text }]}>
                  {call.type === 1 ? 'Incoming Call' : call.type === 2 ? 'Outgoing Call' : 'Missed Call'}
                </Text>
                <Text style={[styles.activitySubtitle, { color: colors.textMuted }]}>
                  Duration: {call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : '0s'}
                </Text>
                <Text style={[styles.activityTime, { color: colors.textMuted }]}>
                  {call.timestamp ? format(new Date(call.timestamp), 'MMM d, h:mm a') : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Note Modal */}
      <Modal
        visible={noteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Note</Text>
              <TouchableOpacity onPress={() => setNoteModalVisible(false)}>
                <X color={colors.text} size={22} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                styles.modalTextInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#1F2937' : '#F9FAFB' },
              ]}
              placeholder="Enter notes about this lead..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              value={noteInput}
              onChangeText={setNoteInput}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButtonCancel, { borderColor: colors.border }]}
                onPress={() => setNoteModalVisible(false)}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonSubmit, { backgroundColor: colors.primary }]}
                onPress={handleSaveNote}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Save Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Follow-up Modal */}
      <Modal
        visible={followUpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFollowUpModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Schedule Follow-up</Text>
              <TouchableOpacity onPress={() => setFollowUpModalVisible(false)}>
                <X color={colors.text} size={22} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                styles.modalTextInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? '#1F2937' : '#F9FAFB' },
              ]}
              placeholder="E.g., Call back to discuss proposal"
              placeholderTextColor={colors.textMuted}
              value={followUpText}
              onChangeText={setFollowUpText}
            />

            <Text style={[styles.modalFieldLabel, { color: colors.textMuted }]}>Remind in:</Text>
            <View style={styles.daysRow}>
              {[1, 2, 3, 7].map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.dayChip,
                    { borderColor: colors.border },
                    followUpDays === days && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setFollowUpDays(days)}
                >
                  <Text
                    style={[
                      styles.dayChipText,
                      { color: followUpDays === days ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {days === 1 ? 'Tomorrow' : `${days} Days`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButtonCancel, { borderColor: colors.border }]}
                onPress={() => setFollowUpModalVisible(false)}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButtonSubmit, { backgroundColor: colors.primary }]}
                onPress={handleSaveFollowUp}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginLeft: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  topActionSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  phoneSubheader: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 16,
  },
  actionPillsContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  callPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    shadowColor: '#A21E33',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  callPillText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  whatsappPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  whatsappPillText: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeaderContainer: {
    marginBottom: 8,
    marginTop: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pipelineCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  pipelineScroll: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  stageItem: {
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  stageNodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 24,
  },
  stageLineLeft: {
    flex: 1,
    height: 2,
  },
  stageLineRight: {
    flex: 1,
    height: 2,
  },
  stageDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  stageLabel: {
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },
  stageLabelActive: {
    fontWeight: '700',
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  quickActionCol: {
    alignItems: 'center',
  },
  quickActionButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoFieldLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  infoFieldValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  activityContainer: {
    gap: 12,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  activityBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  activityTextContainer: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 13,
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalTextInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  dayChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButtonCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalButtonSubmit: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
});
