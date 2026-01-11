export type TileType = "FB" | "PB" | "EC";

export interface Tile {
  type: TileType;
  x: number;
  y: number;
  w: number;
  h: number;
  asset: string;
}
