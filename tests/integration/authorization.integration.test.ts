import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app";
import { env } from "../../src/shared/config/env";
import { prisma } from "../../src/shared/database/prisma";
describe("Authorization", () => {
  afterEach(() => vi.restoreAllMocks());
  it("rejects unauthenticated admin requests", async () => {
    expect((await request(app).get("/api/admin/users")).status).toBe(401);
  });
  it("rejects a student from admin APIs", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 10n,
      role: "STUDENT",
      email: "student@test.local",
      status: "ACTIVE",
    } as never);
    const token = jwt.sign(
      { id: "10", role: "ADMIN", email: "student@test.local" },
      env.JWT_SECRET,
    );
    expect(
      (
        await request(app)
          .get("/api/admin/users")
          .set("Authorization", "Bearer " + token)
      ).status,
    ).toBe(403);
  });
  it("rejects a token for an inactive user", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 10n,
      role: "ADMIN",
      email: "admin@test.local",
      status: "INACTIVE",
    } as never);
    const token = jwt.sign({ id: "10" }, env.JWT_SECRET);
    expect(
      (
        await request(app)
          .get("/api/admin/users")
          .set("Authorization", "Bearer " + token)
      ).status,
    ).toBe(401);
  });
  it("protects the image upload endpoint", async () => {
    expect((await request(app).post("/api/admin/uploads/images")).status).toBe(
      401,
    );
  });

  it("allows an admin to complete a confirmed booking", async () => {
    const admin = {
      id: 10n,
      role: "ADMIN",
      email: "admin@test.local",
      status: "ACTIVE",
      tokenVersion: 0,
    };
    const booking = {
      id: 201n,
      userId: 20n,
      bookingCode: "BK-CONFIRMED",
      status: "CONFIRMED",
      endAt: new Date(Date.now() + 60_000),
    };
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(admin as never);
    vi.spyOn(prisma.booking, "findUnique").mockResolvedValue(booking as never);
    vi.spyOn(prisma.booking, "update").mockResolvedValue({
      ...booking,
      status: "COMPLETED",
      completedAt: new Date(),
    } as never);
    vi.spyOn(prisma.notification, "create").mockResolvedValue({
      id: 301n,
    } as never);
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({
      id: 401n,
    } as never);
    vi.spyOn(prisma, "$transaction").mockImplementation((async (
      callback: (client: typeof prisma) => unknown,
    ) => callback(prisma)) as never);
    const adminToken = jwt.sign({ id: "10" }, env.JWT_SECRET);

    const response = await request(app)
      .patch("/api/admin/bookings/201/complete")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("COMPLETED");
  });

  it("rejects completing a pending booking", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 10n,
      role: "ADMIN",
      email: "admin@test.local",
      status: "ACTIVE",
      tokenVersion: 0,
    } as never);
    vi.spyOn(prisma.booking, "findUnique").mockResolvedValue({
      id: 202n,
      userId: 20n,
      bookingCode: "BK-PENDING",
      status: "PENDING",
      endAt: new Date(Date.now() + 60_000),
    } as never);
    const adminToken = jwt.sign({ id: "10" }, env.JWT_SECRET);

    const response = await request(app)
      .patch("/api/admin/bookings/202/complete")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(409);
  });
});
