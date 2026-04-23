import { View, Text } from 'react-native';

export default function HitListScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas p-6">
      <Text className="text-base font-semibold text-gray-900">Hit List</Text>
      <Text className="text-xs text-gray-500 text-center mt-1">
        Route optimization lives in Phase 9 · Plan my day, navigate, mark visited.
      </Text>
    </View>
  );
}
