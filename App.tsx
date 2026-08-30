import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useAppStore } from './src/store/useAppStore';

export default function App() {
  const { theme } = useAppStore();
  
  return (
    <SafeAreaProvider>
      <StatusBar style={theme === 'dark' ? 'light' : theme === 'light' ? 'dark' : 'auto'} />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
