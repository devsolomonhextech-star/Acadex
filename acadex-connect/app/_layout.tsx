import "react-native-reanimated";
import "../global.css";
import "../src/services/queryLifecycle";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost } from "@rn-primitives/portal";
import { AuthProvider, useAuth } from "../src/services/auth";
import { colors } from "../src/theme/tokens";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

function RouteGuard() {
  const { parent, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    const atIndex = !segments.length || segments.join("/") === "index";
    if (!parent && !inAuth && !atIndex) router.replace("/(auth)/login");
    if (parent && inAuth) router.replace("/(parent)/(tabs)/home");
  }, [loading, parent, router, segments]);
  if (loading)
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.blue} size="large" />
      </View>
    );
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(parent)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <>
            <RouteGuard />
            <PortalHost />
          </>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
