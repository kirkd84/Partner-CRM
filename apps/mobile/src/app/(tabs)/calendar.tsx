import { View, Text } from 'react-native';

export default function CalendarScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-canvas p-6">
      <Text className="text-base font-semibold text-gray-900">Calendar</Text>
      <Text className="text-xs text-gray-500 text-center mt-1">
        Google / Apple / Storm sync + conflict detection ship in Phase 4.
      </Text>
    </View>
  );
}
