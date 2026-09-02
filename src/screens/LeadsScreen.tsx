import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Linking, TouchableOpacity, useColorScheme } from 'react-native';
import { Phone } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { leadsApi, LeadSummary } from '../services/api';

export default function LeadsScreen() {
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLeads = useCallback(async () => {
    try {
      const data = await leadsApi.searchMine('');
      setLeads(data);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeads();
  };

  const handleCall = (phoneNumber: string) => {
    if (!phoneNumber) return;
    Linking.openURL(`tel:${phoneNumber}`).catch((err) => {
      console.error('Error opening dialer', err);
    });
  };

  const renderItem = ({ item }: { item: LeadSummary }) => {
    const displayName = item.fullName || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Unknown Lead';
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.infoContainer}>
          <Text style={[styles.nameText, { color: colors.text }]}>{displayName}</Text>
          <Text style={[styles.phoneText, { color: colors.textMuted }]}>{item.phone || 'No phone number'}</Text>
        </View>
        {!!item.phone && (
          <TouchableOpacity 
            style={[styles.callButton, { backgroundColor: colors.primary + '20' }]} 
            onPress={() => handleCall(item.phone)}
          >
            <Phone color={colors.primary} size={20} />
          </TouchableOpacity>
        )}
      </View>
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
        data={leads}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No leads assigned to you.</Text>
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
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  infoContainer: {
    flex: 1,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  phoneText: {
    fontSize: 14,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  }
});
