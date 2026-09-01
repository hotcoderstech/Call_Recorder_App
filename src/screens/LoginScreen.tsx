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
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { Eye, EyeOff, ChevronLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.orgCenterContent}>
        <Text style={[styles.orgTitle, { color: colors.text }]}>Select Organization</Text>
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

  // The requested UI uses a specific light theme look regardless of system theme
  // We'll apply fixed colors for the card for the best resemblance, but support dark mode gracefully
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#1A1A1A';
  const textMuted = isDark ? '#A0A0A0' : '#8A8A8E';
  const borderColor = isDark ? '#333333' : '#E5E5EA';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: isDark ? '#121212' : '#F5F5FC' }} contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        
        {/* Top Gradient Section */}
        <LinearGradient 
          colors={['#2D34E5', '#4E53EF', '#6B40ED']} 
          style={styles.topGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.logoContainer}>
            <TouchableOpacity onPress={fillDemoCredentials} activeOpacity={0.8}>
              <Text style={styles.logoText}>Faminfo</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Bottom Card Section */}
        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.welcomeTitle, { color: textColor }]}>Welcome Back</Text>
          <Text style={[styles.welcomeSubtitle, { color: textMuted }]}>Enter your details below</Text>

          {error ? <Text style={styles.errorMessage}>{error}</Text> : null}

          {/* Email Input */}
          <View style={[styles.inputWrapper, { borderColor }]}>
            <Text style={[styles.inputLabel, { color: textMuted }]}>Email Address</Text>
            <TextInput
              style={[styles.input, { color: textColor }]}
              placeholder="you@example.com"
              placeholderTextColor={textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              value={identifier}
              onChangeText={setIdentifier}
              editable={!isSubmitting}
            />
          </View>

          {/* Password Input */}
          <View style={[styles.inputWrapper, { borderColor, marginTop: 16 }]}>
            <Text style={[styles.inputLabel, { color: textMuted }]}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { color: textColor, flex: 1, paddingRight: 40 }]}
                placeholder="••••••••"
                placeholderTextColor={textMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!isSubmitting}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {showPassword ? (
                  <EyeOff color={textMuted} size={20} />
                ) : (
                  <Eye color={textMuted} size={20} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Sign In Button */}
          <TouchableOpacity 
            style={styles.signInButtonWrapper}
            onPress={handleLogin}
            disabled={isSubmitting}
          >
            <LinearGradient
              colors={['#4A3DF4', '#B355F6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.signInGradient, { opacity: isSubmitting ? 0.7 : 1 }]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.signInText}>Sign In</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>



        </View>
      </ScrollView>

      <View style={styles.developerBadge}>
        <Text style={styles.developerBadgeText}>Developed by Hotcoders@2026</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orgCenterContent: { padding: 24, paddingTop: 80 },
  orgTitle: { fontSize: 26, fontWeight: 'bold', marginBottom: 20 },
  orgRow: { borderWidth: 1, borderRadius: 10, padding: 16, marginBottom: 10 },
  orgName: { fontSize: 16, fontWeight: '600' },
  orgRole: { fontSize: 13, marginTop: 2 },
  error: { fontSize: 14, marginBottom: 12 },
  
  // New UI Styles
  topGradient: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    marginRight: 10,
  },
  getStartedBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  getStartedText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 20,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: 'bold',
  },
  
  card: {
    flex: 1,
    marginTop: -40,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  errorMessage: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  input: {
    fontSize: 15,
    padding: 0,
    margin: 0,
    height: 24,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyeButton: {
    position: 'absolute',
    right: 0,
    top: 2,
  },
  
  signInButtonWrapper: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#6B40ED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  signInGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  
  forgotPasswordBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '500',
  },
  
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 13,
  },
  
  socialContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  googleIconPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    color: '#DB4437',
    fontWeight: 'bold',
    fontSize: 16,
  },
  developerBadge: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  developerBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8A8A8E',
  },
});
