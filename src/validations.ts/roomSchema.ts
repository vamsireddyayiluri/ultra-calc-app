import { z } from "zod";

const requiredNumber = (requiredMsg: string) =>
  z.preprocess(
    (val) => (val === undefined ? -1000 : val),
    z
      .number()
      .refine((v) => !Number.isNaN(v), {
        message: requiredMsg,
      })
      .min(-50, "Invalid Setpoint temperature")
      .max(50, "Invalid Setpoint temperature"),
  );

const requiredPositiveNumber = (requiredMsg: string, positiveMsg: string) =>
  z.preprocess(
    (val) => (val === undefined ? -1 : val),
    z
      .number()
      .refine((v) => !Number.isNaN(v), { message: requiredMsg })
      .positive(positiveMsg),
  );

const requiredNonNegativeNumber = (requiredMsg: string, nonNegMsg: string) =>
  z.preprocess(
    (val) => (val === undefined ? -1 : val),
    z
      .number()
      .refine((v) => !Number.isNaN(v), { message: requiredMsg })
      .min(0, nonNegMsg),
  );

export const roomSchema = z.object({
  name: z.string().min(1, "Room name is required"),

  setpointC: requiredNumber("Setpoint temperature is required"),
  length_m: requiredPositiveNumber(
    "Length is required",
    "Length must be greater than 0",
  ),

  width_m: requiredPositiveNumber(
    "Width is required",
    "Width must be greater than 0",
  ),

  height_m: requiredPositiveNumber(
    "Height is required",
    "Height must be greater than 0",
  ),

  exteriorLen_m: requiredNonNegativeNumber(
    "Exterior wall length is required",
    "Exterior length cannot be negative",
  ),

  windowArea_m2: requiredNonNegativeNumber(
    "Window area is required",
    "Window area cannot be negative",
  ),

  doorArea_m2: requiredNonNegativeNumber(
    "Door area is required",
    "Door area cannot be negative",
  ),

  ceilingExposed: z.boolean(),
  floorExposed: z.boolean(),

  installMethod: z
    .enum([
      "DRILLING",
      "OPEN_WEB",
      "HANGING_SNAKE",
      "HANGING_ULTRACLIP",
      "TOPDOWN_UC_UC1212",
      "INSLAB",
    ])
    .optional(),
});
