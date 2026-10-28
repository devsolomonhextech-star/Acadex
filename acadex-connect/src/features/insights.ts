import type {
  AttendanceRecord,
  AttendanceSummary,
  FeeInvoice,
  FeePayment,
  FeesSummary,
} from "../types/models";

/**
 * Shared palette for the parent attendance and fee experiences. The values
 * deliberately sit beside the academics palette so both sections of the app
 * share the same soft, blue-led language.
 */
export const insightColors = {
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
  heroStart: "#0A379F",
  heroMid: "#155EEF",
  heroEnd: "#3094FF",
  feeHeroStart: "#082B72",
  feeHeroMid: "#0E4AC4",
  feeHeroEnd: "#2D8CFF",
  mint: "#7FF0C4",
  mintDeep: "#B7F7DD",
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
  track: "#EEF3FA",
} as const;

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
  "excused",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  { label: string; color: string; soft: string; deep: string }
> = {
  present: {
    label: "Present",
    color: insightColors.green,
    soft: insightColors.greenSoft,
    deep: insightColors.greenDark,
  },
  late: {
    label: "Late",
    color: insightColors.amber,
    soft: insightColors.amberSoft,
    deep: insightColors.amberText,
  },
  absent: {
    label: "Absent",
    color: insightColors.red,
    soft: insightColors.redSoft,
    deep: insightColors.redText,
  },
  excused: {
    label: "Excused",
    color: insightColors.blueBright,
    soft: insightColors.blueSoft,
    deep: insightColors.blueDeep,
  },
};

export function initialsOf(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "AC";
}

export function parseDay(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLongDate(value: string) {
  const date = parseDay(value);
  if (!date) return value;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(value: string) {
  const date = parseDay(value);
  if (!date) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function dateTile(value: string) {
  const date = parseDay(value);
  if (!date) return { day: "—", month: "—" };
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
  };
}

export function formatMoney(value: string | number, currency: string | null) {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = safe.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

export function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function prettyTerm(value: string) {
  const match = value.match(/^term\s*(\d+)$/i);
  return match ? `Term ${match[1]}` : value;
}

export type AttendanceStats = {
  counts: Record<AttendanceStatus, number>;
  total: number;
  rate: number;
  presentOrLate: number;
  presentOnlyRate: number;
};

export function attendanceStats(summary?: AttendanceSummary): AttendanceStats {
  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
  };
  for (const record of summary?.records ?? []) {
    if (record.status in counts) counts[record.status] += 1;
  }
  const total = summary?.records.length ?? 0;
  const presentOrLate = counts.present + counts.late;
  return {
    counts,
    total,
    presentOrLate,
    rate: total ? Math.round((presentOrLate / total) * 100) : 0,
    presentOnlyRate: total ? Math.round((counts.present / total) * 100) : 0,
  };
}

export type WeekAttendance = {
  start: Date;
  label: string;
  year: number;
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number;
};

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function weekKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Groups records into Monday-starting weeks. Only weeks that actually contain
 * a recorded day are returned, so the chart never pretends a missing school
 * week was an absence.
 */
export function weeklyAttendance(
  records: AttendanceRecord[],
): WeekAttendance[] {
  const groups = new Map<
    string,
    { start: Date; records: AttendanceRecord[] }
  >();
  for (const record of records) {
    const date = parseDay(record.date);
    if (!date) continue;
    const start = startOfWeek(date);
    const key = weekKey(start);
    const group = groups.get(key) ?? { start, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map(({ start, records: weekRecords }) => {
      const present = weekRecords.filter(
        (item) => item.status === "present",
      ).length;
      const late = weekRecords.filter((item) => item.status === "late").length;
      const absent = weekRecords.filter(
        (item) => item.status === "absent",
      ).length;
      const excused = weekRecords.filter(
        (item) => item.status === "excused",
      ).length;
      return {
        start,
        label: start.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        year: start.getFullYear(),
        total: weekRecords.length,
        present,
        late,
        absent,
        excused,
        rate: weekRecords.length
          ? Math.round(((present + late) / weekRecords.length) * 100)
          : 0,
      };
    });
}

export function sortedRecords(records: AttendanceRecord[]) {
  return [...records].sort((a, b) => b.date.localeCompare(a.date));
}

export type FeeStatusTone = "paid" | "partial" | "due" | "none";

export type FeeSummary = {
  currency: string | null;
  total: number;
  paid: number;
  outstanding: number;
  paidPercent: number;
  invoiceCount: number;
  paymentCount: number;
  status: { label: string; tone: FeeStatusTone };
};

export function feeSummary(data?: FeesSummary): FeeSummary {
  const total = Number(data?.invoiced_total ?? 0);
  const paid = Number(data?.paid_total ?? 0);
  const outstanding = Number(data?.outstanding_total ?? 0);
  const paidPercent =
    total > 0
      ? Math.max(0, Math.min(100, Math.round((paid / total) * 100)))
      : 0;
  const status =
    total <= 0
      ? { label: "No fees yet", tone: "none" as const }
      : outstanding <= 0
        ? { label: "Paid in full", tone: "paid" as const }
        : paid > 0
          ? { label: "Partially paid", tone: "partial" as const }
          : { label: "Payment due", tone: "due" as const };
  return {
    currency: data?.currency ?? null,
    total,
    paid,
    outstanding,
    paidPercent,
    invoiceCount: data?.invoices.length ?? 0,
    paymentCount: data?.payments.length ?? 0,
    status,
  };
}

export type InvoiceState = {
  balance: number;
  paidPercent: number;
  label: "Paid" | "Partial" | "Pending" | "Void";
  tone: FeeStatusTone;
};

export function invoiceState(invoice: FeeInvoice): InvoiceState {
  const total = Number(invoice.total_amount);
  const paid = Number(invoice.paid_amount);
  const balance = Math.max(Number(invoice.balance), 0);
  const paidPercent =
    total > 0
      ? Math.max(0, Math.min(100, Math.round((paid / total) * 100)))
      : 0;
  if (invoice.status === "void")
    return { balance, paidPercent, label: "Void", tone: "none" };
  if (balance <= 0)
    return { balance, paidPercent: 100, label: "Paid", tone: "paid" };
  if (paid > 0)
    return { balance, paidPercent, label: "Partial", tone: "partial" };
  return { balance, paidPercent, label: "Pending", tone: "due" };
}

export function sortedInvoices(invoices: FeeInvoice[]) {
  return [...invoices].sort((a, b) => b.issued_on.localeCompare(a.issued_on));
}

export function sortedPayments(payments: FeePayment[]) {
  return [...payments].sort((a, b) =>
    b.payment_date.localeCompare(a.payment_date),
  );
}

export function paymentMethodLabel(method: string) {
  const map: Record<string, string> = {
    bank_transfer: "Bank transfer",
    mobile_money: "Mobile money",
    cash: "Cash",
    card: "Card",
  };
  return map[method] ?? titleCase(method);
}

export function paymentStatus(status: string) {
  if (["recorded", "posted", "confirmed", "completed"].includes(status))
    return { label: "Confirmed", tone: "paid" as FeeStatusTone };
  if (status === "pending")
    return { label: "Pending", tone: "partial" as FeeStatusTone };
  return { label: titleCase(status), tone: "none" as FeeStatusTone };
}

export function statusColors(tone: FeeStatusTone) {
  if (tone === "paid")
    return {
      color: insightColors.greenDark,
      background: insightColors.greenSoft,
      dot: insightColors.green,
    };
  if (tone === "partial")
    return {
      color: insightColors.amberText,
      background: insightColors.amberSoft,
      dot: insightColors.amber,
    };
  if (tone === "due")
    return {
      color: insightColors.redText,
      background: insightColors.redSoft,
      dot: insightColors.red,
    };
  return {
    color: insightColors.muted,
    background: "#EEF2F7",
    dot: insightColors.mutedLight,
  };
}
