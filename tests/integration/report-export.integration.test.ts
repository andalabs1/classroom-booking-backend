import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app";
import { env } from "../../src/shared/config/env";
import { prisma } from "../../src/shared/database/prisma";

const token = () => jwt.sign({ id: "1" }, env.JWT_SECRET);

describe("Report export API", () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 1n,
      role: "ADMIN",
      email: "admin@test.local",
      status: "ACTIVE",
      tokenVersion: 0,
    } as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a seven-day booking graph and status pie data", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }).setSystemTime(
      new Date("2026-09-20T05:00:00.000Z"),
    );
    vi.spyOn(prisma.user, "count").mockResolvedValue(12);
    vi.spyOn(prisma.classroom, "count").mockResolvedValue(8);
    vi.spyOn(prisma.booking, "count").mockResolvedValue(4);
    vi.spyOn(prisma.booking, "groupBy").mockResolvedValue([
      { status: "PENDING", _count: { _all: 1 } },
      { status: "CONFIRMED", _count: { _all: 3 } },
    ] as never);
    const findMany = vi
      .spyOn(prisma.booking, "findMany")
      .mockResolvedValue([
        { startAt: new Date("2026-09-14T02:00:00.000Z") },
        { startAt: new Date("2026-09-20T03:00:00.000Z") },
        { startAt: new Date("2026-09-20T08:00:00.000Z") },
      ] as never);

    const response = await request(app)
      .get("/api/admin/reports/summary")
      .set("Authorization", "Bearer " + token());

    expect(response.status).toBe(200);
    expect(response.body.data.bookingsGraph).toEqual({
      timezone: "Asia/Bangkok",
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      data: [
        { date: "2026-09-14", count: 1 },
        { date: "2026-09-15", count: 0 },
        { date: "2026-09-16", count: 0 },
        { date: "2026-09-17", count: 0 },
        { date: "2026-09-18", count: 0 },
        { date: "2026-09-19", count: 0 },
        { date: "2026-09-20", count: 2 },
      ],
    });
    expect(response.body.data.statusPie).toEqual(
      expect.objectContaining({
        total: 4,
        data: expect.arrayContaining([
          { status: "PENDING", count: 1, percentage: 25 },
          { status: "CONFIRMED", count: 3, percentage: 75 },
          { status: "CANCELLED", count: 0, percentage: 0 },
        ]),
      }),
    );
    expect(findMany).toHaveBeenCalledWith({
      where: {
        startAt: {
          gte: new Date("2026-09-13T17:00:00.000Z"),
          lt: new Date("2026-09-20T17:00:00.000Z"),
        },
      },
      select: { startAt: true },
    });
  });

  it("exports CSV using an inclusive Bangkok date range and filters", async () => {
    const findMany = vi.spyOn(prisma.booking, "findMany").mockResolvedValue([
      {
        bookingCode: "BK-TEST",
        userId: 10n,
        user: {
          name: "Test User",
          email: "test@example.com",
          role: "STUDENT",
        },
        classroomId: 20n,
        classroom: {
          code: "A201",
          name: "ห้องเรียนอัจฉริยะ",
          building: "Building A",
          floor: "2",
          category: "ห้องเรียน",
        },
        purpose: "Project",
        attendeeCount: 10,
        requestedEquipment: ["Projector"],
        startAt: new Date("2026-09-20T08:00:00.000Z"),
        endAt: new Date("2026-09-20T10:00:00.000Z"),
        status: "CONFIRMED",
        createdAt: new Date("2026-09-19T01:30:00.000Z"),
      },
    ] as never);

    const response = await request(app)
      .get(
        "/api/admin/reports/export?startDate=2026-09-01&endDate=2026-09-30&status=CONFIRMED&building=Building%20A&userRole=STUDENT&search=project",
      )
      .set("Authorization", "Bearer " + token());

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain(
      "booking-report-2026-09-01-to-2026-09-30.csv",
    );
    expect(response.text).toContain(
      "รหัสการจอง,รหัสผู้ใช้,ชื่อผู้จอง,อีเมลผู้จอง,บทบาทผู้ใช้",
    );
    expect(response.text).toContain('"20 ก.ย. 2026 15:00 น."');
    expect(response.text).toContain('"20 ก.ย. 2026 17:00 น."');
    expect(response.text).not.toContain("2026-09-20T08:00:00.000Z");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "CONFIRMED",
          user: { role: "STUDENT" },
          classroom: { building: "Building A" },
          AND: [
            { endAt: { gt: new Date("2026-08-31T17:00:00.000Z") } },
            { startAt: { lt: new Date("2026-09-30T17:00:00.000Z") } },
          ],
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it("rejects a reversed date range", async () => {
    const response = await request(app)
      .get("/api/admin/reports/export?startDate=2026-09-30&endDate=2026-09-01")
      .set("Authorization", "Bearer " + token());
    expect(response.status).toBe(400);
  });
});
