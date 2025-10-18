import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  contractor: z.string().min(1, "Contractor name is required"),
  region: z.string().min(1, "Region must be selected"),
  address: z.string().min(1, "Address is required"),
  standardsMode: z.string().min(1, "Standards mode must be selected"),
  designIndoorC: z.number().min(-10).max(50, "Invalid indoor temperature"),
  designOutdoorC: z.number().min(-50).max(50, "Invalid outdoor temperature"),
  period: z.string().min(1, "Insulation period must be selected"),
});
