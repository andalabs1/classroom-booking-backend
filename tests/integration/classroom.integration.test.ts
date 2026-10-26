import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app";
import { prisma } from "../../src/shared/database/prisma";
import { env } from "../../src/shared/config/env";

const token = () => jwt.sign({ id: "10" }, env.JWT_SECRET);
const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

describe("Classroom availability and schedule API", () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 10n,
      role: "STUDENT",
      email: "student@test.local",
      status: "ACTIVE",
    } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("lists classrooms without authentication", async () => {
    vi.spyOn(prisma.classroom, "findMany").mockResolvedValue([
      {
        id: 1n,
        code: "A101",
        name: "Lecture",
        building: "A",
        floor: "1",
        capacity: 40,
        equipment: [],
        status: "ACTIVE",
      },
    ] as never);
    vi.spyOn(prisma.classroom, "count").mockResolvedValue(1);
    const response = await request(app).get("/api/classrooms?limit=20");
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({ code: "A101", status: "ACTIVE" }),
    );
  });

  it("accepts ACTIVE as the only active classroom status", async () => {
    const findMany = vi
      .spyOn(prisma.classroom, "findMany")
      .mockResolvedValue([]);
    vi.spyOn(prisma.classroom, "count").mockResolvedValue(0);

    const activeResponse = await request(app).get(
      "/api/classrooms?status=ACTIVE",
    );

    expect(activeResponse.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  it("checks multiple rooms in one request", async () => {
    vi.spyOn(prisma.classroom, "findMany").mockResolvedValue([
      {
        id: 1n,
        name: "A101",
        building: "A",
        equipment: ["Projector"],
        status: "ACTIVE",
      },
      {
        id: 2n,
        name: "A102",
        building: "A",
        equipment: ["Projector"],
        status: "ACTIVE",
      },
    ] as never);
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([
      {
        id: 50n,
        classroomId: 2n,
        bookingCode: "BK-50",
        startAt,
        endAt,
        status: "CONFIRMED",
      },
    ] as never);
    const response = await request(app)
      .get(
        `/api/classrooms/availability?startAt=${encodeURIComponent(startAt.toISOString())}&endAt=${encodeURIComponent(endAt.toISOString())}&classroomIds=1,2`,
      )
      .set("Authorization", "Bearer " + token());
    expect(response.status).toBe(200);
    expect(response.body.data.rooms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "1", available: true }),
        expect.objectContaining({ id: "2", available: false }),
      ]),
    );
  });

  it("returns schedules grouped by selected rooms", async () => {
    vi.spyOn(prisma.classroom, "findMany").mockResolvedValue([
      { id: 1n, name: "A101", building: "A", status: "ACTIVE" },
    ] as never);
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([
      {
        id: 50n,
        classroomId: 1n,
        bookingCode: "BK-50",
        purpose: "Lecture",
        attendeeCount: 20,
        requestedEquipment: [],
        startAt,
        endAt,
        status: "CONFIRMED",
      },
    ] as never);
    const response = await request(app)
      .get(
        `/api/classrooms/schedule?startAt=${encodeURIComponent(startAt.toISOString())}&endAt=${encodeURIComponent(endAt.toISOString())}&classroomIds=1`,
      )
      .set("Authorization", "Bearer " + token());
    expect(response.status).toBe(200);
    expect(response.body.data.rooms[0].bookings).toHaveLength(1);
  });
});
