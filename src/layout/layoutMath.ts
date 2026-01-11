import { InstallMethod } from "../utils/ultraCalcLocked";
import { BLOCK_SIZE_M, Direction, Joist, LoadMode } from "./blockConstants";

export function getDirection(method: InstallMethod): Direction {
  return method === "DRILLING" || method === "OPEN_WEB"
    ? "drilled"
    : "parallel";
}
export function computeGrid(
  roomLength_m: number,
  roomWidth_m: number,
  joist: Joist,
  load: LoadMode
) {
  const block = BLOCK_SIZE_M[joist][load];

  const cols = Math.floor(roomWidth_m / block.w);
  const rows = Math.floor(roomLength_m / block.h);

  return {
    cols,
    rows,
    block,
    area_m2: cols * rows * block.w * block.h,
  };
}
