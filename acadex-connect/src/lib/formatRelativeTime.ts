const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

/** Formats a timestamp as a compact, LinkedIn-style relative age. */
export function formatRelativeTime(value: string | Date, now = Date.now()): string {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";

  const difference = timestamp - now;
  const absoluteDifference = Math.abs(difference);
  const units = [
    { size: MONTH, name: "month" },
    { size: DAY, name: "day" },
    { size: HOUR, name: "hour" },
    { size: MINUTE, name: "minute" },
    { size: SECOND, name: "second" },
  ];

  if (absoluteDifference < SECOND) return "just now";

  const unit = units.find(({ size }) => absoluteDifference >= size) ?? units.at(-1)!;
  const count = Math.floor(absoluteDifference / unit.size);
  const label = `${count} ${unit.name}${count === 1 ? "" : "s"}`;
  return difference > 0 ? `in ${label}` : `${label} ago`;
}
