import { Region } from "../models/projectTypes";
import { ft2_to_m2, m2_to_ft2 } from "./conversions";

const M3H_TO_CFM = 0.5886;
const CFM_TO_M3H = 1.699;
const U_METRIC_TO_IMPERIAL = 0.1761;
const U_IMPERIAL_TO_METRIC = 1 / 0.1761;
const PSI_WK_TO_BTUHR_F = 1.895;
const PSI_BTUHR_F_TO_WK = 1 / 1.895;

export function toDisplayPsiAllowance(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return Math.round(value * PSI_WK_TO_BTUHR_F * 100) / 100;
    default:
      return Math.round(value * 100) / 100;
  }
}

export function fromDisplayPsiAllowance(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return Math.round(value * PSI_BTUHR_F_TO_WK * 1000) / 1000;
    default:
      return Math.round(value * 1000) / 1000;
  }
}

export function toDisplayUValue(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return round(value * U_METRIC_TO_IMPERIAL, 2);
    default:
      return round(value, 2);
  }
}

export function fromDisplayUValue(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return round(value * U_IMPERIAL_TO_METRIC, 4);
    default:
      return round(value, 4);
  }
}

export function toDisplayVentilation(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return round(value * M3H_TO_CFM, 2);
    default:
      return round(value, 2);
  }
}

export function fromDisplayVentilation(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return round(value * CFM_TO_M3H, 3);
    default:
      return round(value, 3);
  }
}

export function toDisplayTemperature(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return Math.round((value * 9) / 5 + 32);
    default:
      return Math.round(value);
  }
}

export function fromDisplayTemperature(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return Math.round((((value - 32) * 5) / 9) * 10) / 10;
    default:
      return value;
  }
}
// utils/display.ts
export function toDisplayLength(region: Region, meters?: number) {
  if (meters == null) return undefined;
  return region === "US" || region === "CA_IMPERIAL"
    ? +(meters * 3.28084).toFixed(2)
    : +meters.toFixed(2);
}

export function fromDisplayLength(region: Region, value?: number) {
  if (value == null) return undefined;
  return region === "US" || region === "CA_IMPERIAL" ? value / 3.28084 : value;
}
export function toDisplayArea(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return Math.round(m2_to_ft2(value) * 100) / 100; // 2 decimals
    default:
      return Math.round(value * 100) / 100; // m²
  }
}

/**
 * Convert UI display area → stored metric area
 */
export function fromDisplayArea(
  region: Region,
  value?: number
): number | undefined {
  if (value == null) return undefined;

  switch (region) {
    case "US":
    case "CA_IMPERIAL":
      return Math.round(ft2_to_m2(value) * 1000) / 1000;
    default:
      return value;
  }
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
