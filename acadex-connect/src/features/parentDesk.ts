import {
  CalendarX2,
  FileText,
  MessageCircle,
  UserCog,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import type { ParentRequestStatus, ParentRequestTopic } from "../types/models";

export type RequestTopicId = ParentRequestTopic;

export type RequestTopic = {
  id: RequestTopicId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  color: string;
  soft: string;
};

export const REQUEST_TOPICS: RequestTopic[] = [
  {
    id: "absence",
    title: "Report an absence",
    subtitle: "Let school know",
    icon: CalendarX2,
    color: "#16845B",
    soft: "#E3F8ED",
  },
  {
    id: "documents",
    title: "Request a document",
    subtitle: "Reports & letters",
    icon: FileText,
    color: "#155EEF",
    soft: "#EAF3FF",
  },
  {
    id: "meeting",
    title: "Meet a teacher",
    subtitle: "Ask for a meeting",
    icon: UsersRound,
    color: "#9B51E0",
    soft: "#F3EAFF",
  },
  {
    id: "fees",
    title: "Fees & receipts",
    subtitle: "Payment questions",
    icon: Wallet,
    color: "#A65B07",
    soft: "#FDF0D5",
  },
  {
    id: "details",
    title: "Update my details",
    subtitle: "Contact information",
    icon: UserCog,
    color: "#0E7C78",
    soft: "#DDF7F3",
  },
  {
    id: "other",
    title: "Something else",
    subtitle: "General enquiry",
    icon: MessageCircle,
    color: "#65738A",
    soft: "#EEF2F7",
  },
];

/** Status vocabulary shared by the request card and the thread sheet. */
export const REQUEST_STATUS: Record<
  ParentRequestStatus,
  { label: string; short: string; bg: string; fg: string }
> = {
  open: {
    label: "Awaiting school reply",
    short: "Sent",
    bg: "#EAF3FF",
    fg: "#155EEF",
  },
  awaiting_parent: {
    label: "Reply ready",
    short: "Reply",
    bg: "#FFF3E4",
    fg: "#A65B07",
  },
  resolved: {
    label: "Resolved",
    short: "Resolved",
    bg: "#E3F8ED",
    fg: "#16845B",
  },
};

export function requestTopicById(id: ParentRequestTopic) {
  return REQUEST_TOPICS.find((topic) => topic.id === id) ?? REQUEST_TOPICS[5];
}

export function formatRequestDate(date: Date) {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatRequestTimestamp(value: string) {
  return formatRequestDate(new Date(value));
}

export function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
