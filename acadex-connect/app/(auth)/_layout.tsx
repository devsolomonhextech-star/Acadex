import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade_from_bottom",
        contentStyle: { backgroundColor: "#F6F9FF" },
      }}
    >
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
    </Stack>
  );
}
