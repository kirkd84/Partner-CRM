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
    <View className="flex-1 bg-canvas p-4 gap-2">
      <TouchableOpacity className="bg-white rounded-md p-4 border border-gray-200">
        <Text className="text-sm font-medium">Reports</Text>
        <Text className="text-xs text-gray-500">Phase 10</Text>
      </TouchableOpacity>
      <TouchableOpacity className="bg-white rounded-md p-4 border border-gray-200">
        <Text className="text-sm font-medium">Admin</Text>
        <Text className="text-xs text-gray-500">Phase 3+ (manager+)</Text>
      </TouchableOpacity>
      <TouchableOpacity className="bg-white rounded-md p-4 border border-gray-200">
        <Text className="text-sm font-medium">Settings</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="bg-danger rounded-md p-4 mt-3 items-center"
        onPress={signOut}
      >
        <Text className="text-white text-sm font-medium">Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}
