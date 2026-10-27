import { Redirect } from "expo-router";
import { useAuth } from "../src/services/auth";
export default function Index() {
  const { parent, loading } = useAuth();
  return loading ? null : (
    <Redirect href={parent ? "/(parent)/(tabs)/home" : "/(auth)/login"} />
  );
}
