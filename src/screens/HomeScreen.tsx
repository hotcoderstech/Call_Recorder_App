import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import { fetchEnrichedCallHistory, EnrichedCallRecord } from '../services/callLog';
import { isToday, subDays, format } from 'date-fns';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Phone, ChevronDown, BarChart2, MoreVertical, Calendar } from 'lucide-react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const PROVERBS = [
  "A bad workman always blames his tools.",
  "A bird in the hand is worth two in the bush.",
  "Absence makes the heart grow fonder.",
  "A cat has nine lives.",
  "Actions speak louder than words.",
  "A journey of a thousand miles begins with a single step.",
  "All that glitters is not gold.",
  "All's well that ends well.",
  "A picture is worth a thousand words.",
  "A rolling stone gathers no moss.",
  "A stitch in time saves nine.",
  "Barking dogs seldom bite.",
  "Beauty is in the eye of the beholder.",
  "Better late than never.",
  "Birds of a feather flock together.",
  "Cleanliness is next to godliness.",
  "Don't count your chickens before they hatch.",
  "Don't judge a book by its cover.",
  "Early to bed and early to rise makes a man healthy, wealthy, and wise.",
  "Every cloud has a silver lining.",
  "Fortune favors the bold.",
  "Haste makes waste.",
  "Honesty is the best policy.",
  "Hope for the best, but prepare for the worst.",
  "If it ain't broke, don't fix it.",
  "Ignorance is bliss.",
  "Knowledge is power.",
  "Laughter is the best medicine.",
  "Practice makes perfect.",
  "Rome wasn't built in a day.",
  "Where there's a will, there's a way."
];

export default function HomeScreen() {
  const { theme: storedTheme, user } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [calls, setCalls] = useState<EnrichedCallRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const records = await fetchEnrichedCallHistory();
    setCalls(records);
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Compute Today's Stats
  const todayCalls = calls.filter(c => c.timestamp && isToday(new Date(c.timestamp)));
  const totalCalls = todayCalls.length;
  const incoming = todayCalls.filter(c => c.type === 1).length;
  const outgoing = todayCalls.filter(c => c.type === 2).length;
  const missed = todayCalls.filter(c => c.type === 3).length;
  const totalTalkTime = todayCalls.reduce((acc, c) => acc + (c.duration || 0), 0);
  const avgDuration = totalCalls > 0 ? Math.floor(totalTalkTime / totalCalls) : 0;

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Compute Advanced Stats
  const longestCall = Math.max(...calls.map(c => c.duration || 0), 0);
  
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const weekStart = new Date(now.setDate(now.getDate() - now.getDay())); // start of week
  weekStart.setHours(0,0,0,0);
  
  const monthCalls = calls.filter(c => {
    if (!c.timestamp) return false;
    const d = new Date(c.timestamp);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  
  const weekCalls = calls.filter(c => {
    if (!c.timestamp) return false;
    const d = new Date(c.timestamp);
    return d >= weekStart;
  });
  
  const contactCounts = new Map<string, number>();
  calls.forEach(c => {
    const name = c.contactName || c.number || 'Unknown';
    contactCounts.set(name, (contactCounts.get(name) || 0) + 1);
  });
  
  let mostContacted = 'None';
  let mostContactedCount = 0;
  contactCounts.forEach((count, name) => {
    if (count > mostContactedCount && name !== 'Unknown') {
      mostContactedCount = count;
      mostContacted = name;
    }
  });

  // Calculate last 7 days calls
  const last7DaysData = Array(7).fill(0).map((_, i) => {
    const d = subDays(new Date(), 6 - i);
    return { date: d, count: 0, label: format(d, 'EEE') };
  });

  calls.forEach(c => {
    if (!c.timestamp) return;
    const d = new Date(c.timestamp);
    const diffTime = Math.abs(new Date().getTime() - d.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays <= 7) {
      const idx = last7DaysData.findIndex(item => item.date.getDate() === d.getDate() && item.date.getMonth() === d.getMonth());
      if (idx !== -1) {
        last7DaysData[idx].count += 1;
      }
    }
  });

  const hasData = calls.length > 0;
  const mockWeeklyData = [
    { label: 'Sat', count: 5000 },
    { label: 'Sun', count: 20000 },
    { label: 'Mon', count: 15000 },
    { label: 'Tue', count: 18000 },
    { label: 'Wed', count: 20000 },
    { label: 'Thu', count: 15000 },
    { label: 'Fri', count: 5000 },
    { label: 'Sat', count: 18000 },
  ];

  const chartDataToUse = hasData && Math.max(...last7DaysData.map(d => d.count)) > 0 ? last7DaysData : mockWeeklyData;

  const barData = chartDataToUse.map((data, index) => {
    return {
      value: data.count,
      label: data.label,
      frontColor: isDark ? 'rgba(50, 200, 80, 0.1)' : 'rgba(100, 220, 120, 0.1)',
      gradientColor: '#4ADE80',
      showGradient: true,
      labelTextStyle: { 
        color: colors.textMuted, 
        fontSize: 11,
      },
      topLabelComponent: () => (
        <View style={{ width: 34, height: 2, backgroundColor: '#22C55E', marginBottom: -2 }} />
      )
    };
  });

  const maxValue = Math.max(...chartDataToUse.map(d => d.count), 25000);

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={[styles.greeting, { color: colors.text }]}>Welcome, {user?.firstName || 'User'}!</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted, fontStyle: 'italic' }]}>"{PROVERBS[(new Date().getDate() - 1) % PROVERBS.length]}"</Text>
      </View>

      <View style={[styles.summaryGrid, { marginTop: 10 }]}>
        {/* Card 1: Total Calls (Time in range style) */}
        <View style={styles.glowCardContainer}>
          <LinearGradient colors={['#5b6a6a', '#2c3535']} style={styles.glowCard}>
            <View style={[styles.glowOrb, { backgroundColor: '#111', left: '10%', top: '20%', width: 140, height: 140, opacity: 0.6 }]} />
            <Text style={styles.glowCardLabel}>Total Calls</Text>
            <View style={styles.glowGraphicLine}>
              <View style={[styles.glowGraphicLineFill, { width: '70%' }]} />
              <View style={styles.glowGraphicTriangle} />
            </View>
            <View style={styles.glowCardBottom}>
              <Text style={styles.glowCardValue}>{totalCalls}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Card 2: Incoming (Variability style) */}
        <View style={styles.glowCardContainer}>
          <LinearGradient colors={['#d785b9', '#b56499']} style={styles.glowCard}>
            <View style={[styles.glowOrb, { backgroundColor: '#5c1f4e', left: '15%', top: '15%', width: 100, height: 100, opacity: 0.7 }]} />
            <Text style={styles.glowCardLabel}>Incoming</Text>
            <View style={styles.glowGraphicDots}>
              {Array.from({ length: 9 }).map((_, i) => (
                <View key={i} style={[styles.glowDot, { opacity: i === 4 ? 1 : 0.6, width: i === 4 ? 4 : 3, height: i === 4 ? 4 : 3 }]} />
              ))}
            </View>
            <View style={styles.glowCardBottom}>
              <Text style={styles.glowCardValue}>{incoming}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Card 3: Outgoing (Vitamin D style) */}
        <View style={styles.glowCardContainer}>
          <LinearGradient colors={['#3d67bc', '#183884']} style={styles.glowCard}>
            <View style={[styles.glowOrb, { backgroundColor: '#0a1638', left: '15%', top: '10%', width: 120, height: 120, opacity: 0.7 }]} />
            <Text style={styles.glowCardLabel}>Outgoing</Text>
            <View style={styles.glowCardBottom}>
              <Text style={styles.glowCardValue}>{outgoing}</Text>
              <Text style={styles.glowCardSuffix}>Good</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Card 4: Missed (Spikes style) */}
        <View style={styles.glowCardContainer}>
          <LinearGradient colors={['#bd5c3b', '#993f21']} style={styles.glowCard}>
            <View style={[styles.glowOrb, { backgroundColor: '#2d4ab2', right: -30, bottom: -20, width: 110, height: 110, opacity: 0.8 }]} />
            <Text style={styles.glowCardLabel}>Missed</Text>
            <View style={styles.glowCardBottom}>
              <Text style={styles.glowCardValue}>{missed}</Text>
            </View>
          </LinearGradient>
        </View>
      </View>

      {/* Advanced Insights (Sales Overview Design Match) */}
      <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Header */}
        <View style={styles.aiHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <BarChart2 size={18} color={colors.text} />
            <Text style={[styles.aiTitle, { color: colors.text }]}>Advanced Insights</Text>
          </View>
        </View>

        <View style={styles.aiBody}>
          {/* Left Column */}
          <View style={styles.aiLeftCol}>
            <View style={[styles.aiSubCard, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FA' }]}>
              <View style={styles.aiSubCardHeader}>
                <Text style={styles.aiSubCardTitle}>Talk Time</Text>
                <View style={[styles.aiPill, { backgroundColor: '#FF6B4A' }]}>
                  <Text style={styles.aiPillText}>All</Text>
                </View>
              </View>
              <Text style={[styles.aiSubCardValue, { color: colors.text }]}>{formatDuration(totalTalkTime)}</Text>
            </View>

            <View style={[styles.aiSubCard, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FA' }]}>
              <View style={styles.aiSubCardHeader}>
                <Text style={styles.aiSubCardTitle}>Avg Time</Text>
                <View style={[styles.aiPill, { backgroundColor: isDark ? '#444' : '#1A1A1A' }]}>
                  <Text style={styles.aiPillText}>Avg</Text>
                </View>
              </View>
              <Text style={[styles.aiSubCardValue, { color: colors.text }]}>{formatDuration(avgDuration)}</Text>
            </View>

            <View style={[styles.aiSubCard, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FA' }]}>
              <View style={styles.aiSubCardHeader}>
                <Text style={styles.aiSubCardTitle}>Longest</Text>
              </View>
              <Text style={[styles.aiSubCardValue, { color: colors.text }]}>{formatDuration(longestCall)}</Text>
            </View>
          </View>

          {/* Right Column */}
          <View style={styles.aiRightCol}>
            <View style={styles.gaugeContainer}>
              <PieChart
                donut
                isThreeD={false}
                semiCircle
                radius={80}
                innerRadius={55}
                data={Array.from({ length: 30 }).map((_, i) => {
                  const percent = monthCalls.length > 0 ? Math.min((weekCalls.length / monthCalls.length) * 100, 100) : 0;
                  const activeSegments = Math.round((percent / 100) * 30);
                  return {
                    value: 1,
                    color: i < activeSegments ? '#FF6B4A' : (isDark ? '#444' : '#EEEEEE'),
                  };
                })}
                strokeWidth={2}
                strokeColor={colors.card}
              />
              <View style={styles.gaugeTextContainer}>
                <Text style={[styles.gaugePercent, { color: colors.text }]}>
                  {monthCalls.length > 0 ? ((weekCalls.length / monthCalls.length) * 100).toFixed(1) : 0}%
                </Text>
                <Text style={styles.gaugeSubText}>Week vs Month</Text>
              </View>
            </View>

            {/* Footer Text */}
            <View style={[styles.aiFooter, { backgroundColor: isDark ? '#2A2A2A' : '#F8F9FA' }]}>
              <Text style={styles.aiFooterText} numberOfLines={1}>
                Top: {mostContacted}
              </Text>
              <View style={[styles.aiFooterPill, { backgroundColor: '#FF6B4A' }]}>
                <Text style={styles.aiFooterPillText}>{mostContactedCount} calls</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Total Calls Chart (Design Matched) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 20, paddingHorizontal: 12, marginBottom: 40 }]}>
        <View style={styles.monitoringHeader}>
          <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0, fontSize: 16, fontWeight: 'bold' }]}>Total Calls</Text>
          <TouchableOpacity style={[styles.dropdown, { backgroundColor: isDark ? '#333' : '#F5F5F5' }]}>
            <Text style={[styles.dropdownText, { color: colors.text }]}>Weekly</Text>
            <ChevronDown size={14} color={colors.text} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 24, marginLeft: -10 }}>
          <BarChart
            data={barData}
            barWidth={34}
            spacing={width > 400 ? 18 : 12}
            initialSpacing={10}
            hideRules={false}
            rulesType="dashed"
            rulesColor={isDark ? '#333' : '#F0F0F0'}
            xAxisThickness={0}
            yAxisThickness={0}
            yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
            noOfSections={5}
            maxValue={maxValue}
            width={width - 70}
            formatYLabel={(label) => {
              const val = Number(label);
              if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
              return label;
            }}
            pointerConfig={{
              pointerStripHeight: 160,
              pointerStripColor: 'transparent',
              pointerColor: 'transparent',
              radius: 6,
              pointerLabelWidth: 100,
              pointerLabelHeight: 60,
              activatePointersOnLongPress: false,
              autoAdjustPointerLabelPosition: true,
              pointerLabelComponent: (items: any) => {
                const val = items[0]?.value || 0;
                return (
                  <View style={styles.tooltipContainer}>
                    <View style={styles.tooltipBubble}>
                      <Text style={{ color: '#666', fontSize: 10 }}>Total Calls</Text>
                      <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 14, marginTop: 2 }}>
                        {val}
                      </Text>
                    </View>
                    <View style={styles.tooltipDot} />
                  </View>
                );
              },
            }}
          />
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
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  dateCardLeft: {
    flex: 1,
  },
  dateDayText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateFullText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  dateIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  card: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
  },
  monitoringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dropdownText: {
    fontSize: 12,
    fontWeight: '600',
  },
  smallCard: {
    width: '46%',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: '2%',
    marginBottom: 16,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  cardLabel: {
    fontSize: 14,
    marginTop: 4,
  },
  durationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 20,
    marginTop: 10,
    marginBottom: 10,
  },
  wideCard: {
    width: '96%',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: '2%',
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tooltipContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -45,
    marginLeft: -40,
  },
  tooltipBubble: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  tooltipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginTop: 6,
  },
  aiCard: {
    margin: 16,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  aiMoreIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aiLeftCol: {
    width: '42%',
    justifyContent: 'space-between',
  },
  aiSubCard: {
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  aiSubCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiSubCardTitle: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  aiPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  aiPillText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  aiSubCardValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  aiRightCol: {
    width: '54%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    marginTop: 10,
  },
  gaugeTextContainer: {
    position: 'absolute',
    bottom: -10,
    alignItems: 'center',
  },
  gaugePercent: {
    fontSize: 28,
    fontWeight: '800',
  },
  gaugeSubText: {
    fontSize: 10,
    color: '#888',
    marginTop: -4,
  },
  aiFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 35,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  aiFooterText: {
    fontSize: 11,
    color: '#666',
    flex: 1,
  },
  aiFooterPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 8,
  },
  aiFooterPillText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  glowCardContainer: {
    width: '47%',
    height: 120,
    marginBottom: 12,
    borderRadius: 24,
    overflow: 'hidden',
  },
  glowCard: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 100,
  },
  glowCardLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '500',
    zIndex: 2,
  },
  glowCardBottom: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  glowCardValue: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '500',
  },
  glowCardSuffix: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginBottom: 4,
  },
  glowGraphicLine: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginVertical: 12,
    justifyContent: 'center',
    zIndex: 2,
  },
  glowGraphicLineFill: {
    position: 'absolute',
    left: 0,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 2,
  },
  glowGraphicTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f1c40f',
    marginLeft: '70%',
    transform: [{ translateX: -4 }],
  },
  glowGraphicDots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 6,
    zIndex: 2,
  },
  glowDot: {
    borderRadius: 2,
    backgroundColor: '#FFF',
  }
});
