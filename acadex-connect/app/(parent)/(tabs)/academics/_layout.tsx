import { Stack } from "expo-router";
import { academicColors } from "../../../../src/features/academics";

export default function AcademicsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: academicColors.page },
        animation: "slide_from_right",
      }}
    />
  );
}
