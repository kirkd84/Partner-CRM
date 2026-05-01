import { View, Text, ScrollView } from 'react-native';

export default function RadarScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas">
      <View className="p-4">
        <Text className="text-xl font-semibold text-gray-900">Radar</Text>
        <Text className="mt-0.5 text-xs text-gray-500">PartnerRadar — Roof Technologies</Text>
      </View>
      <View className="grid grid-cols-2 gap-3 px-4">
        {['New Lead', 'Researched', 'Initial Contact', 'Meeting Scheduled'].map((label) => (
          <View key={label} className="mb-3 rounded-lg bg-white p-4 shadow-sm">
            <Text className="text-xs text-gray-500">{label}</Text>
            <Text className="mt-1 text-3xl font-semibold text-gray-900">—</Text>
          </View>
        ))}
      </View>
      <View className="p-4">
        <Text className="text-xs text-gray-500">
          Live activity feed + stats coming soon. Scaffold view.
        </Text>
      </View>
    </ScrollView>
  );
}
