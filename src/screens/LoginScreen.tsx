import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
  Image,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { LightTheme, DarkTheme } from '../utils/theme';
import { authApi, organizationsApi, OrganizationSummary } from '../services/api';

const DEMO_IDENTIFIER = 'owner@demo-org.test';
const DEMO_PASSWORD = 'Demo@Password123!';

/** Tells apart "server responded with an error" from "couldn't even reach the server", which look identical otherwise. */
function describeAuthError(err: any): string {
  if (err.response) {
    return err.response.data?.error?.message || `Login failed (server returned ${err.response.status}).`;
  }
  if (err.request) {
    return "Can't reach the backend. Make sure your phone is on the same WiFi network as the server, and that no firewall/AP isolation is blocking it.";
  }
  return err.message || 'Login failed.';
}

export default function LoginScreen() {
  const storedTheme = useAppStore((s) => s.theme);
  const systemTheme = useColorScheme();
  const isDark = storedTheme === 'system' ? systemTheme === 'dark' : storedTheme === 'dark';
  const colors = isDark ? DarkTheme.colors : LightTheme.colors;

  const setSession = useAppStore((s) => s.setSession);
  const setOrganizations = useAppStore((s) => s.setOrganizations);
  const setCurrentOrganization = useAppStore((s) => s.setCurrentOrganization);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [orgChoices, setOrgChoices] = useState<OrganizationSummary[] | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const fillDemoCredentials = () => {
    setIdentifier(DEMO_IDENTIFIER);
    setPassword(DEMO_PASSWORD);
    setError('');
  };

  const handleLogin = async () => {
    if (!identifier || !password) {
      setError('Enter your email/phone and password');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const result = await authApi.login(identifier, password);
      setSession(result.accessToken, result.user, result.refreshToken);
      const orgs = await organizationsApi.list();
      setOrganizations(orgs);
      if (orgs.length === 1) {
        await handleSelectOrg(orgs[0]);
      } else if (orgs.length > 1) {
        setOrgChoices(orgs);
      } else {
        setError('This account has no organizations yet.');
      }
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectOrg = async (org: OrganizationSummary) => {
    setIsSwitching(true);
    setError('');
    try {
      const { accessToken } = await organizationsApi.switch(org.id);
      setCurrentOrganization(org.id, accessToken);
    } catch (err: any) {
      setError(describeAuthError(err));
    } finally {
      setIsSwitching(false);
    }
  };

  if (orgChoices) {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.centerContent}>
        <Text style={[styles.title, { color: colors.text }]}>Select Organization</Text>
        {error ? <Text style={[styles.error, { color: colors.notification }]}>{error}</Text> : null}
        {orgChoices.map((org) => (
          <TouchableOpacity
            key={org.id}
            style={[styles.orgRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleSelectOrg(org)}
            disabled={isSwitching}
          >
            <Text style={[styles.orgName, { color: colors.text }]}>{org.name}</Text>
            {org.roleCode ? <Text style={[styles.orgRole, { color: colors.textMuted }]}>{org.roleCode}</Text> : null}
          </TouchableOpacity>
        ))}
        {isSwitching ? <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} /> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.centerContent}>
      <View style={styles.logoContainer}>
        <Image 
          source={require('../../assets/icon.png')} 
          style={styles.logo} 
          resizeMode="contain" 
        />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>Sign in to CRM</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Sync your call log to your organization's leads.</Text>

      <View style={[styles.demoBanner, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.demoBannerText}>
          <Text style={[styles.demoBannerTitle, { color: colors.text }]}>Just exploring?</Text>
          <Text style={[styles.demoBannerSubtitle, { color: colors.textMuted }]}>Use the demo account, no signup needed.</Text>
        </View>
        <TouchableOpacity
          style={[styles.demoBannerButton, { borderColor: colors.primary }]}
          onPress={fillDemoCredentials}
          disabled={isSubmitting}
        >
          <Text style={[styles.demoBannerButtonText, { color: colors.primary }]}>Fill demo login</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={[styles.error, { color: colors.notification }]}>{error}</Text> : null}

      <Text style={[styles.label, { color: colors.textMuted }]}>Email or Phone</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
        placeholder="you@example.com"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={identifier}
        onChangeText={setIdentifier}
        editable={!isSubmitting}
      />

      <Text style={[styles.label, { color: colors.textMuted }]}>Password</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[
            styles.input,
            styles.passwordInput,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
          ]}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
          editable={!isSubmitting}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {showPassword ? (
            <EyeOff color={colors.textMuted} size={20} />
          ) : (
            <Eye color={colors.textMuted} size={20} />
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.6 : 1 }]}
        onPress={handleLogin}
        disabled={isSubmitting}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { padding: 24, paddingTop: 80 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 100, height: 100, borderRadius: 20 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 6 },
  subtitle: { fontSize: 14, marginBottom: 20 },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 12,
  },
  demoBannerText: { flex: 1 },
  demoBannerTitle: { fontSize: 14, fontWeight: '600' },
  demoBannerSubtitle: { fontSize: 12, marginTop: 2 },
  demoBannerButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  demoBannerButtonText: { fontSize: 13, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 44 },
  eyeButton: { position: 'absolute', right: 14 },
  button: { marginTop: 28, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { fontSize: 14, marginBottom: 12 },
  orgRow: { borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 10 },
  orgName: { fontSize: 16, fontWeight: '600' },
  orgRole: { fontSize: 13, marginTop: 2 },
});
