import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Phone, BarChart2, Settings, Users, Calendar } from 'lucide-react-native';
import { format } from 'date-fns';
import HomeScreen from '../screens/HomeScreen';
import CallsScreen from '../screens/CallsScreen';
import LeadsScreen from '../screens/LeadsScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme, TouchableOpacity } from 'react-native';

const Tab = createBottomTabNavigator();

const HeaderDateCard = ({ isDark, colors }: { isDark: boolean, colors: any }) => (
  <View style={{
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#1F2937' : '#EFF6FF',
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  }}>
    <View style={{ marginRight: 10 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: isDark ? '#60A5FA' : '#2563EB', textTransform: 'uppercase', marginBottom: 2 }}>
        {format(new Date(), 'EEEE')}
      </Text>
      <Text style={{ fontSize: 13, fontWeight: 'bold', color: colors.text }}>
        {format(new Date(), 'MMMM d, yyyy')}
      </Text>
    </View>
    <View style={{ 
      width: 28, height: 28, borderRadius: 14, 
      backgroundColor: isDark ? '#374151' : '#DBEAFE',
      alignItems: 'center', justifyContent: 'center' 
    }}>
      <Calendar size={14} color={isDark ? '#60A5FA' : '#2563EB'} />
    </View>
  </View>
);

export default function BottomTabNavigator() {
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => ({
        headerShown: true,
        headerLeft: () => (
          <Text style={{ marginLeft: 16, fontSize: 20, fontWeight: 'bold', color: colors.text }}>
            {route.name}
          </Text>
        ),
        headerTitle: () => <HeaderDateCard isDark={isDark} colors={colors} />,
        headerTitleAlign: 'center',
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        headerRight: () => (
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ marginRight: 16 }}>
            <Settings color={colors.text} size={24} />
          </TouchableOpacity>
        ),
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Leads" 
        component={LeadsScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Calls" 
        component={CallsScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Phone color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Analytics" 
        component={AnalyticsScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <BarChart2 color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
          tabBarItemStyle: { display: 'none' }
        }}
      />
    </Tab.Navigator>
  );
}
