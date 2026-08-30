import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, RefreshControl, PermissionsAndroid, Platform, ActivityIndicator, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import CallListItem from '../components/CallListItem';
import { fetchEnrichedCallHistory, EnrichedCallRecord } from '../services/callLog';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import { format, isToday, isYesterday } from 'date-fns';
import { Search, X } from 'lucide-react-native';

interface Section {
  title: string;
  data: EnrichedCallRecord[];
}

type FilterType = 'All' | 'Incoming' | 'Outgoing' | 'Missed' | 'Rejected';

export default function CallsScreen() {
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [allCalls, setAllCalls] = useState<EnrichedCallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');

  const checkPermissionsAndLoad = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        {
          title: 'Call Log Permission',
          message: 'This app needs access to your call log to display your call history and analytics.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        }
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        setPermissionGranted(true);
        loadCallHistory();
      } else {
        setPermissionGranted(false);
        setLoading(false);
      }
    } catch (err) {
      console.warn(err);
      setPermissionGranted(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkPermissionsAndLoad();
  }, [checkPermissionsAndLoad]);

  const loadCallHistory = async () => {
    const records = await fetchEnrichedCallHistory();
    setAllCalls(records);
    setLoading(false);
    setRefreshing(false);
  };

  const filteredCalls = useMemo(() => {
    let filtered = allCalls;

    // Apply Filter
    if (activeFilter !== 'All') {
      const typeMap: Record<FilterType, number> = {
        'All': 0,
        'Incoming': 1,
        'Outgoing': 2,
        'Missed': 3,
        'Rejected': 5
      };
      filtered = filtered.filter(call => call.type === typeMap[activeFilter]);
    }

    // Apply Search
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(call => 
        (call.contactName && call.contactName.toLowerCase().includes(query)) ||
        (call.number && call.number.includes(query))
      );
    }

    return filtered;
  }, [allCalls, searchQuery, activeFilter]);

  const callsSections = useMemo(() => {
    const map = new Map<string, EnrichedCallRecord[]>();
    filteredCalls.forEach(record => {
      const group = record.dateGroup;
      if (!map.has(group)) {
        map.set(group, []);
      }
      map.get(group)!.push(record);
    });

    const sections: Section[] = [];
    map.forEach((data, dateGroup) => {
      const date = new Date(dateGroup);
      let title = format(date, 'dd MMM yyyy');
      if (isToday(date)) title = 'Today';
      else if (isYesterday(date)) title = 'Yesterday';

      sections.push({ title, data });
    });

    return sections;
  }, [filteredCalls]);

  const onRefresh = () => {
    setRefreshing(true);
    if (permissionGranted) {
      loadCallHistory();
    } else {
      setRefreshing(false);
    }
  };

  const navigation = useNavigation<any>();

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (permissionGranted === false) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>Call Log permission is required.</Text>
      </View>
    );
  }

  const filters: FilterType[] = ['All', 'Incoming', 'Outgoing', 'Missed', 'Rejected'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchInputContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search color={colors.textMuted} size={20} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search name or number..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearIcon}>
              <X color={colors.textMuted} size={18} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterPill,
                { 
                  backgroundColor: activeFilter === filter ? colors.primary : colors.card,
                  borderColor: activeFilter === filter ? colors.primary : colors.border
                }
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text 
                style={[
                  styles.filterText, 
                  { color: activeFilter === filter ? '#FFFFFF' : colors.text }
                ]}
              >
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <SectionList
        sections={callsSections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CallListItem 
            call={item} 
            onPress={() => {
              navigation.navigate('ContactDetails', { 
                contactId: item.number, 
                name: item.contactName || item.number || 'Unknown' 
              });
            }} 
          />
        )}
        renderSectionHeader={({ section: { title } }) => (
          <View style={[styles.header, { backgroundColor: colors.background }]}>
            <Text style={[styles.headerText, { color: colors.textMuted }]}>{title}</Text>
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        stickySectionHeadersEnabled
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No calls found</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  clearIcon: {
    padding: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  filtersContainer: {
    marginBottom: 8,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  }
});
