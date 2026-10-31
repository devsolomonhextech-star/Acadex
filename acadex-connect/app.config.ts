import type { ExpoConfig } from "expo/config";

const easProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
  "1b7e39ea-b560-48aa-9085-42c644affb14";
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,
  owner: "solo-code009s-team",
  android: {
    ...config.android,
    googleServicesFile,
  },
  extra: {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      ...(easProjectId ? { projectId: easProjectId } : {}),
    },
  },
});
