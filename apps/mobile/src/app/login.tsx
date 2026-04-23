import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:3000';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('rep@demo.com');
  const [password, setPassword] = useState('Demo1234!');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      // Phase 1 scaffold: hits the web app's credentials callback. In a
      // later pass we'll swap to a mobile-first /api/auth/mobile endpoint
      // returning a long-lived token we can store in SecureStore.
      const res = await fetch(`${API_URL}/api/auth/callback/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Pretend-token for now; swap to real JWT from the mobile auth
      // endpoint once it lands.
      await SecureStore.setItemAsync('pr_session_token', 'dev-token-phase1');
      router.replace('/(tabs)/radar');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-nav-bg px-6 justify-center">
      <Text className="text-white text-2xl font-semibold mb-1">PartnerRadar</Text>
      <Text className="text-nav-muted text-xs mb-6">Prospecting CRM</Text>
      <View className="bg-white rounded-lg p-4 gap-3">
        <Text className="text-base font-semibold">Sign in</Text>
        <TextInput
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error && <Text className="text-danger text-xs">{error}</Text>}
        <TouchableOpacity
          className="bg-primary rounded-md py-2 items-center"
          onPress={submit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white text-sm font-medium">Sign in</Text>
          )}
        </TouchableOpacity>
        <Text className="text-xs text-gray-500 mt-2">
          Demo: rep@demo.com / manager@demo.com / admin@demo.com — Demo1234!
        </Text>
      </View>
    </View>
  );
}
