import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/shared/database/prisma";
import { authenticateAs, mockTransaction } from "../helpers/auth";
let auth: string;
const booking = (status = "PENDING") => ({
  id: 20n,
  userId: 30n,
  classroomId: 40n,
  bookingCode: "BK-20",
  status,
  startAt: new Date(Date.now() - 60_000),
  endAt: new Date(Date.now() + 60_000),
});
beforeEach(() => {
  auth = authenticateAs("ADMIN");
});
describe("Admin booking routes", () => {
  it("lists bookings with filters and pagination", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.booking, "count").mockResolvedValue(0);
    const response = await request(app)
      .get(
        "/api/admin/bookings?page=2&limit=5&status=PENDING&classroomId=40&userId=30&search=BK",
      )
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ page: 2, limit: 5, total: 0 });
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: expect.objectContaining({
          status: "PENDING",
          classroomId: 40n,
          userId: 30n,
          OR: expect.any(Array),
        }),
      }),
    );
  });
  it("returns a booking with its audit history", async () => {
    vi.spyOn(prisma.booking, "findUnique").mockResolvedValue(
      booking() as never,
    );
    vi.spyOn(prisma.auditLog, "findMany").mockResolvedValue([
      { id: 1n, action: "CREATE" },
    ] as never);
    const response = await request(app)
      .get("/api/admin/bookings/20")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(response.body.data.history).toEqual([{ id: "1", action: "CREATE" }]);
  });
  it("returns 404 for a missing booking", async () => {
    vi.spyOn(prisma.booking, "findUnique").mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get("/api/admin/bookings/20")
          .set("Authorization", auth)
      ).status,
    ).toBe(404);
  });
  it.each([
    ["approve", "PENDING", "CONFIRMED", {}],
    ["reject", "PENDING", "REJECTED", { adminNote: "Unavailable" }],
    ["cancel", "PENDING", "CANCELLED", { reason: "Cancelled" }],
    ["start", "CONFIRMED", "IN_USE", {}],
    ["complete", "CONFIRMED", "COMPLETED", {}],
    ["complete", "IN_USE", "COMPLETED", {}],
    ["no-show", "CONFIRMED", "NO_SHOW", { reason: "Absent" }],
  ])(
    "%s transitions %s to %s and records side effects",
    async (action, from, to, body) => {
      vi.spyOn(prisma.booking, "findUnique").mockResolvedValue(
        booking(from) as never,
      );
      vi.spyOn(prisma.booking, "findFirst").mockResolvedValue(null);
      vi.spyOn(prisma.booking, "update").mockResolvedValue({
        ...booking(from),
        status: to,
      } as never);
      vi.spyOn(prisma.notification, "create").mockResolvedValue({
        id: 50n,
      } as never);
      vi.spyOn(prisma.auditLog, "create").mockResolvedValue({
        id: 60n,
      } as never);
      const transaction = mockTransaction();
      const response = await request(app)
        .patch(`/api/admin/bookings/20/${action}`)
        .set("Authorization", auth)
        .send(body);
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(to);
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: "Serializable",
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 30n,
          bookingId: 20n,
          type: `BOOKING_${to}`,
        }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 10n,
          action: to,
          entityId: 20n,
        }),
      });
    },
  );
  it.each([
    ["approve", "CONFIRMED"],
    ["reject", "IN_USE"],
    ["cancel", "COMPLETED"],
    ["start", "PENDING"],
    ["complete", "PENDING"],
    ["no-show", "IN_USE"],
  ])("rejects %s from %s", async (action, status) => {
    vi.spyOn(prisma.booking, "findUnique").mockResolvedValue(
      booking(status) as never,
    );
    const response = await request(app)
      .patch(`/api/admin/bookings/20/${action}`)
      .set("Authorization", auth)
      .send({ adminNote: "Reason" });
    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects approval when a confirmed booking overlaps", async () => {
    vi.spyOn(prisma.booking, "findUnique").mockResolvedValue(
      booking() as never,
    );
    vi.spyOn(prisma.booking, "findFirst").mockResolvedValue({
      id: 99n,
    } as never);
    mockTransaction();
    const response = await request(app)
      .patch("/api/admin/bookings/20/approve")
      .set("Authorization", auth);
    expect(response.status).toBe(409);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });
  it("requires a reason when rejecting a booking", async () => {
    const response = await request(app)
      .patch("/api/admin/bookings/20/reject")
      .set("Authorization", auth)
      .send({ adminNote: "" });
    expect(response.status).toBe(400);
    expect(prisma.booking.findUnique).not.toHaveBeenCalled();
  });
  it("does not mark future bookings as no-show", async () => {
    vi.spyOn(prisma.booking, "findUnique").mockResolvedValue({
      ...booking("CONFIRMED"),
      startAt: new Date(Date.now() + 60_000),
    } as never);
    const response = await request(app)
      .patch("/api/admin/bookings/20/no-show")
      .set("Authorization", auth)
      .send();
    expect(response.status).toBe(409);
  });
});
