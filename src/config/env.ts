import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("1d"),
  PORT: z.coerce.number().default(3000),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().default("classroom-images"),
  R2_ENDPOINT: z.string().url().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().default("https://pub-8f9cd5fcc337496695e7cca26b3e123b.r2.dev"),
  BOOKING_REMINDER_MINUTES: z.coerce.number().int().positive().default(60),
  REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(10000).default(60000),
  BOOKING_CANCEL_MINUTES: z.coerce.number().int().nonnegative().default(120),
  BOOKING_MAX_DURATION_HOURS: z.coerce.number().positive().default(8),
  BOOKING_MAX_ADVANCE_DAYS: z.coerce.number().int().positive().default(90),
  BOOKING_OPEN_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("08:00"),
  BOOKING_CLOSE_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("20:00"),
  BOOKING_CHECKIN_EARLY_MINUTES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(30),
  BOOKING_CHECKIN_LATE_MINUTES: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(30),
});
export const env = schema.parse(process.env);
