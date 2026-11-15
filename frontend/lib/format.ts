export const DAY_MS = 86_400_000;

export function utcLabel(timestamp: string) {
  return new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function percent(value: number) {
  const rounded = Math.round((value + 1e-9) * 100) / 100;
  return `${rounded.toFixed(2)}%`;
}

export function numberLabel(value: number, digits = 2) {
  const formatted = value.toFixed(digits);
  return Number(formatted) === 0 ? (0).toFixed(digits) : formatted.replace("-", "−");
}
