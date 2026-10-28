import type { Child, DailyActivity, TermReportCard } from "../types/models";

/**
 * Palette sampled from the academics design. Keeping these values together
 * makes it easy for every academics surface to stay visually consistent.
 */
export const academicColors = {
  page: "#F4F8FD",
  card: "#FFFFFF",
  border: "#E7EEF8",
  ink: "#15233B",
  muted: "#65738A",
  mutedLight: "#8B98AA",
  blue: "#155EEF",
  blueBright: "#2D73F5",
  blueDeep: "#12347A",
  blueSoft: "#EAF3FF",
  blueTint: "#E7F2FF",
  green: "#1FA968",
  greenDark: "#16845B",
  greenSoft: "#E3F8ED",
  greenTint: "#DDF5E8",
  amber: "#F5A623",
  amberText: "#A65B07",
  amberSoft: "#FDF0D5",
  red: "#E5484D",
  redText: "#B42318",
  redSoft: "#FBE4E5",
  purple: "#A855F7",
  purpleSoft: "#F3EAFF",
  track: "#EAF0FA",
} as const;

export const avatarTones = [
  { background: "#E3ECFF", foreground: "#2F6BEA" },
  { background: "#EDE3FF", foreground: "#7B3FE4" },
  { background: "#D7F8F3", foreground: "#0E7C78" },
  { background: "#F0E4FF", foreground: "#7A3DE0" },
] as const;

export type ChildAcademic = {
  child: Child;
  activities: DailyActivity[];
  completed: number;
  pending: number;
  dueToday: number;
  overdue: number;
  total: number;
  percent: number;
  onTrack: boolean;
};

export type SubjectPerformance = {
  name: string;
  percent: number;
  assessments: number;
};

export type TrendPoint = {
  label: string;
  value: number;
  date: Date;
};

export function initialsFor(child?: Child | null) {
  if (!child) return "AC";
  const first = child.first_name?.[0] ?? "";
  const last = child.last_name?.[0] ?? "";
  return `${first}${last}`.toUpperCase() || "AC";
}

export function childName(child?: Child | null) {
  if (!child) return "Student";
  return `${child.first_name} ${child.last_name}`.trim();
}

export function avatarTone(index: number) {
  return avatarTones[Math.abs(index) % avatarTones.length];
}

export function summariseActivities(
  child: Child,
  activities: DailyActivity[],
): ChildAcademic {
  const total = activities.length;
  const completed = activities.filter(
    (activity) => activity.state === "completed",
  ).length;
  const dueToday = activities.filter(
    (activity) => activity.state === "due_today",
  ).length;
  const overdue = activities.filter(
    (activity) => activity.state === "overdue",
  ).length;
  const pending = Math.max(total - completed - overdue, 0);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return {
    child,
    activities,
    completed,
    pending,
    dueToday,
    overdue,
    total,
    percent,
    onTrack: percent >= 65,
  };
}

export function aggregateProgress(rows: ChildAcademic[]) {
  return rows.reduce(
    (total, row) => ({
      completed: total.completed + row.completed,
      dueToday: total.dueToday + row.dueToday,
      overdue: total.overdue + row.overdue,
    }),
    { completed: 0, dueToday: 0, overdue: 0 },
  );
}

export function progressTone(percent: number) {
  if (percent >= 65) return academicColors.green;
  if (percent >= 50) return academicColors.amber;
  return academicColors.red;
}

export function progressTrack(percent: number) {
  if (percent >= 65) return academicColors.greenTint;
  if (percent >= 50) return "#EFF2F7";
  return "#F8E7E8";
}

export function subjectTone(percent: number) {
  if (percent >= 70) return academicColors.green;
  if (percent >= 50) return academicColors.amber;
  return academicColors.red;
}

function numberValue(value: string | number | null | undefined) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Prefer the school's published subject results. When no report has been
 * published we fall back to the child's own recorded activity scores so the
 * card still has something meaningful to show.
 */
export function subjectPerformance(
  activities: DailyActivity[],
  report?: TermReportCard | null,
): SubjectPerformance[] {
  if (report?.subjects?.length) {
    return report.subjects
      .map((subject) => ({
        name: subject.subject_name,
        percent: Math.round(numberValue(subject.weighted_total) ?? 0),
        assessments: subject.assessment_count,
      }))
      .filter((subject) => subject.name);
  }

  const grouped = new Map<
    string,
    { scores: number[]; total: number; completed: number }
  >();
  for (const activity of activities) {
    const name = activity.subject_name || "Other";
    const entry = grouped.get(name) ?? { scores: [], total: 0, completed: 0 };
    entry.total += 1;
    if (activity.state === "completed") entry.completed += 1;
    if (activity.score_percent != null) {
      const score = numberValue(activity.score_percent);
      if (score != null) entry.scores.push(score);
    }
    grouped.set(name, entry);
  }
  return [...grouped.entries()]
    .map(([name, entry]) => {
      const average = entry.scores.length
        ? entry.scores.reduce((sum, value) => sum + value, 0) /
          entry.scores.length
        : entry.total
          ? (entry.completed / entry.total) * 100
          : 0;
      return {
        name,
        percent: Math.round(average),
        assessments: entry.total,
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

export function recentActivities(activities: DailyActivity[]) {
  return [...activities].sort((a, b) =>
    String(b.due_on ?? "").localeCompare(String(a.due_on ?? "")),
  );
}

export function activityStatus(activity: DailyActivity) {
  if (activity.state === "completed")
    return {
      label: "Completed",
      color: academicColors.greenDark,
      background: academicColors.greenSoft,
    };
  if (activity.state === "overdue")
    return {
      label: "Overdue",
      color: academicColors.redText,
      background: academicColors.redSoft,
    };
  return {
    label: "Pending",
    color: academicColors.amberText,
    background: academicColors.amberSoft,
  };
}

function parseDay(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatActivityDate(value: string | null | undefined) {
  const date = parseDay(value);
  if (!date) return "No date set";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Builds the four-point "weekly progress" line. Each point is the share of
 * activities that were completed by the end of that week, anchored to the most
 * recent piece of work so the chart still opens on the child's current term.
 */
export function weeklyTrend(
  activities: DailyActivity[],
  weeks = 4,
): TrendPoint[] {
  const dated = activities
    .map((activity) => ({ activity, date: parseDay(activity.due_on) }))
    .filter(
      (item): item is { activity: DailyActivity; date: Date } =>
        item.date !== null,
    );
  const anchor =
    dated.length > 0
      ? new Date(Math.max(...dated.map((item) => item.date.getTime())))
      : new Date();
  const start = new Date(anchor);
  start.setDate(start.getDate() - (weeks - 1) * 7);

  return Array.from({ length: weeks }, (_, index) => {
    const end = new Date(start);
    end.setDate(end.getDate() + index * 7);
    end.setHours(23, 59, 59, 999);
    const dueBy = dated.filter((item) => item.date.getTime() <= end.getTime());
    const completed = dueBy.filter(
      (item) => item.activity.state === "completed",
    ).length;
    return {
      label: shortDate(end),
      value: dueBy.length ? Math.round((completed / dueBy.length) * 100) : 0,
      date: end,
    };
  });
}
