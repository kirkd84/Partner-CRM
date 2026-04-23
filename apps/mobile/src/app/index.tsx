import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import { View, Text } from 'react-native';

/**
 * Entry screen — checks for a session token and redirects to tabs or login.
 * Token exchange with the web app's NextAuth endpoint happens in login.tsx.
 */
export default function Index() {
  const [status, setStatus] = useState<'loading' | 'authed' | 'guest'>('loading');

  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('pr_session_token');
      setStatus(token ? 'authed' : 'guest');
    })();
  }, []);

  if (status === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-nav-bg">
        <Text className="text-white text-sm">Loading…</Text>
      </View>
    );
  }
  return <Redirect href={status === 'authed' ? '/(tabs)/radar' : '/login'} />;
}
