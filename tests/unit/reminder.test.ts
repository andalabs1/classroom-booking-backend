import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "../../src/shared/database/prisma";
import {
  runBookingLifecycleSweep,
  runBookingReminderSweep,
} from "../../src/modules/bookings/booking-reminder.service";

describe("Booking reminder worker", () => {
  afterEach(() => vi.restoreAllMocks());
  it("creates one in-app reminder for an upcoming confirmed booking", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([
      {
        id: 300n,
        userId: 20n,
        bookingCode: "BK-REMINDER",
        classroom: { name: "A101" },
      },
    ] as never);
    vi.spyOn(prisma.notification, "findUnique").mockResolvedValue(null);
    const create = vi
      .spyOn(prisma.notification, "create")
      .mockResolvedValue({ id: 400n } as never);
    expect(
      await runBookingReminderSweep(new Date("2099-01-01T08:00:00.000Z")),
    ).toBe(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "BOOKING_REMINDER",
          bookingId: 300n,
        }),
      }),
    );
  });
  it("does not create a duplicate reminder", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([
      {
        id: 300n,
        userId: 20n,
        bookingCode: "BK-REMINDER",
        classroom: { name: "A101" },
      },
    ] as never);
    vi.spyOn(prisma.notification, "findUnique").mockResolvedValue({
      id: 400n,
    } as never);
    const create = vi.spyOn(prisma.notification, "create");
    expect(
      await runBookingReminderSweep(new Date("2099-01-01T08:00:00.000Z")),
    ).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
  it("marks expired confirmed bookings as no-show and in-use bookings as completed", async () => {
    vi.spyOn(prisma.booking, "findMany")
      .mockResolvedValueOnce([
        {
          id: 301n,
          userId: 20n,
          bookingCode: "BK-NO-SHOW",
          status: "CONFIRMED",
        },
      ] as never)
      .mockResolvedValueOnce([
        { id: 302n, userId: 20n, bookingCode: "BK-DONE", status: "IN_USE" },
      ] as never);
    vi.spyOn(prisma.booking, "updateMany").mockResolvedValue({ count: 1 });
    vi.spyOn(prisma.notification, "create").mockResolvedValue({
      id: 401n,
    } as never);
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({
      id: 501n,
    } as never);
    expect(
      await runBookingLifecycleSweep(new Date("2099-01-01T12:00:00.000Z")),
    ).toEqual({ noShow: 1, completed: 1 });
  });
});
