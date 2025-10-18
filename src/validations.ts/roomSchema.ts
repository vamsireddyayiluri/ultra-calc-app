import { z } from "zod";

export const roomSchema = z.object({
  name: z.string().min(1, "Room name is required"),
  length_m: z.number().positive("Length must be greater than 0"),
  width_m: z.number().positive("Width must be greater than 0"),
  height_m: z.number().positive("Height must be greater than 0"),
  exteriorLen_m: z.number().nonnegative("Exterior length cannot be negative"),
  windowArea_m2: z.number().min(0, "Window area cannot be negative"),
  doorArea_m2: z.number().min(0, "Door area cannot be negative"),
  ceilingExposed: z.boolean(),
  floorExposed: z.boolean(),
  method: z.enum(["top", "hangers", "drilled", "inslab"]),
});
