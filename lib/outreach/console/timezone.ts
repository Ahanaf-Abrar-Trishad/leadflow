/**
 * Timezone the outreach console's server-rendered pages format timestamps
 * in. These pages are React Server Components, so `toLocaleString(undefined,
 * ...)` resolves against the server's own system timezone, not the
 * operator's - on most hosts that's UTC regardless of where the operator
 * actually is. A single named constant keeps every page showing the same
 * wall-clock time an operator in Bangladesh actually reads on their clock.
 *
 * This only affects what's displayed in the console. It has no bearing on
 * `contacts.timezone`, which controls when mail actually sends and must
 * reflect the recipient's location, not the operator's.
 */
export const CONSOLE_TIMEZONE = "Asia/Dhaka";
