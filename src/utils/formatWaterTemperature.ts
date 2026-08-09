import { Region, HeatingSystem } from "../models/projectTypes";
import { getUIUnits } from "../helpers/updateUiLabels";
import { C_to_F } from "./conversions";

const LOWEST_PRACTICAL_HEAT_PUMP_TEMP_C = 35;

export const HEAT_PUMP_WATER_TEMPERATURE_NOTE =
  "Heat Pump operating range. Most days operate near the lower temperature. Colder conditions may require temperatures up to the maximum shown.";

function formatTemperature(tempC: number, imperial: boolean): string {
  return imperial
    ? `${Math.round(C_to_F(tempC))} °F`
    : `${Math.round(tempC)} °C`;
}

export function formatRequiredWaterTemperature(
  region: Region,
  heatingSystem: HeatingSystem | undefined,
  calculatedTempC: number,
  standardImperial: boolean,
): string {
  if (heatingSystem !== "HEAT_PUMP") {
    return formatTemperature(calculatedTempC, standardImperial);
  }

  const imperial = getUIUnits(region).temperature === "°F";
  const low = formatTemperature(LOWEST_PRACTICAL_HEAT_PUMP_TEMP_C, imperial);
  const high = formatTemperature(
    Math.max(LOWEST_PRACTICAL_HEAT_PUMP_TEMP_C, calculatedTempC),
    imperial,
  );

  if (low === high) {
    return `${low} Required Temperature`;
  }

  return `${low} – ${high} Required Temperature`;
}
