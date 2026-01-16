import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  contractor: z.string().min(1, "Contractor name is required"),
  region: z.string().min(1, "Region must be selected"),
  address: z.string().min(1, "Address is required"),
  standardsMode: z.string().min(1, "Standards mode must be selected"),
  indoorTempC: z.number().min(-10).max(50, "Invalid indoor temperature"),
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
