/**
 * Date handling for reports. Pure (no Prisma/env), unit-tested.
 *
 * The bank works in Nigerian time (Africa/Lagos, UTC+1, no daylight saving),
 * so "November" and "4 Nov" in a report mean Lagos days and months, not UTC
 * ones. Otherwise a loan created at 00:30 on 1 November Lagos time would be
 * counted in October.
 */

export const REPORT_UTC_OFFSET_MINUTES = 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** "2026-11" for the Lagos month containing this instant. */
export function monthKey(date: Date, offsetMinutes: number = REPORT_UTC_OFFSET_MINUTES): string {
  const shifted = new Date(date.getTime() + offsetMinutes * MS_PER_MINUTE);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}`;
}

/** True for a real calendar date written YYYY-MM-DD (so 2026-02-31 is false). */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** The instant a Lagos calendar day begins (inclusive lower bound). */
export function dayStart(dateString: string, offsetMinutes: number = REPORT_UTC_OFFSET_MINUTES): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - offsetMinutes * MS_PER_MINUTE);
}

/** The instant after a Lagos calendar day ends (exclusive upper bound). */
export function dayEndExclusive(dateString: string, offsetMinutes: number = REPORT_UTC_OFFSET_MINUTES): Date {
  return new Date(dayStart(dateString, offsetMinutes).getTime() + MS_PER_DAY);
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** "04 Nov 2026, 09:12" in Lagos time. */
export function formatLagosDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

/** "04 Nov 2026" in Lagos time. */
export function formatLagosDate(date: Date): string {
  return dateFormat.format(date);
}
