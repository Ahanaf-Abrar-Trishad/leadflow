export interface BusinessHoursConfig {
  startHour: number; // 0-23, local to `timezone`
  endHour: number; // 0-23, local, exclusive
  days: number[]; // 0=Sun..6=Sat
}

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MAX_HOURS_TO_SEARCH = 8 * 24; // up to 8 days forward

/**
 * Rolls `date` forward to the next moment inside the configured business
 * window, evaluated in `timezone`. Returns `date` unchanged if it already
 * falls inside the window.
 */
export function nextBusinessWindow(date: Date, timezone: string, config: BusinessHoursConfig): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });

  let candidate = new Date(date);
  for (let i = 0; i < MAX_HOURS_TO_SEARCH; i++) {
    const parts = formatter.formatToParts(candidate);
    const weekday = parts.find((p) => p.type === "weekday")!.value;
    const hour = Number(parts.find((p) => p.type === "hour")!.value);
    const day = DAY_INDEX[weekday];

    if (config.days.includes(day) && hour >= config.startHour && hour < config.endHour) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
  }
  return candidate;
}
