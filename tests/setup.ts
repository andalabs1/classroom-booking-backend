import { afterEach, beforeEach, expect, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { resetPrismaMock, unexpectedQueries } from "./helpers/prisma";

// Deterministic test values override the developer's environment before app imports.
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "mysql://test:test@127.0.0.1:1/vitest_blocked",
  JWT_SECRET: "vitest-secret-with-at-least-16-chars",
  JWT_EXPIRES_IN: "1d",
  PORT: "3000",
  ADMIN_EMAIL: "admin@test.local",
  ADMIN_PASSWORD: "TestPassword123!",
  R2_ACCOUNT_ID: "vitest",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET: "test-images",
  R2_ENDPOINT: "https://r2.test.invalid",
  R2_PUBLIC_BASE_URL: "https://images.test.invalid",
  BOOKING_REMINDER_MINUTES: "60",
  REMINDER_POLL_INTERVAL_MS: "60000",
  BOOKING_CANCEL_MINUTES: "120",
  BOOKING_MAX_DURATION_HOURS: "8",
  BOOKING_MAX_ADVANCE_DAYS: "90",
  BOOKING_OPEN_TIME: "06:00",
  BOOKING_CLOSE_TIME: "20:00",
  BOOKING_CHECKIN_EARLY_MINUTES: "30",
  BOOKING_CHECKIN_LATE_MINUTES: "30",
});

vi.mock("../src/shared/database/prisma", async () => {
  const { prismaMock } = await import("./helpers/prisma");
  return { prisma: prismaMock };
});

const unexpectedStorageCalls: string[] = [];
beforeEach(() => {
  resetPrismaMock();
  unexpectedStorageCalls.length = 0;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(S3Client.prototype, "send").mockImplementation(() => {
    unexpectedStorageCalls.push("S3Client.send");
    throw new Error("Unstubbed storage operation: S3Client.send");
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Caught errors must still fail a test if an external operation was not stubbed.
  expect(unexpectedQueries, "Unstubbed database operations").toEqual([]);
  expect(unexpectedStorageCalls, "Unstubbed storage operations").toEqual([]);
});
