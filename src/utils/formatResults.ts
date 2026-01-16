import { Region } from "../models/projectTypes";



export function formatSpacing(
  region: Region,
  spacing_mm?: number
): string {
  if (!spacing_mm) return "—";
    const isImperial =
    region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC";
  if (isImperial) {
    const feet = spacing_mm / 304.8;
    return `${feet.toFixed(2)} ft`;
  }

  return `${spacing_mm} mm`;
}
