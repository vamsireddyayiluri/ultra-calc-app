export type LoadMode = "LL" | "HL";
export type Direction = "drilled" | "parallel";
export type Joist = 12 | 16 | 19 | 24;

export const JOIST_MM: Record<Joist, number> = {
  12: 300,
  16: 400,
  19: 488,
  24: 600,
};

// meters (REAL WORLD)
export const BLOCK_SIZE_M: Record<Joist, Record<LoadMode, { w: number; h: number }>> = {
  12: {
    LL: { w: 0.300, h: 0.530 },
    HL: { w: 0.300, h: 0.430 },
  },
  16: {
    LL: { w: 0.400, h: 0.400 },
    HL: { w: 0.400, h: 0.330 },
  },
  19: {
    LL: { w: 0.488, h: 0.360 },
    HL: { w: 0.488, h: 0.280 },
  },
  24: {
    LL: { w: 0.600, h: 0.530 },
    HL: { w: 0.600, h: 0.430 },
  },
};
