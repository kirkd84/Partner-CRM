import { View, Text } from 'react-native';

export default function HitListScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas p-6">
      <Text className="text-base font-semibold text-gray-900">Hit List</Text>
      <Text className="mt-1 text-center text-xs text-gray-500">
        Route optimization · Plan my day, navigate, mark visited.
      </Text>
    </View>
  );
}
