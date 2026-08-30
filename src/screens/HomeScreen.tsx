import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import { fetchEnrichedCallHistory, EnrichedCallRecord } from '../services/callLog';
import { isToday } from 'date-fns';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Phone } from 'lucide-react-native';

export default function HomeScreen() {
  const { theme: storedTheme } = useAppStore();
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

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={[styles.greeting, { color: colors.text }]}>Hello!</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>Here is your call summary for today.</Text>
      </View>

      <View style={styles.summaryGrid}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Phone color={colors.primary} size={24} />
          <Text style={[styles.cardValue, { color: colors.text }]}>{totalCalls}</Text>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Total Calls</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PhoneIncoming color={colors.incoming} size={24} />
          <Text style={[styles.cardValue, { color: colors.text }]}>{incoming}</Text>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Incoming</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PhoneOutgoing color={colors.outgoing} size={24} />
          <Text style={[styles.cardValue, { color: colors.text }]}>{outgoing}</Text>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Outgoing</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PhoneMissed color={colors.missed} size={24} />
          <Text style={[styles.cardValue, { color: colors.text }]}>{missed}</Text>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Missed</Text>
        </View>
      </View>

      <View style={[styles.durationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Total Talk Time</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>{formatDuration(totalTalkTime)}</Text>
        </View>
        <View>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Average Duration</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>{formatDuration(avgDuration)}</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Advanced Insights</Text>

      <View style={styles.summaryGrid}>
        <View style={[styles.wideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Most Contacted Person</Text>
          <Text style={[styles.cardValue, { color: colors.text }]} numberOfLines={1}>
            {mostContacted} ({mostContactedCount} calls)
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Longest Call</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>{formatDuration(longestCall)}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Calls This Week</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>{weekCalls.length}</Text>
        </View>

        <View style={[styles.wideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textMuted }]}>Calls This Month</Text>
          <Text style={[styles.cardValue, { color: colors.text }]}>{monthCalls.length}</Text>
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
    marginTop: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    justifyContent: 'space-between',
  },
  card: {
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
  }
});
