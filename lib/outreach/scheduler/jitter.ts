/** ±40% jitter around a base interval — a fixed interval is itself a
 * bulk-sender fingerprint. */
export function applyJitter(baseSeconds: number, random: () => number = Math.random): number {
  const factor = 1 + (random() * 2 - 1) * 0.4;
  return Math.max(1, Math.round(baseSeconds * factor));
}
