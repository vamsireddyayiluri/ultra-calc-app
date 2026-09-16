import { HeatingSystem, Region, RoomResults } from "../models/projectTypes";
import { W_to_Btuh, Wpm2_to_Btuhft2 } from "./conversions";
import { formatRequiredWaterTemperature } from "./formatWaterTemperature";

export interface DisplayRoomResults {
totalHeat: string
  loadDensity: string;

  qFabric: string;
  qVent: string;
  qPsi: string;
  qGround: string;

  waterTemp: string;
}
export function formatRoomResults(
  region: Region,
  r: RoomResults,
  heatingSystem?: HeatingSystem,
): DisplayRoomResults {
  const isImperial =
    region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC";

  return {
    totalHeat: isImperial
      ? `${Math.round(W_to_Btuh(r.qAfterFactors_W))} Btu/h`
      : `${Math.round(r.qAfterFactors_W)} W`,

    loadDensity: isImperial
      ? `${Wpm2_to_Btuhft2(r.load_W_per_m2).toFixed(1)} Btu/hr·ft²`
      : `${r.load_W_per_m2.toFixed(1)} W/m²`,

    qFabric: isImperial
      ? `${Math.round(W_to_Btuh(r.qFabric_W))} Btu/h`
      : `${Math.round(r.qFabric_W)} W`,

    qVent: isImperial
      ? `${Math.round(W_to_Btuh(r.qVent_W))} Btu/h`
      : `${Math.round(r.qVent_W)} W`,

    qPsi: isImperial
      ? `${Math.round(W_to_Btuh(r.qPsi_W))} Btu/h`
      : `${Math.round(r.qPsi_W)} W`,

    qGround: isImperial
      ? `${Math.round(W_to_Btuh(r.qGround_W))} Btu/h`
      : `${Math.round(r.qGround_W)} W`,

    waterTemp: formatRequiredWaterTemperature(
      region,
      heatingSystem,
      r.waterTemp_C,
      isImperial,
    ),
  };
}
