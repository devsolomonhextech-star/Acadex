import type { Href } from "expo-router";

/**
 * Alerts store the web path the family would open in a browser. The app maps
 * those paths onto its own routes so a push or an in-app alert always lands
 * somewhere useful — query strings (`/parents?request=…`) are stripped first.
 */
const DESTINATIONS: Record<string, Href> = {
  "/attendance": "/(parent)/attendance",
  "/fees": "/(parent)/fees",
  "/timetable": "/(parent)/timetable",
  "/announcements": "/(parent)/announcements",
  "/academics": "/(parent)/(tabs)/academics",
  "/notifications": "/(parent)/(tabs)/notifications",
  "/children": "/(parent)/children",
  "/parents": "/(parent)/(tabs)/parent-desk",
  "/parent-desk": "/(parent)/(tabs)/parent-desk",
};

export function notificationRoute(link: unknown): Href | null {
  if (typeof link !== "string" || !link.startsWith("/")) return null;
  const path = link.split("?")[0].split("#")[0];
  return DESTINATIONS[path] ?? null;
}
