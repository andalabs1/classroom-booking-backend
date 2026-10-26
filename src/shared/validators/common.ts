import { z } from "zod";
export const idSchema = z.coerce.bigint().positive();
export const pagination = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
