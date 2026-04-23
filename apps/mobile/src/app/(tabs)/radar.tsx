import { View, Text, ScrollView } from 'react-native';

export default function RadarScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas">
      <View className="p-4">
        <Text className="text-xl font-semibold text-gray-900">Radar</Text>
        <Text className="text-xs text-gray-500 mt-0.5">PartnerRadar — Roof Technologies</Text>
      </View>
      <View className="px-4 grid grid-cols-2 gap-3">
        {['New Lead', 'Researched', 'Initial Contact', 'Meeting Scheduled'].map((label) => (
          <View key={label} className="bg-white rounded-lg p-4 shadow-sm mb-3">
            <Text className="text-xs text-gray-500">{label}</Text>
            <Text className="text-3xl font-semibold text-gray-900 mt-1">—</Text>
          </View>
        ))}
      </View>
      <View className="p-4">
        <Text className="text-xs text-gray-500">
          Live activity feed + stats arrive in Phase 2. This screen is the Phase 1 scaffold.
        </Text>
      </View>
    </ScrollView>
  );
}
