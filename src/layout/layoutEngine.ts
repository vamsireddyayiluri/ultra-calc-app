import { computeGrid, getDirection } from "./layoutMath";
import { finBlockAsset, pipeBridgeAsset, endCapAsset } from "./assetResolver";
import { Joist, LoadMode } from "./blockConstants";
import { InstallMethod } from "../utils/ultraCalcLocked";
import { Tile } from "./layoutTypes";

interface LayoutInput {
  roomLength_m: number;
  roomWidth_m: number;
  joist: Joist;
  load: LoadMode;
  method: InstallMethod;
}

export function buildLayout(input: LayoutInput) {
  let { cols, rows, block } = computeGrid(
    input.roomLength_m,
    input.roomWidth_m,
    input.joist,
    input.load
  );
  
  const connectorFactorByJoist: Record<number, number> = {
    12: 0.94,
    16: 1,
    19: 0.97,
    24: 1,
  };

  const connectorW = block.w * (connectorFactorByJoist[input.joist] ?? 1);

  const connectorX = (c: number) => c * block.w + (block.w - connectorW) / 2;

  const dir = getDirection(input.method);
  const tiles: Tile[] = [];

  const isAcross = input.method === "OPEN_WEB" || input.method === "DRILLING";

  const centerX = (c: number) => c * block.w + block.w / 2;

  const TOP_Y = -block.h * 0.5;
  const BOTTOM_Y = rows * block.h - block.h * 0.5;

  // ===============================
  // FIN BLOCKS (REAL AREA)
  // ===============================
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        type: "FB",
        x: c * block.w,
        y: r * block.h,
        w: block.w,
        h: block.h,
        asset: finBlockAsset(input.joist, input.load, dir),
      });
    }
  }

  // ===============================
  // ACROSS-JOIST → END CAPS ONLY
  // ===============================
  if (isAcross) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        type: "EC",
        x: connectorX(c),
        y: TOP_Y,
        w: connectorW,
        h: block.h,
        asset: endCapAsset(input.joist, "T", input.method),
      });

      tiles.push({
        type: "EC",
        x: connectorX(c),
        y: BOTTOM_Y,
        w: connectorW,
        h: block.h,
        asset: endCapAsset(input.joist, "B", input.method),
      });
    }

    return {
      tiles,
      width: cols * block.w,
      height: rows * block.h,
    };
  }

  // ===============================
  // WITH-JOIST → PIPE BRIDGES
  // ===============================
  // --- TOP-LEFT START BRIDGE ---
  tiles.push({
    type: "PB",
    x: connectorX(0),
    y: TOP_Y,
    w: connectorW,
    h: block.h,
    asset: pipeBridgeAsset(input.joist, "TL", input.method),
  });

  for (let c = 0; c < cols; c++) {
    
    const isDown = c % 2 === 0;

    // ---- TOP CONNECTION ----
    // ---- TOP CONNECTION ----
    if (c === 0) {
      // first column always starts with end cap
      tiles.push({
        type: "EC",
        x: 0,
        y: TOP_Y,
        w: block.w,
        h: block.h,
        asset: endCapAsset(input.joist, "T", input.method),
      });
    } else {
      // pipe bridge connects previous column → this column
      const prevIsDown = (c - 1) % 2 === 0;

      tiles.push({
        type: "PB",
        x: connectorX(c),
        y: TOP_Y,
        w: connectorW,
        h: block.h,
        asset: pipeBridgeAsset(
          input.joist,
          prevIsDown ? "TR" : "TL",
          input.method
        ),
      });
    }

    // ---- BOTTOM CONNECTION ----
    if (c === cols - 1) {
      tiles.push({
        type: "EC",
        x: c * block.w,
        y: BOTTOM_Y,
        w: block.w,
        h: block.h,
        asset: endCapAsset(input.joist, "B", input.method),
      });
    } else {
      tiles.push({
        type: "PB",
        x: connectorX(c),
        y: BOTTOM_Y,
        w: connectorW,
        h: block.h,
        asset: pipeBridgeAsset(input.joist, isDown ? "BR" : "BL", input.method),
      });
    }
  }
  // --- BOTTOM-RIGHT END BRIDGE ---
  tiles.push({
    type: "PB",
    x: (cols - 1) * block.w + block.w / 2 - block.w / 2,
    y: rows * block.h - block.h * 0.5,
    w: block.w,
    h: block.h,
    asset: pipeBridgeAsset(input.joist, "BL", input.method),
  });

  return {
    tiles,
    width: cols * block.w,
    height: rows * block.h,
  };
}
