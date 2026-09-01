import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import { fetchEnrichedCallHistory, EnrichedCallRecord } from '../services/callLog';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import { ChevronDown } from 'lucide-react-native';

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

  // Aggregate calls by month for the Call Monitoring chart
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const monthlyData = Array(12).fill(0).map(() => ({ incoming: 0, other: 0 }));

  calls.forEach(c => {
    if (!c.timestamp) return;
    const d = new Date(c.timestamp);
    if (d.getFullYear() === currentYear) {
      const month = d.getMonth();
      if (c.type === 1) {
        monthlyData[month].incoming += 1;
      } else {
        monthlyData[month].other += 1;
      }
    }
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Use mock data if there are no calls to show the design properly
  const hasData = calls.length > 0;
  const mockMonthlyData = [
    { incoming: 20, other: 15 },
    { incoming: 40, other: 20 },
    { incoming: 28, other: 15 },
    { incoming: 40, other: 20 },
    { incoming: 30, other: 15 },
    { incoming: 48, other: 20 },
    { incoming: 22, other: 25 },
    { incoming: 12, other: 22 },
    { incoming: 28, other: 22 },
    { incoming: 18, other: 16 },
    { incoming: 28, other: 25 },
    { incoming: 12, other: 10 },
  ];

  const chartDataToUse = hasData ? monthlyData : mockMonthlyData;

  const stackData = chartDataToUse.map((data, index) => {
    return {
      stacks: [
        { 
          value: data.incoming, 
          color: '#5D10A6', 
          borderBottomLeftRadius: 8, 
          borderBottomRightRadius: 8,
          borderTopLeftRadius: data.other === 0 ? 8 : 0,
          borderTopRightRadius: data.other === 0 ? 8 : 0,
        },
        { 
          value: data.other, 
          color: '#E0C6FF',
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          borderBottomLeftRadius: data.incoming === 0 ? 8 : 0,
          borderBottomRightRadius: data.incoming === 0 ? 8 : 0,
          marginBottom: 0
        }
      ],
      label: monthNames[index],
      labelTextStyle: { 
        color: index === currentMonth ? colors.text : colors.textMuted, 
        fontWeight: index === currentMonth ? 'bold' : 'normal',
        fontSize: 10,
      }
    };
  });

  const maxValue = Math.max(...chartDataToUse.map(d => d.incoming + d.other), 100);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Call Analytics</Text>
      </View>

      {/* Call Monitoring Chart (Design Matched) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 20, paddingHorizontal: 12 }]}>
        <View style={styles.monitoringHeader}>
          <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0, fontSize: 16, fontWeight: 'bold' }]}>Call Monitoring</Text>
          <TouchableOpacity style={[styles.dropdown, { backgroundColor: isDark ? '#333' : '#F5F5F5' }]}>
            <Text style={[styles.dropdownText, { color: colors.text }]}>Yearly</Text>
            <ChevronDown size={14} color={colors.text} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 24, marginLeft: -10 }}>
          <BarChart
            stackData={stackData}
            barWidth={14}
            spacing={11}
            initialSpacing={10}
            hideRules={false}
            rulesType="dashed"
            rulesColor={isDark ? '#333' : '#F0F0F0'}
            xAxisThickness={0}
            yAxisThickness={0}
            yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
            noOfSections={5}
            maxValue={maxValue > 100 ? maxValue : 100}
            width={width - 70}
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
                const total = items.reduce((acc: number, item: any) => acc + item.value, 0);
                const percent = total > 0 ? Math.round((val / total) * 100) : 0;
                return (
                  <View style={styles.tooltipContainer}>
                    <View style={styles.tooltipBubble}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#5D10A6', marginRight: 6 }} />
                        <Text style={{ color: '#666', fontSize: 10 }}>Incoming Calls</Text>
                      </View>
                      <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12, marginTop: 2 }}>
                        {percent}%
                      </Text>
                    </View>
                    <View style={styles.tooltipArrow} />
                  </View>
                );
              },
            }}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Call Distribution</Text>
        <View style={styles.chartContainer}>
          <PieChart
            data={pieData}
            donut
            showText
            textColor={isDark ? '#000' : '#FFF'}
            radius={90}
            innerRadius={50}
          />
        </View>
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.incoming }]} />
            <Text style={{ color: colors.text, fontSize: 12 }}>Incoming ({incoming})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.outgoing }]} />
            <Text style={{ color: colors.text, fontSize: 12 }}>Outgoing ({outgoing})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.missed }]} />
            <Text style={{ color: colors.text, fontSize: 12 }}>Missed ({missed})</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 40 }]}>
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
            width={width - 100}
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
    paddingBottom: 10,
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
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'white',
  }
});
