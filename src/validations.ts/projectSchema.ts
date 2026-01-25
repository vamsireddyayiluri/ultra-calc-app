import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  region: z.string().min(1, "Region must be selected"),
  address: z.string().min(1, "Address is required, Please enter valid address"),
  standardsMode: z.string().min(1, "Standards mode must be selected"),
  indoorTempC: z.preprocess(
      (val) => (val === null || val === undefined ? -90 : val),
      z
        .number()
        .min(-50, "Invalid indoor temperature")
        .max(50, "Invalid indoor temperature")
    )
    .refine((val) => val !== undefined, {
      message: "indoor design temperature is required",
    }),
  outdoorTempC: z
    .preprocess(
      (val) => (val === null || val === undefined ? -90 : val),
      z
        .number()
        .min(-50, "Invalid outdoor temperature")
        .max(50, "Invalid outdoor temperature")
    )
    .refine((val) => val !== undefined, {
      message: "Outdoor design temperature is required",
    }),
  insulationPeriod: z.string().min(1, "Insulation period must be selected"),
});
