export function uid(prefix = "r"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}
