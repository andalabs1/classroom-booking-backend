import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { prisma } from "../src/utils/prisma";
import { env } from "../src/config/env";

const token = () =>
  jwt.sign(
    { id: "10", role: "STUDENT", email: "test@test.local" },
    env.JWT_SECRET,
  );
const startAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
startAt.setUTCHours(3, 0, 0, 0);
const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
const payload = {
  classroomId: "3",
  purpose: "API test",
  attendeeCount: 20,
  requestedEquipment: ["Projector"],
  startAt: startAt.toISOString(),
  endAt: endAt.toISOString(),
};

describe("Booking API", () => {
  beforeEach(() => {
    jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 10n,
      role: "STUDENT",
      email: "test@test.local",
      status: "ACTIVE",
    } as never);
    jest.spyOn(prisma.user, "findMany").mockResolvedValue([] as never);
    jest
      .spyOn(prisma.notification, "create")
      .mockResolvedValue({ id: 900n } as never);
    jest
      .spyOn(prisma.auditLog, "create")
      .mockResolvedValue({ id: 901n } as never);
    jest
      .spyOn(prisma, "$transaction")
      .mockImplementation((async (
        callback: (client: typeof prisma) => unknown,
      ) => callback(prisma)) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it("creates a pending booking", async () => {
    jest.spyOn(prisma.classroom, "findUnique").mockResolvedValue({
      id: 3n,
      status: "ACTIVE",
      capacity: 40,
      equipment: ["Projector"],
    } as never);
    jest.spyOn(prisma.booking, "findFirst").mockResolvedValue(null);
    jest.spyOn(prisma.booking, "create").mockResolvedValue({
      id: 201n,
      bookingCode: "BK-test",
      userId: 10n,
      classroomId: 3n,
      purpose: payload.purpose,
      description: null,
      startAt: new Date(payload.startAt),
      endAt: new Date(payload.endAt),
      status: "PENDING",
      adminNote: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const response = await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer " + token())
      .send(payload);
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("PENDING");
  });
  it("returns 409 for a conflicting time", async () => {
    jest.spyOn(prisma.classroom, "findUnique").mockResolvedValue({
      id: 3n,
      status: "ACTIVE",
      capacity: 40,
      equipment: ["Projector"],
    } as never);
    jest
      .spyOn(prisma.booking, "findFirst")
      .mockResolvedValue({ id: 200n } as never);
    const response = await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer " + token())
      .send(payload);
    expect(response.status).toBe(409);
  });
  it("returns 400 for an inactive classroom", async () => {
    jest.spyOn(prisma.classroom, "findUnique").mockResolvedValue({
      id: 3n,
      status: "INACTIVE",
      capacity: 40,
      equipment: ["Projector"],
    } as never);
    const response = await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer " + token())
      .send(payload);
    expect(response.status).toBe(400);
  });
  it("returns 400 when attendee count exceeds classroom capacity", async () => {
    jest.spyOn(prisma.classroom, "findUnique").mockResolvedValue({
      id: 3n,
      status: "ACTIVE",
      capacity: 10,
      equipment: ["Projector"],
    } as never);
    const response = await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer " + token())
      .send({ ...payload, attendeeCount: 11 });
    expect(response.status).toBe(400);
  });
  it("returns 400 for an invalid time range", async () => {
    const response = await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer " + token())
      .send({
        ...payload,
        startAt: endAt.toISOString(),
        endAt: startAt.toISOString(),
      });
    expect(response.status).toBe(400);
  });
  it("rejects bookings outside configured business hours", async () => {
    const date = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000))
        .map((part) => [part.type, part.value]),
    );
    const day = `${date.year}-${date.month}-${date.day}`;
    const response = await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer " + token())
      .send({
        ...payload,
        startAt: `${day}T07:00:00+07:00`,
        endAt: `${day}T08:00:00+07:00`,
      });
    expect(response.status).toBe(400);
    expect(response.body.message).toContain("08:00");
  });
  it("returns 400 when requested equipment is unavailable", async () => {
    jest.spyOn(prisma.classroom, "findUnique").mockResolvedValue({
      id: 3n,
      status: "ACTIVE",
      capacity: 40,
      equipment: ["Whiteboard"],
    } as never);
    const response = await request(app)
      .post("/api/bookings")
      .set("Authorization", "Bearer " + token())
      .send(payload);
    expect(response.status).toBe(400);
  });
  it("supports server-side search and pagination", async () => {
    const findMany = jest
      .spyOn(prisma.booking, "findMany")
      .mockResolvedValue([] as never);
    jest.spyOn(prisma.booking, "count").mockResolvedValue(0);
    const response = await request(app)
      .get("/api/bookings?search=A101&page=2&limit=5")
      .set("Authorization", "Bearer " + token());
    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ page: 2, limit: 5, total: 0 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: expect.objectContaining({
          userId: 10n,
          OR: expect.any(Array),
        }),
      }),
    );
  });
  it.each([
    [
      "daily",
      "2026-09-20",
      "2026-09-19T17:00:00.000Z",
      "2026-09-20T17:00:00.000Z",
    ],
    [
      "weekly",
      "2026-09-20",
      "2026-09-13T17:00:00.000Z",
      "2026-09-20T17:00:00.000Z",
    ],
    [
      "monthly",
      "2026-09-20",
      "2026-08-31T17:00:00.000Z",
      "2026-09-30T17:00:00.000Z",
    ],
  ])(
    "filters the %s view using an Asia/Bangkok calendar range",
    async (view, date, expectedStart, expectedEnd) => {
      const findMany = jest
        .spyOn(prisma.booking, "findMany")
        .mockResolvedValue([] as never);
      jest.spyOn(prisma.booking, "count").mockResolvedValue(0);

      const response = await request(app)
        .get(`/api/bookings?view=${view}&date=${date}`)
        .set("Authorization", "Bearer " + token());

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual(
        expect.objectContaining({
          view,
          date,
          startAt: expectedStart,
          endAt: expectedEnd,
        }),
      );
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startAt: { lt: new Date(expectedEnd) },
            endAt: { gt: new Date(expectedStart) },
          }),
        }),
      );
    },
  );
  it("rejects combining a calendar view with a custom date range", async () => {
    const response = await request(app)
      .get("/api/bookings?view=daily&startDate=2026-09-20")
      .set("Authorization", "Bearer " + token());
    expect(response.status).toBe(400);
  });
  it("enforces the cancellation cutoff", async () => {
    jest.spyOn(prisma.booking, "findUnique").mockResolvedValue({
      id: 201n,
      userId: 10n,
      bookingCode: "BK-CANCEL",
      status: "CONFIRMED",
      startAt: new Date(Date.now() + 30 * 60 * 1000),
    } as never);
    const response = await request(app)
      .patch("/api/bookings/201/cancel")
      .set("Authorization", "Bearer " + token())
      .send({ reason: "Changed plan" });
    expect(response.status).toBe(409);
  });
  it("checks in a confirmed booking inside the allowed window", async () => {
    const booking = {
      id: 202n,
      userId: 10n,
      bookingCode: "BK-CHECKIN",
      status: "CONFIRMED",
      startAt: new Date(Date.now() + 10 * 60 * 1000),
      endAt: new Date(Date.now() + 70 * 60 * 1000),
    };
    jest
      .spyOn(prisma.booking, "findUnique")
      .mockResolvedValue(booking as never);
    jest.spyOn(prisma.booking, "update").mockResolvedValue({
      ...booking,
      status: "IN_USE",
      checkedInAt: new Date(),
    } as never);
    jest.spyOn(prisma.user, "findMany").mockResolvedValue([{ id: 20n }] as never);
    const response = await request(app)
      .post("/api/bookings/202/check-in")
      .set("Authorization", "Bearer " + token())
      .send();
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("IN_USE");
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 10n,
        bookingId: 202n,
        type: "BOOKING_IN_USE",
      }),
    });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 20n,
        bookingId: 202n,
        type: "BOOKING_IN_USE",
      }),
    });
  });
});
