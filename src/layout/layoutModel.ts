export interface LayoutTile {
  kind: "FIN" | "BRIDGE" | "ENDCAP";
  asset: string;
  col: number;
  row: number;
}

export interface FloorLayout {
  cols: number;
  rows: number;
  blockWidth_m: number;
  blockHeight_m: number;
  tiles: LayoutTile[];
  totalArea_m2: number;
}
