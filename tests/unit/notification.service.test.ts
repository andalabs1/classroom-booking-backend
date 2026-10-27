import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/shared/database/prisma";
import {
  createNotification,
  notifyActiveAdmins,
  notifyBookingCreated,
  notifyBookingUpdated,
  notifyBookingCancelled,
  notifyBookingCheckedIn,
} from "../../src/modules/notifications/notification.service";

const booking = { id: 20n, userId: 10n, bookingCode: "BK-TEST" };
beforeEach(() => {
  vi.spyOn(prisma.notification, "create").mockResolvedValue({
    id: 30n,
  } as never);
});
describe("Notification service", () => {
  it("creates a notification with booking and dedupe information", async () => {
    const input = {
      userId: 10n,
      bookingId: 20n,
      title: "Reminder",
      message: "Soon",
      type: "BOOKING_REMINDER",
      dedupeKey: "reminder:20",
    };
    await createNotification(input);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { id: expect.any(BigInt), ...input },
    });
  });
  it("only selects active admins and sends each a notification", async () => {
    vi.spyOn(prisma.user, "findMany").mockResolvedValue([
      { id: 1n },
      { id: 2n },
    ] as never);
    await notifyActiveAdmins({
      title: "Title",
      message: "Message",
      type: "TEST",
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    for (const userId of [1n, 2n])
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId }),
      });
  });
  it("does not create notifications when there are no active admins", async () => {
    vi.spyOn(prisma.user, "findMany").mockResolvedValue([]);
    await notifyActiveAdmins({
      title: "Title",
      message: "Message",
      type: "TEST",
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
  it.each([
    [notifyBookingCreated, "BOOKING_CREATED", "BOOKING_PENDING"],
    [notifyBookingUpdated, "BOOKING_UPDATED", "BOOKING_UPDATED"],
    [notifyBookingCancelled, "BOOKING_CANCELLED", "BOOKING_CANCELLED"],
    [notifyBookingCheckedIn, "BOOKING_IN_USE", "BOOKING_IN_USE"],
  ] as const)(
    "notifies the owner and admin on %s",
    async (notify, ownerType, adminType) => {
      vi.spyOn(prisma.user, "findMany").mockResolvedValue([
        { id: 1n },
      ] as never);
      await notify(booking);
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 10n,
          bookingId: 20n,
          type: ownerType,
          message: expect.stringContaining("BK-TEST"),
        }),
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1n,
          bookingId: 20n,
          type: adminType,
        }),
      });
    },
  );
  it("propagates a storage failure to its caller", async () => {
    vi.spyOn(prisma.notification, "create").mockRejectedValue(
      new Error("Database unavailable"),
    );
    await expect(
      createNotification({
        userId: 10n,
        title: "Title",
        message: "Message",
        type: "TEST",
      }),
    ).rejects.toThrow("Database unavailable");
  });
});
