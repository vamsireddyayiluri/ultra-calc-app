import { Region } from "../models/projectTypes";

export function formatSpacing(region: Region, spacing_mm?: number): string {
  if (!spacing_mm) return "—";
  const isImperial =
    region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC";
  if (isImperial) {
    const inches = spacing_mm / 25.4;
    return `${inches.toFixed(0)}"`;
  }

  return `${spacing_mm} mm`;
}
export function formatTubeSizing(region: Region, spacing_mm?: number): string {
  if (!spacing_mm) return "—";

  const isImperial =
    region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC";

  if (isImperial) {
    const tubeSizeMap: Record<number, string> = {
      16: '1/2"',
      20: '3/4"',
    };

    return tubeSizeMap[spacing_mm] || `${(spacing_mm / 25.4).toFixed(2)}"`;
  }

  return `${spacing_mm} mm`;
}

