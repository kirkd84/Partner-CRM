import { View, Text, TouchableOpacity } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';

export default function MoreScreen() {
  const router = useRouter();

  async function signOut() {
    await SecureStore.deleteItemAsync('pr_session_token');
    router.replace('/login');
  }

  return (
    <View className="flex-1 gap-2 bg-canvas p-4">
      <TouchableOpacity className="rounded-md border border-gray-200 bg-white p-4">
        <Text className="text-sm font-medium">Reports</Text>
        <Text className="text-xs text-gray-500">Coming soon</Text>
      </TouchableOpacity>
      <TouchableOpacity className="rounded-md border border-gray-200 bg-white p-4">
        <Text className="text-sm font-medium">Admin</Text>
        <Text className="text-xs text-gray-500">Manager only</Text>
      </TouchableOpacity>
      <TouchableOpacity className="rounded-md border border-gray-200 bg-white p-4">
        <Text className="text-sm font-medium">Settings</Text>
      </TouchableOpacity>
      <TouchableOpacity className="mt-3 items-center rounded-md bg-danger p-4" onPress={signOut}>
        <Text className="text-sm font-medium text-white">Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
