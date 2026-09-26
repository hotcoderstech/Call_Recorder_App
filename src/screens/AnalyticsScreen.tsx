import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Platform,
  useColorScheme,
  TextStyle,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { fetchEnrichedCallHistory } from '../services/callLog';
import { leadsApi, callsApi, LeadSummary } from '../services/api';
import { PieChart, BarChart, LineChart } from 'react-native-gifted-charts';
import {
  ChevronDown,
  PhoneCall,
  Calendar,
  CalendarDays,
  Clock,
  History,
  Check,
  X,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CONTACT_PALETTES = [
  { bg: '#FCE7EB', text: '#991B1B' },
  { bg: '#E0F2FE', text: '#0284C7' },
  { bg: '#D1FAE5', text: '#059669' },
  { bg: '#FEF3C7', text: '#D97706' },
  { bg: '#EDE9FE', text: '#7C3AED' },
];

export type PeriodType = 'Yearly' | 'Monthly' | 'Weekly' | 'All Time';

interface LeadCallItem {
  id: string;
  leadId: string;
  leadName: string;
  leadNumber?: string;
  phoneNumber: string;
  type: number; // 1: Incoming, 2: Outgoing, 3: Missed
  timestamp: number;
  durationSeconds: number;
}

export default function AnalyticsScreen() {
  const navigation = useNavigation<any>();
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [leadCalls, setLeadCalls] = useState<LeadCallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('Yearly');
  const [periodModalVisible, setPeriodModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch user's assigned leads from CRM
      const userLeads = await leadsApi.getAllMyLeads();

      const leadPhoneMap = new Map<string, LeadSummary>();
      userLeads.forEach((l) => {
        if (l.phone) {
          const clean = l.phone.replace(/[^0-9]/g, '').slice(-10);
          if (clean) leadPhoneMap.set(clean, l);
        }
      });

      // 2. Fetch device calls and server calls
      const [deviceCalls, serverCalls] = await Promise.all([
        fetchEnrichedCallHistory(),
        callsApi.getCalls(),
      ]);

      const leadCallList: LeadCallItem[] = [];
      const seen = new Set<string>();

      // A) Include device calls that strictly belong to a lead
      deviceCalls.forEach((dc) => {
        if (!dc.timestamp) return;
        const clean = (dc.number || '').replace(/[^0-9]/g, '').slice(-10);
        if (clean && leadPhoneMap.has(clean)) {
          const lead = leadPhoneMap.get(clean)!;
          const leadName =
            lead.fullName ||
            `${lead.firstName || ''} ${lead.lastName || ''}`.trim() ||
            lead.phone;
          const key = `${clean}-${Math.round(dc.timestamp / 5000)}`;
          if (!seen.has(key)) {
            seen.add(key);
            leadCallList.push({
              id: dc.id,
              leadId: lead.id,
              leadName,
              leadNumber: lead.leadNumber,
              phoneNumber: dc.number || clean,
              type: dc.type ?? 2,
              timestamp: dc.timestamp,
              durationSeconds: dc.duration || 0,
            });
          }
        }
      });

      // B) Include server calls (all server calls are verified lead calls)
      serverCalls.forEach((sc: any) => {
        const clean = (sc.phoneNumber || '').replace(/[^0-9]/g, '').slice(-10);
        const startedTime = sc.startedAt ? new Date(sc.startedAt).getTime() : 0;
        const key = `${clean}-${Math.round(startedTime / 5000)}`;

        if (!seen.has(key)) {
          seen.add(key);
          let type = 2; // Outgoing default
          if (sc.direction === 'INBOUND') {
            type = sc.status === 'MISSED' || sc.status === 'FAILED' ? 3 : 1;
          } else {
            type = sc.status === 'MISSED' || sc.status === 'FAILED' ? 3 : 2;
          }

          const leadObj = sc.lead || (clean ? leadPhoneMap.get(clean) : null);
          const leadName = leadObj
            ? leadObj.fullName || `${leadObj.firstName || ''} ${leadObj.lastName || ''}`.trim() || sc.phoneNumber
            : sc.phoneNumber;

          leadCallList.push({
            id: sc.id,
            leadId: sc.leadId || (leadObj ? leadObj.id : ''),
            leadName,
            phoneNumber: sc.phoneNumber,
            type,
            timestamp: startedTime,
            durationSeconds: sc.durationSeconds || 0,
          });
        }
      });

      setLeadCalls(leadCallList);
    } catch (e) {
      console.error('Failed to load lead analytics:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
  }, [loadData]);

  // Overall lead call metrics
  const totalCalls = leadCalls.length;
  const incoming = leadCalls.filter((c) => c.type === 1).length;
  const outgoing = leadCalls.filter((c) => c.type === 2).length;
  const missed = leadCalls.filter((c) => c.type === 3).length;

  const incomingPct = totalCalls > 0 ? Math.round((incoming / totalCalls) * 100) : 0;
  const outgoingPct = totalCalls > 0 ? Math.round((outgoing / totalCalls) * 100) : 0;
  const missedPct = totalCalls > 0 ? Math.max(0, 100 - incomingPct - outgoingPct) : 0;

  // Period-based stats calculation for Call Monitoring
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  let periodSubtitle = 'Total calls categorized by month';
  let kpiAvgLabel = 'Avg/Mo';
  let kpiPeakLabel = 'Peak Month';
  let periodCallsCount = 0;
  let avgValue = 0;
  let peakString = '-';

  let barData: Array<{
    value: number;
    label: string;
    frontColor: string;
    gradientColor: string;
    labelTextStyle: {
      color: string;
      fontWeight: TextStyle['fontWeight'];
      fontSize: number;
    };
  }> = [];

  if (selectedPeriod === 'Yearly') {
    periodSubtitle = 'Total calls categorized by month';
    kpiAvgLabel = 'Avg/Mo';
    kpiPeakLabel = 'Peak Month';

    const monthlyCounts = Array(12).fill(0);
    leadCalls.forEach((c) => {
      const d = new Date(c.timestamp);
      if (d.getFullYear() === currentYear) {
        monthlyCounts[d.getMonth()] += 1;
        periodCallsCount += 1;
      }
    });

    avgValue = Math.round(periodCallsCount / 12);
    let peakIdx = currentMonthIdx;
    let maxVal = 0;
    monthlyCounts.forEach((cnt, idx) => {
      if (cnt > maxVal) {
        maxVal = cnt;
        peakIdx = idx;
      }
    });
    peakString = maxVal > 0 ? `${MONTH_NAMES[peakIdx]} (${maxVal})` : '-';

    barData = MONTH_NAMES.map((name, idx) => {
      const isCurrent = idx === currentMonthIdx;
      const val = monthlyCounts[idx];
      return {
        value: val,
        label: name,
        frontColor: val > 0 ? (isCurrent ? '#A21E33' : '#FCA5A5') : (isDark ? '#2B3240' : '#E2E8F0'),
        gradientColor: val > 0 ? (isCurrent ? '#881326' : '#F87171') : (isDark ? '#2B3240' : '#E2E8F0'),
        labelTextStyle: {
          color: isCurrent ? (isDark ? '#FFFFFF' : '#111827') : '#94A3B8',
          fontWeight: (isCurrent ? '800' : '500') as TextStyle['fontWeight'],
          fontSize: 10,
        },
      };
    });
  } else if (selectedPeriod === 'Monthly') {
    periodSubtitle = 'Total calls categorized by week';
    kpiAvgLabel = 'Avg/Wk';
    kpiPeakLabel = 'Peak Week';

    const weekCounts = [0, 0, 0, 0, 0];
    const currentWeekIdx = Math.min(Math.floor((now.getDate() - 1) / 7), 4);

    leadCalls.forEach((c) => {
      const d = new Date(c.timestamp);
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonthIdx) {
        const weekIdx = Math.min(Math.floor((d.getDate() - 1) / 7), 4);
        weekCounts[weekIdx] += 1;
        periodCallsCount += 1;
      }
    });

    avgValue = Math.round(periodCallsCount / 4);
    let peakIdx = currentWeekIdx;
    let maxVal = 0;
    weekCounts.forEach((cnt, idx) => {
      if (cnt > maxVal) {
        maxVal = cnt;
        peakIdx = idx;
      }
    });
    peakString = maxVal > 0 ? `Week ${peakIdx + 1} (${maxVal})` : '-';

    const weekLabels = ['W1 (1-7)', 'W2 (8-14)', 'W3 (15-21)', 'W4 (22-28)', 'W5 (29+)'];
    barData = weekLabels.map((name, idx) => {
      const isCurrent = idx === currentWeekIdx;
      const val = weekCounts[idx];
      return {
        value: val,
        label: name.split(' ')[0],
        frontColor: val > 0 ? (isCurrent ? '#A21E33' : '#FCA5A5') : (isDark ? '#2B3240' : '#E2E8F0'),
        gradientColor: val > 0 ? (isCurrent ? '#881326' : '#F87171') : (isDark ? '#2B3240' : '#E2E8F0'),
        labelTextStyle: {
          color: isCurrent ? (isDark ? '#FFFFFF' : '#111827') : '#94A3B8',
          fontWeight: (isCurrent ? '800' : '500') as TextStyle['fontWeight'],
          fontSize: 10,
        },
      };
    });
  } else if (selectedPeriod === 'Weekly') {
    periodSubtitle = 'Total calls categorized by day (Last 7 Days)';
    kpiAvgLabel = 'Avg/Day';
    kpiPeakLabel = 'Peak Day';

    const dayLabels: string[] = [];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (let i = 6; i >= 0; i--) {
      const dayDate = new Date();
      dayDate.setDate(dayDate.getDate() - i);
      dayLabels.push(DAY_ABBR[dayDate.getDay()]);
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    leadCalls.forEach((c) => {
      const d = new Date(c.timestamp);
      if (d >= sevenDaysAgo) {
        const diffTime = d.getTime() - sevenDaysAgo.getTime();
        const dayIdx = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (dayIdx >= 0 && dayIdx < 7) {
          dayCounts[dayIdx] += 1;
          periodCallsCount += 1;
        }
      }
    });

    avgValue = Math.round(periodCallsCount / 7);
    let peakIdx = 6; // today
    let maxVal = 0;
    dayCounts.forEach((cnt, idx) => {
      if (cnt > maxVal) {
        maxVal = cnt;
        peakIdx = idx;
      }
    });
    peakString = maxVal > 0 ? `${dayLabels[peakIdx]} (${maxVal})` : '-';

    barData = dayLabels.map((name, idx) => {
      const isCurrent = idx === 6;
      const val = dayCounts[idx];
      return {
        value: val,
        label: name,
        frontColor: val > 0 ? (isCurrent ? '#A21E33' : '#FCA5A5') : (isDark ? '#2B3240' : '#E2E8F0'),
        gradientColor: val > 0 ? (isCurrent ? '#881326' : '#F87171') : (isDark ? '#2B3240' : '#E2E8F0'),
        labelTextStyle: {
          color: isCurrent ? (isDark ? '#FFFFFF' : '#111827') : '#94A3B8',
          fontWeight: (isCurrent ? '800' : '500') as TextStyle['fontWeight'],
          fontSize: 10,
        },
      };
    });
  } else {
    // 'All Time'
    periodSubtitle = 'Total calls categorized by month (All Time)';
    kpiAvgLabel = 'Avg/Mo';
    kpiPeakLabel = 'Peak Month';

    const monthlyCounts = Array(12).fill(0);
    leadCalls.forEach((c) => {
      const d = new Date(c.timestamp);
      monthlyCounts[d.getMonth()] += 1;
      periodCallsCount += 1;
    });

    avgValue = Math.round(periodCallsCount / 12);
    let peakIdx = currentMonthIdx;
    let maxVal = 0;
    monthlyCounts.forEach((cnt, idx) => {
      if (cnt > maxVal) {
        maxVal = cnt;
        peakIdx = idx;
      }
    });
    peakString = maxVal > 0 ? `${MONTH_NAMES[peakIdx]} (${maxVal})` : '-';

    barData = MONTH_NAMES.map((name, idx) => {
      const isCurrent = idx === currentMonthIdx;
      const val = monthlyCounts[idx];
      return {
        value: val,
        label: name,
        frontColor: val > 0 ? (isCurrent ? '#A21E33' : '#FCA5A5') : (isDark ? '#2B3240' : '#E2E8F0'),
        gradientColor: val > 0 ? (isCurrent ? '#881326' : '#F87171') : (isDark ? '#2B3240' : '#E2E8F0'),
        labelTextStyle: {
          color: isCurrent ? (isDark ? '#FFFFFF' : '#111827') : '#94A3B8',
          fontWeight: (isCurrent ? '800' : '500') as TextStyle['fontWeight'],
          fontSize: 10,
        },
      };
    });
  }

  // Dynamic bar chart layout
  const maxBarVal = Math.max(...barData.map((b) => b.value), 5);
  const chartMaxValue = Math.ceil(maxBarVal * 1.25);
  const numBars = barData.length;
  const availableWidth = width - 110;
  const barWidth = numBars <= 5 ? 24 : numBars <= 7 ? 18 : 12;
  const calculatedSpacing = Math.max(8, Math.floor((availableWidth - numBars * barWidth) / numBars));
  const initialSpacing = Math.max(8, Math.floor(calculatedSpacing / 2));

  // Donut data for Call Distribution
  const pieData =
    totalCalls > 0
      ? [
          { value: incoming || 0.001, color: '#10B981' },
          { value: outgoing || 0.001, color: '#9E1B32' },
          { value: missed || 0.001, color: '#EF4444' },
        ]
      : [{ value: 1, color: isDark ? '#2B3240' : '#E2E8F0' }];

  // Top Contacts strictly from Leads
  const leadCallCountMap = new Map<string, { leadId: string; name: string; count: number; leadNumber?: string }>();

  leadCalls.forEach((c) => {
    const key = c.leadId || c.phoneNumber;
    const existing = leadCallCountMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      leadCallCountMap.set(key, {
        leadId: c.leadId,
        name: c.leadName,
        count: 1,
        leadNumber: c.leadNumber,
      });
    }
  });

  const topLeads = Array.from(leadCallCountMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c, idx) => ({
      ...c,
      avatarBg: CONTACT_PALETTES[idx % CONTACT_PALETTES.length].bg,
      avatarText: CONTACT_PALETTES[idx % CONTACT_PALETTES.length].text,
    }));

  const maxLeadCount = Math.max(...topLeads.map((c) => c.count), 5);
  const topLeadsLineData = topLeads.map((c) => ({
    value: c.count,
    label: c.name.length > 5 ? c.name.slice(0, 4) + '..' : c.name,
    labelTextStyle: { color: isDark ? '#94A3B8' : '#334155', fontSize: 10, fontWeight: '600' as const },
  }));

  const cardBg = isDark ? '#1C1F26' : '#FFFFFF';
  const cardBorder = isDark ? '#2B3240' : '#EDF2F7';
  const kpiBoxBg = isDark ? '#161920' : '#F8FAFC';

  if (loading && leadCalls.length === 0) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#A21E33" />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading lead analytics...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#A21E33']}
          tintColor="#A21E33"
        />
      }
    >
      {/* 1. CALL MONITORING CARD */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {/* Header */}
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Call Monitoring</Text>
            <Text style={styles.cardSubtitle}>{periodSubtitle}</Text>
          </View>
          <TouchableOpacity
            style={[styles.dropdownBtn, { backgroundColor: isDark ? '#2B3240' : '#F1F5F9' }]}
            onPress={() => setPeriodModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.dropdownText, { color: isDark ? '#ECEDEE' : '#334155' }]}>
              {selectedPeriod}
            </Text>
            <ChevronDown size={14} color={isDark ? '#ECEDEE' : '#64748B'} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        {/* KPI Strip */}
        <View style={[styles.kpiStrip, { backgroundColor: kpiBoxBg, borderColor: isDark ? '#2B3240' : '#F1F5F9' }]}>
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>Total</Text>
            <Text style={[styles.kpiValue, { color: colors.text }]}>{periodCallsCount.toLocaleString()}</Text>
          </View>
          <View style={[styles.kpiDivider, { backgroundColor: isDark ? '#2B3240' : '#E2E8F0' }]} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>{kpiAvgLabel}</Text>
            <Text style={[styles.kpiValue, { color: colors.text }]}>{avgValue.toLocaleString()}</Text>
          </View>
          <View style={[styles.kpiDivider, { backgroundColor: isDark ? '#2B3240' : '#E2E8F0' }]} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>{kpiPeakLabel}</Text>
            <Text style={[styles.kpiValue, { color: '#A21E33' }]}>{peakString}</Text>
          </View>
        </View>

        {/* Bar Chart */}
        <View style={styles.chartWrapper}>
          <BarChart
            data={barData}
            barWidth={barWidth}
            spacing={calculatedSpacing}
            initialSpacing={initialSpacing}
            roundedTop
            roundedBottom
            hideRules={false}
            rulesType="dashed"
            rulesColor={isDark ? '#2B3240' : '#F1F5F9'}
            xAxisThickness={0}
            yAxisThickness={0}
            yAxisTextStyle={{ color: '#94A3B8', fontSize: 10 }}
            noOfSections={4}
            maxValue={chartMaxValue}
            width={width - 86}
            height={130}
          />
        </View>
      </View>

      {/* 2. CALL DISTRIBUTION CARD */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {/* Header */}
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Call Distribution</Text>
          <View style={styles.allTimeBadge}>
            <Text style={styles.allTimeText}>All Time</Text>
          </View>
        </View>

        {/* Donut Chart with Center Total */}
        <View style={styles.donutWrapper}>
          <PieChart
            data={pieData}
            donut
            radius={92}
            innerRadius={64}
            centerLabelComponent={() => (
              <View style={styles.donutCenter}>
                <Text style={styles.donutCenterSub}>TOTAL</Text>
                <Text style={[styles.donutCenterNumber, { color: colors.text }]}>
                  {totalCalls.toLocaleString()}
                </Text>
                <Text style={styles.donutCenterSub}>Calls</Text>
              </View>
            )}
          />
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          {/* Incoming */}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
            <View>
              <Text style={styles.legendLabel}>Incoming</Text>
              <Text style={[styles.legendNumber, { color: colors.text }]}>
                {incoming.toLocaleString()}{' '}
                <Text style={styles.legendPercent}>({incomingPct}%)</Text>
              </Text>
            </View>
          </View>

          {/* Outgoing */}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#9E1B32' }]} />
            <View>
              <Text style={styles.legendLabel}>Outgoing</Text>
              <Text style={[styles.legendNumber, { color: colors.text }]}>
                {outgoing.toLocaleString()}{' '}
                <Text style={styles.legendPercent}>({outgoingPct}%)</Text>
              </Text>
            </View>
          </View>

          {/* Missed */}
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <View>
              <Text style={styles.legendLabel}>Missed</Text>
              <Text style={[styles.legendNumber, { color: colors.text }]}>
                {missed.toLocaleString()}{' '}
                <Text style={styles.legendPercent}>({missedPct}%)</Text>
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 3. TOP CONTACTS (TOP LEADS) CARD */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {/* Header */}
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Top Contacts</Text>
            <Text style={styles.cardSubtitle}>Most frequent inbound & outbound connections</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Leads' as any)}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        {topLeads.length > 0 ? (
          <>
            {/* Contacts Trend Chart */}
            <View style={styles.chartWrapper}>
              <LineChart
                data={topLeadsLineData}
                height={110}
                width={width - 86}
                initialSpacing={18}
                spacing={topLeads.length > 1 ? (width - 130) / (topLeads.length - 1) : 40}
                color="#A21E33"
                thickness={2.2}
                startFillColor="#FDF2F4"
                endFillColor={cardBg}
                startOpacity={0.6}
                endOpacity={0.02}
                areaChart
                curved
                hideRules={false}
                rulesType="dashed"
                rulesColor={isDark ? '#2B3240' : '#F1F5F9'}
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: '#94A3B8', fontSize: 10 }}
                noOfSections={4}
                maxValue={Math.ceil(maxLeadCount * 1.2)}
                dataPointsColor="#A21E33"
                dataPointsRadius={4}
              />
            </View>

            {/* Contact List (Top Leads) */}
            <View style={styles.contactsList}>
              {topLeads.map((contact, idx) => (
                <TouchableOpacity
                  key={contact.leadId || contact.name + idx}
                  style={[
                    styles.contactRow,
                    idx > 0 && [styles.contactRowBorder, { borderTopColor: isDark ? '#262D3D' : '#F8FAFC' }],
                  ]}
                  onPress={() => {
                    if (contact.leadId) {
                      navigation.navigate('LeadView', { leadId: contact.leadId });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.contactRowLeft}>
                    <View
                      style={[
                        styles.contactAvatar,
                        { backgroundColor: isDark ? '#2A2024' : contact.avatarBg },
                      ]}
                    >
                      <Text style={[styles.contactAvatarText, { color: contact.avatarText }]}>
                        {contact.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactName, { color: colors.text }]} numberOfLines={1}>
                        {contact.name}
                      </Text>
                      {contact.leadNumber ? (
                        <Text style={[styles.leadNumberBadge, { color: colors.textMuted }]}>
                          #{contact.leadNumber}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={[styles.contactCalls, { color: colors.text }]}>
                    {contact.count.toLocaleString()} calls
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <PhoneCall size={28} color="#94A3B8" />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No calls recorded with your leads yet
            </Text>
          </View>
        )}
      </View>

      {/* DROPDOWN TIMEFRAME SELECTOR MODAL */}
      <Modal
        visible={periodModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setPeriodModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={[styles.modalTitle, { color: colors.text }]}>Select Timeframe</Text>
                    <Text style={styles.modalSubtitle}>Choose period for Call Monitoring</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPeriodModalVisible(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={20} color={isDark ? '#94A3B8' : '#64748B'} />
                  </TouchableOpacity>
                </View>

                <View style={styles.optionsList}>
                  {[
                    { key: 'Yearly' as PeriodType, title: 'Yearly', subtitle: 'Current Year (12 Months)', icon: Calendar },
                    { key: 'Monthly' as PeriodType, title: 'Monthly', subtitle: 'Current Month (By Weeks)', icon: CalendarDays },
                    { key: 'Weekly' as PeriodType, title: 'Weekly', subtitle: 'Last 7 Days (Daily)', icon: Clock },
                    { key: 'All Time' as PeriodType, title: 'All Time', subtitle: 'All Recorded Call History', icon: History },
                  ].map((option, idx) => {
                    const isSelected = selectedPeriod === option.key;
                    const IconComponent = option.icon;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.optionRow,
                          idx > 0 && [styles.optionBorder, { borderTopColor: isDark ? '#262D3D' : '#F1F5F9' }],
                          isSelected && { backgroundColor: isDark ? '#2D1B22' : '#FDF2F4', borderRadius: 12 },
                        ]}
                        onPress={() => {
                          setSelectedPeriod(option.key);
                          setPeriodModalVisible(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.optionLeft}>
                          <View
                            style={[
                              styles.optionIconContainer,
                              {
                                backgroundColor: isSelected
                                  ? '#A21E33'
                                  : isDark
                                  ? '#262D3D'
                                  : '#F1F5F9',
                              },
                            ]}
                          >
                            <IconComponent
                              size={18}
                              color={isSelected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                            />
                          </View>
                          <View style={{ marginLeft: 12 }}>
                            <Text style={[styles.optionTitle, { color: isSelected ? '#A21E33' : colors.text }]}>
                              {option.title}
                            </Text>
                            <Text style={[styles.optionSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                              {option.subtitle}
                            </Text>
                          </View>
                        </View>
                        {isSelected ? (
                          <View style={styles.checkCircle}>
                            <Check size={16} color="#A21E33" strokeWidth={2.5} />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dropdownText: {
    fontSize: 12,
    fontWeight: '700',
  },
  kpiStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 16,
  },
  kpiCol: {
    alignItems: 'center',
    flex: 1,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  kpiDivider: {
    width: 1,
    height: 24,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginLeft: -10,
  },
  allTimeBadge: {
    backgroundColor: '#FDF2F4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  allTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A21E33',
  },
  donutWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  donutCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  donutCenterNumber: {
    fontSize: 20,
    fontWeight: '800',
    marginVertical: 1,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 18,
    paddingTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
    marginTop: 3,
  },
  legendLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  legendNumber: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  legendPercent: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A21E33',
  },
  contactsList: {
    marginTop: 14,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  contactRowBorder: {
    borderTopWidth: 1,
  },
  contactRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  contactAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    fontSize: 13,
    fontWeight: '800',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '700',
  },
  leadNumberBadge: {
    fontSize: 11,
    marginTop: 1,
  },
  contactCalls: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 8,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  optionsList: {
    marginTop: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  optionBorder: {
    borderTopWidth: 1,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  optionSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FDF2F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
