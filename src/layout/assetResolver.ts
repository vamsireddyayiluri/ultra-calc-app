import { InstallMethod } from "../models/projectTypes";
import { Joist, LoadMode, Direction, JOIST_MM } from "./blockConstants";

export function finBlockAsset(joist: Joist, load: LoadMode, dir: Direction) {
  return `/assets/diagrams/FB_${joist}-${JOIST_MM[joist]}_${load}_${dir}.svg`;
}

export function pipeBridgeAsset(
  joist: Joist,
  pos: "TL" | "TR" | "BL" | "BR",
  method: InstallMethod
) {
  if (method === "OPEN_WEB" || method === "DRILLING") return null;

  // 24" joists use CENTER / SIDE variants
  if (joist === 24) {
    const map: Record<string, string> = {
      TL: "TS",
      TR: "TS",
      BL: "BC",
      BR: "BC",
    };

    return `/assets/diagrams/PB_24-600_${map[pos]}.svg`;
  }

  return `/assets/diagrams/PB_${joist}-${JOIST_MM[joist]}_${pos}.svg`;
}

export function endCapAsset(
  joist: Joist,
  pos: "T" | "B",
  method: InstallMethod
) {
  const isOpenWeb = method === "OPEN_WEB" || method === "DRILLING";
  return isOpenWeb
    ? `/assets/diagrams/EC_${joist}-${JOIST_MM[joist]}_${pos}.svg`
    : null;
}

