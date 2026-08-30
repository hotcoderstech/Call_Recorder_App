import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import { fetchEnrichedCallHistory, EnrichedCallRecord } from '../services/callLog';
import { PieChart, BarChart } from 'react-native-gifted-charts';

const { width } = Dimensions.get('window');

export default function AnalyticsScreen() {
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [calls, setCalls] = useState<EnrichedCallRecord[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const records = await fetchEnrichedCallHistory();
    setCalls(records);
  };

  const incoming = calls.filter(c => c.type === 1).length;
  const outgoing = calls.filter(c => c.type === 2).length;
  const missed = calls.filter(c => c.type === 3).length;
  
  const pieData = [
    { value: incoming, color: colors.incoming, text: 'In' },
    { value: outgoing, color: colors.outgoing, text: 'Out' },
    { value: missed, color: colors.missed, text: 'Miss' },
  ];

  // Aggregate calls by top contacts
  const contactCounts = new Map<string, number>();
  calls.forEach(c => {
    const name = c.contactName || c.number || 'Unknown';
    contactCounts.set(name, (contactCounts.get(name) || 0) + 1);
  });
  
  const sortedContacts = Array.from(contactCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const barData = sortedContacts.map(([name, count]) => ({
    value: count,
    label: name.substring(0, 5),
    frontColor: colors.primary
  }));

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Call Analytics</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Call Distribution</Text>
        <View style={styles.chartContainer}>
          <PieChart
            data={pieData}
            donut
            showText
            textColor={isDark ? '#000' : '#FFF'}
            radius={100}
            innerRadius={60}
          />
        </View>
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.incoming }]} />
            <Text style={{ color: colors.text }}>Incoming ({incoming})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.outgoing }]} />
            <Text style={{ color: colors.text }}>Outgoing ({outgoing})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.missed }]} />
            <Text style={{ color: colors.text }}>Missed ({missed})</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Top Contacts</Text>
        <View style={styles.chartContainer}>
          <BarChart
            data={barData}
            barWidth={30}
            spacing={20}
            roundedTop
            xAxisThickness={0}
            yAxisThickness={0}
            yAxisTextStyle={{ color: colors.textMuted }}
            xAxisLabelTextStyle={{ color: colors.text, fontSize: 10 }}
            noOfSections={4}
            maxValue={Math.max(...barData.map(d => d.value), 10)}
            width={width - 80}
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
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
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  }
});
