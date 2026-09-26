import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Linking,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  useColorScheme,
} from 'react-native';
import { Search, SlidersHorizontal, Phone, ChevronRight, TrendingUp } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { leadsApi, LeadSummary } from '../services/api';
import { format, isToday, isYesterday } from 'date-fns';

type FilterType = 'ALL' | 'HOT' | 'PENDING' | 'FOLLOWUP';

const AVATAR_PALETTES = [
  { bg: '#FCE7EB', darkBg: '#311820', text: '#991B1B' },
  { bg: '#FEF3C7', darkBg: '#332714', text: '#92400E' },
  { bg: '#DBEAFE', darkBg: '#1A2744', text: '#1E40AF' },
  { bg: '#D1FAE5', darkBg: '#132C28', text: '#065F46' },
  { bg: '#EDE9FE', darkBg: '#291C3D', text: '#5B21B6' },
];

function getInitials(name: string): string {
  if (!name) return 'LD';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getAvatarPalette(id: string, isDark: boolean) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  const p = AVATAR_PALETTES[index];
  return { bg: isDark ? p.darkBg : p.bg, text: p.text };
}

function formatLeadTime(lead: LeadSummary): string {
  const dateVal = (lead as any).updatedAt || (lead as any).createdAt;
  if (!dateVal) return 'Today • 10:30 AM';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return 'Today • 10:30 AM';
  if (isToday(d)) return `Today • ${format(d, 'hh:mm a')}`;
  if (isYesterday(d)) return `Yesterday • ${format(d, 'hh:mm a')}`;
  return `${format(d, 'MMM d • hh:mm a')}`;
}

function getLeadBadge(lead: LeadSummary, isDark: boolean) {
  const status = (lead as any).status || (lead as any).stage?.name || '';
  const upper = String(status).toUpperCase();

  if (upper.includes('HOT') || upper.includes('WON') || upper.includes('QUALIFIED')) {
    return {
      label: 'Hot Lead',
      bg: isDark ? '#3B171D' : '#FFF1F2',
      text: '#E11D48',
    };
  }
  if (upper.includes('FOLLOW') || upper.includes('PENDING')) {
    return {
      label: 'Follow-up',
      bg: isDark ? '#382813' : '#FEF3C7',
      text: '#D97706',
    };
  }
  if (upper.includes('CONTACT') || upper.includes('CALL')) {
    return {
      label: 'Contacted',
      bg: isDark ? '#182949' : '#EFF6FF',
      text: '#2563EB',
    };
  }
  if (upper.includes('INTEREST')) {
    return {
      label: 'Interested',
      bg: isDark ? '#132C28' : '#ECFDF5',
      text: '#059669',
    };
  }
  return {
    label: (lead as any).stage?.name || 'New',
    bg: isDark ? '#242933' : '#F1F5F9',
    text: isDark ? '#94A3B8' : '#64748B',
  };
}

export default function LeadsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');

  const fetchLeads = useCallback(async (query: string = '') => {
    try {
      const data = await leadsApi.searchMine(query);
      setLeads(data);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads(searchQuery);
  }, [fetchLeads]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeads(searchQuery);
  };

  const handleCall = (phoneNumber: string) => {
    if (!phoneNumber) return;
    Linking.openURL(`tel:${phoneNumber}`).catch((err) => {
      console.error('Error opening dialer', err);
    });
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const name = lead.fullName || `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
      const phone = lead.phone || '';
      const matchesSearch =
        searchQuery.trim() === '' ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        phone.includes(searchQuery);

      if (!matchesSearch) return false;

      if (activeFilter === 'ALL') return true;
      const status = ((lead as any).status || (lead as any).stage?.name || '').toUpperCase();
      if (activeFilter === 'HOT') {
        return status.includes('HOT') || status.includes('WON') || status.includes('QUALIFIED');
      }
      if (activeFilter === 'PENDING') {
        return status.includes('PENDING') || status.includes('CALL') || status.includes('NEW');
      }
      if (activeFilter === 'FOLLOWUP') {
        return status.includes('FOLLOW');
      }
      return true;
    });
  }, [leads, searchQuery, activeFilter]);

  const cardBg = isDark ? '#1C1F26' : '#FFFFFF';
  const cardBorder = isDark ? '#2B3240' : '#EDF2F7';

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* 1. Search Bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: cardBg,
            borderColor: isDark ? '#2B3240' : '#E2E8F0',
          },
        ]}
      >
        <Search size={16} color="#94A3B8" style={{ marginRight: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search leads by name or number..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => fetchLeads(searchQuery)}
          returnKeyType="search"
        />
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <SlidersHorizontal size={16} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* 2. Filter Chips Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {/* All Chip */}
        <TouchableOpacity
          style={[
            styles.filterChip,
            activeFilter === 'ALL'
              ? styles.filterChipActive
              : [styles.filterChipInactive, { backgroundColor: cardBg, borderColor: isDark ? '#2B3240' : '#E2E8F0' }],
          ]}
          onPress={() => setActiveFilter('ALL')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'ALL' ? styles.filterChipTextActive : { color: isDark ? '#ECEDEE' : '#334155' },
            ]}
          >
            All
          </Text>
          <View
            style={[
              styles.countPill,
              activeFilter === 'ALL' ? styles.countPillActive : { backgroundColor: isDark ? '#262D3D' : '#F1F5F9' },
            ]}
          >
            <Text
              style={[
                styles.countPillText,
                activeFilter === 'ALL' ? { color: '#FFFFFF' } : { color: colors.textMuted },
              ]}
            >
              {leads.length}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Hot Leads Chip */}
        <TouchableOpacity
          style={[
            styles.filterChip,
            activeFilter === 'HOT'
              ? styles.filterChipActive
              : [styles.filterChipInactive, { backgroundColor: cardBg, borderColor: isDark ? '#2B3240' : '#E2E8F0' }],
          ]}
          onPress={() => setActiveFilter('HOT')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'HOT' ? styles.filterChipTextActive : { color: isDark ? '#ECEDEE' : '#334155' },
            ]}
          >
            🔥 Hot Leads
          </Text>
        </TouchableOpacity>

        {/* Pending Calls Chip */}
        <TouchableOpacity
          style={[
            styles.filterChip,
            activeFilter === 'PENDING'
              ? styles.filterChipActive
              : [styles.filterChipInactive, { backgroundColor: cardBg, borderColor: isDark ? '#2B3240' : '#E2E8F0' }],
          ]}
          onPress={() => setActiveFilter('PENDING')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'PENDING' ? styles.filterChipTextActive : { color: isDark ? '#ECEDEE' : '#334155' },
            ]}
          >
            Pending Calls (3)
          </Text>
        </TouchableOpacity>

        {/* Follow-up Chip */}
        <TouchableOpacity
          style={[
            styles.filterChip,
            activeFilter === 'FOLLOWUP'
              ? styles.filterChipActive
              : [styles.filterChipInactive, { backgroundColor: cardBg, borderColor: isDark ? '#2B3240' : '#E2E8F0' }],
          ]}
          onPress={() => setActiveFilter('FOLLOWUP')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'FOLLOWUP' ? styles.filterChipTextActive : { color: isDark ? '#ECEDEE' : '#334155' },
            ]}
          >
            Follow-up
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 3. Pipeline Performance Banner Card */}
      <View style={[styles.pipelineCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <View style={styles.pipelineLeft}>
          <View style={[styles.trendingIconBox, { backgroundColor: isDark ? '#132C28' : '#E6F9F0' }]}>
            <TrendingUp size={18} color="#10B981" />
          </View>
          <View>
            <Text style={styles.pipelineHeader}>PIPELINE PERFORMANCE</Text>
            <Text style={[styles.pipelineSub, { color: colors.text }]}>
              <Text style={{ color: '#059669', fontWeight: '800' }}>+18%</Text> conversions this week
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Analytics' as any)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.pipelineViewLink}>View</Text>
        </TouchableOpacity>
      </View>

      {/* 4. Section Title Row */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitleText}>
          RECENT LEADS ({filteredLeads.length})
        </Text>
        <Text style={styles.sortText}>Sorted by: Newest</Text>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: LeadSummary }) => {
    const displayName =
      item.fullName || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Unknown Lead';
    const initials = getInitials(displayName);
    const palette = getAvatarPalette(item.id, isDark);
    const badge = getLeadBadge(item, isDark);

    return (
      <TouchableOpacity
        style={[styles.leadCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
        onPress={() => navigation.navigate('LeadView', { leadId: item.id, lead: item })}
        activeOpacity={0.7}
      >
        {/* Left: Avatar Squircle */}
        <View style={[styles.avatarBox, { backgroundColor: palette.bg }]}>
          <Text style={[styles.avatarText, { color: palette.text }]}>{initials}</Text>
        </View>

        {/* Center: Details */}
        <View style={styles.detailsCol}>
          {/* Name & Badge Row */}
          <View style={styles.nameRow}>
            <Text style={[styles.leadName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
            </View>
          </View>

          {/* Phone */}
          <View style={styles.phoneRow}>
            <Phone size={12} color="#94A3B8" style={{ marginRight: 5 }} />
            <Text style={[styles.phoneText, { color: isDark ? '#94A3B8' : '#4B5563' }]} numberOfLines={1}>
              {item.phone || 'No phone number'}
            </Text>
          </View>

          {/* Timestamp Subtitle */}
          <Text style={styles.timeText}>{formatLeadTime(item)}</Text>
        </View>

        {/* Right: Actions */}
        <View style={styles.actionCol}>
          {!!item.phone && (
            <TouchableOpacity
              style={[styles.callCircleBtn, { backgroundColor: isDark ? '#2D171C' : '#FDF2F4' }]}
              onPress={(e) => {
                e.stopPropagation();
                handleCall(item.phone);
              }}
              activeOpacity={0.75}
            >
              <Phone size={15} color="#A21E33" />
            </TouchableOpacity>
          )}
          <ChevronRight size={18} color="#94A3B8" style={{ marginLeft: 6 }} />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredLeads}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {searchQuery ? 'No leads found matching your search.' : 'No leads assigned to you.'}
            </Text>
          </View>
        }
      />
    </View>
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
  listContent: {
    paddingBottom: 110,
  },
  headerContainer: {
    paddingTop: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  filterChipActive: {
    backgroundColor: '#8B1728',
  },
  filterChipInactive: {
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  countPill: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
  },
  countPillActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pipelineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  pipelineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendingIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pipelineHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  pipelineSub: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  pipelineViewLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A21E33',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A94A6',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sortText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginBottom: 12,
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
  avatarBox: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  detailsCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leadName: {
    fontSize: 15,
    fontWeight: '700',
    maxWidth: '65%',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  phoneText: {
    fontSize: 13,
    fontWeight: '500',
  },
  timeText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 3,
  },
  actionCol: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  callCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
});
