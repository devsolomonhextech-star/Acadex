import type { Href } from "expo-router";

/**
 * Alerts store the web path the family would open in a browser. The app maps
 * those paths onto its own routes so a push or an in-app alert always lands
 * somewhere useful. Query strings carry context (`/fees?student_id=…`) and are
 * passed through as route params rather than stripped.
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

const STUDENT_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function notificationRoute(link: unknown): Href | null {
  if (typeof link !== "string" || !link.startsWith("/")) return null;
  const [rawPath, rawQuery = ""] = link.split("#")[0].split("?");
  // Report-card alerts link straight to one child: `/academics/<student id>`.
  const studentMatch = /^\/academics\/([^/]+)$/.exec(rawPath);
  if (studentMatch && STUDENT_ID.test(studentMatch[1])) {
    return {
      pathname: "/(parent)/(tabs)/academics/[studentId]",
      params: { studentId: studentMatch[1] },
    } as Href;
  }
  const destination = DESTINATIONS[rawPath];
  if (!destination) return null;
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawQuery)) {
    if (value) params[key] = value;
  }
  if (!Object.keys(params).length) return destination;
  return { pathname: destination as string, params } as Href;
}
