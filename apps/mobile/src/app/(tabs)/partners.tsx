import { View, Text, ScrollView } from 'react-native';

export default function PartnersScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas">
      <View className="p-4">
        <Text className="text-xl font-semibold text-gray-900">Partners</Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          Tap to drill into detail — list + detail land in Phase 2.
        </Text>
      </View>
    </ScrollView>
  );
}
