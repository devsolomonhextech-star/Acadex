import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "../src/services/auth";

const ONBOARDING_KEY = "acadex-parent-onboarding-complete";

export default function Index() {
  const { parent, loading } = useAuth();
  const [destination, setDestination] = useState<
    "/(auth)/login" | "/(auth)/onboarding" | null
  >(null);

  useEffect(() => {
    if (loading || parent) return;
    let active = true;
    void SecureStore.getItemAsync(ONBOARDING_KEY).then((complete) => {
      if (active)
        setDestination(
          complete === "true" ? "/(auth)/login" : "/(auth)/onboarding",
        );
    });
    return () => {
      active = false;
    };
  }, [loading, parent]);

  if (parent) return <Redirect href="/(parent)/(tabs)/home" />;
  return destination ? <Redirect href={destination} /> : null;
}
