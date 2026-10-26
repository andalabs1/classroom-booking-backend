import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/shared/database/prisma";
import { env } from "../../src/shared/config/env";
import {
  runBookingLifecycleSweep,
  runBookingReminderSweep,
  startBookingReminderWorker,
} from "../../src/modules/bookings/booking-reminder.service";
const now = new Date("2026-10-26T05:00:00Z");
const booking = {
  id: 20n,
  userId: 10n,
  bookingCode: "BK-20",
  classroom: { name: "A101" },
};
const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError("Duplicate", {
    code: "P2002",
    clientVersion: "6",
  });
describe("Reminder and lifecycle edge cases", () => {
  it("queries the configured reminder window", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([]);
    expect(await runBookingReminderSweep(now)).toBe(0);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "CONFIRMED",
          startAt: {
            gt: now,
            lte: new Date(
              now.getTime() + env.BOOKING_REMINDER_MINUTES * 60_000,
            ),
          },
        },
      }),
    );
  });
  it("ignores a duplicate reminder created by another worker", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([booking] as never);
    vi.spyOn(prisma.notification, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.notification, "create").mockRejectedValue(duplicate());
    expect(await runBookingReminderSweep(now)).toBe(0);
  });
  it("releases the running guard after a database failure", async () => {
    vi.spyOn(prisma.booking, "findMany")
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce([]);
    await expect(runBookingReminderSweep(now)).rejects.toThrow("Unavailable");
    expect(await runBookingReminderSweep(now)).toBe(0);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(2);
  });
  it("does not overlap reminder sweeps", async () => {
    let release!: (rows: never[]) => void;
    vi.spyOn(prisma.booking, "findMany").mockImplementation(
      () =>
        new Promise<never[]>((resolve) => {
          release = resolve;
        }) as never,
    );
    const pending = runBookingReminderSweep(now);
    try {
      expect(await runBookingReminderSweep(now)).toBe(0);
      expect(prisma.booking.findMany).toHaveBeenCalledTimes(1);
    } finally {
      release([]);
      await pending;
    }
  });
  it("propagates a non-duplicate notification failure", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([booking] as never);
    vi.spyOn(prisma.notification, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.notification, "create").mockRejectedValue(
      new Error("Notification failed"),
    );
    await expect(runBookingReminderSweep(now)).rejects.toThrow(
      "Notification failed",
    );
  });
  it("queries lifecycle cutoffs for both statuses", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([]);
    expect(await runBookingLifecycleSweep(now)).toEqual({
      noShow: 0,
      completed: 0,
    });
    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: {
        status: "CONFIRMED",
        startAt: {
          lt: new Date(
            now.getTime() - env.BOOKING_CHECKIN_LATE_MINUTES * 60_000,
          ),
        },
      },
    });
    expect(prisma.booking.findMany).toHaveBeenCalledWith({
      where: { status: "IN_USE", endAt: { lte: now } },
    });
  });
  it("skips side effects if another worker already changed the booking", async () => {
    vi.spyOn(prisma.booking, "findMany")
      .mockResolvedValueOnce([booking] as never)
      .mockResolvedValueOnce([booking] as never);
    vi.spyOn(prisma.booking, "updateMany").mockResolvedValue({ count: 0 });
    expect(await runBookingLifecycleSweep(now)).toEqual({
      noShow: 0,
      completed: 0,
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
  it("continues auditing a lifecycle change when its notification is duplicated", async () => {
    vi.spyOn(prisma.booking, "findMany")
      .mockResolvedValueOnce([booking] as never)
      .mockResolvedValueOnce([]);
    vi.spyOn(prisma.booking, "updateMany").mockResolvedValue({ count: 1 });
    vi.spyOn(prisma.notification, "create").mockRejectedValue(duplicate());
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({ id: 30n } as never);
    expect(await runBookingLifecycleSweep(now)).toEqual({
      noShow: 1,
      completed: 0,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "NO_SHOW",
        oldValue: expect.objectContaining({ id: "20" }),
      }),
    });
  });
  it("starts a sweep immediately and repeats at the configured interval", async () => {
    vi.useFakeTimers();
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([]);
    const timer = startBookingReminderWorker();
    try {
      expect(timer.hasRef()).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(prisma.booking.findMany).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(env.REMINDER_POLL_INTERVAL_MS);
      expect(prisma.booking.findMany).toHaveBeenCalledTimes(6);
    } finally {
      clearInterval(timer);
    }
  });
});
