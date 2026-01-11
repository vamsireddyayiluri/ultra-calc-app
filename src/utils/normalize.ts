import { Region } from "../models/projectTypes";

export const U_IMPERIAL_TO_METRIC = 1 / 0.1761; // BTU/hr·ft²·°F → W/m²·K
export const FT_TO_M = 0.3048;
export const FT2_TO_M2 = 0.092903;
export const CFM_TO_M3_PER_H = 1.699;
export const PSI_BTUHR_F_TO_WK = 1 / 1.895;
export function normalizeLength(region: Region, value?: number): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_METRIC":
    case "CA_IMPERIAL":
      return value * FT_TO_M;
    default:
      return value; // already meters
  }
}

export function normalizeArea(region: Region, value?: number): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_METRIC":
    case "CA_IMPERIAL":
      return value * FT2_TO_M2;
    default:
      return value; // already m²
  }
}
export function normalizeTemperature(region: Region, value?: number): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
      return (value - 32) * (5 / 9);
    default:
      return value; // already °C
  }
}
export function normalizeUValue(region: Region, value?: number): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return value * U_IMPERIAL_TO_METRIC;
    default:
      return value; // already W/m²·K
  }
}
export function normalizeVentilation(region: Region, value?: number): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return value * CFM_TO_M3_PER_H;
    default:
      return value; // already m³/h
  }
}
export function normalizePsiAllowance(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return value * PSI_BTUHR_F_TO_WK; // → W/K
    default:
      return value; // already W/K
  }
}
