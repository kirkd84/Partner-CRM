import { View, Text, ScrollView } from 'react-native';

export default function PartnersScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas">
      <View className="p-4">
        <Text className="text-xl font-semibold text-gray-900">Partners</Text>
        <Text className="mt-0.5 text-xs text-gray-500">
          Tap to drill into detail — full list + detail coming soon.
        </Text>
      </View>
    </ScrollView>
  );
}
