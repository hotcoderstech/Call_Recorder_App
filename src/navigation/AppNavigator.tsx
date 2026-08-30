import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import ContactDetailsScreen from '../screens/ContactDetailsScreen';
import LoginScreen from '../screens/LoginScreen';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { useColorScheme } from 'react-native';
import { initDatabase } from '../services/database';
import { useAutoSync } from '../hooks/useAutoSync';

export type RootStackParamList = {
  MainTabs: undefined;
  ContactDetails: { contactId: string; name: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { theme: storedTheme } = useAppStore();
  const systemTheme = useColorScheme();
  const isLoggedIn = useAppStore((s) => Boolean(s.accessToken && s.currentOrganizationId));

  useEffect(() => {
    initDatabase();
  }, []);

  useAutoSync();

  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const customTheme = isDark ? DarkTheme : LightTheme;

  const navigationTheme = {
    ...isDark ? NavDarkTheme : DefaultTheme,
    colors: {
      ...(isDark ? NavDarkTheme.colors : DefaultTheme.colors),
      primary: customTheme.colors.primary,
      background: customTheme.colors.background,
      card: customTheme.colors.card,
      text: customTheme.colors.text,
      border: customTheme.colors.border,
      notification: customTheme.colors.notification,
    },
  };

  if (!isLoggedIn) {
    return (
      <NavigationContainer theme={navigationTheme}>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
        <Stack.Screen name="ContactDetails" component={ContactDetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
