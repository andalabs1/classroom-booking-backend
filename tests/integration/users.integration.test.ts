import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { app } from "../../src/app";
import { env } from "../../src/shared/config/env";
import { prisma } from "../../src/shared/database/prisma";

const token = (role = "STUDENT") =>
  jwt.sign({ id: "10", role }, env.JWT_SECRET);

const activeUser = (role = "STUDENT") => ({
  id: 10n,
  role,
  email: "student@test.local",
  status: "ACTIVE",
  tokenVersion: 0,
});

describe("User and business-rules APIs", () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(
      activeUser() as never,
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns the authenticated user's profile", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      ...activeUser(),
      userCode: "65010001",
      name: "Test Student",
      firstName: "Test",
      lastName: "Student",
      phone: "0891234567",
      createdAt: new Date(),
    } as never);

    const response = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ userCode: "65010001" });
  });

  it("updates the authenticated user's profile", async () => {
    vi.spyOn(prisma.user, "update").mockResolvedValue({
      ...activeUser(),
      name: "Updated Student",
      firstName: "Updated",
      lastName: "Student",
      phone: "0891234567",
      createdAt: new Date(),
    } as never);

    const response = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${token()}`)
      .send({
        name: "Updated Student",
        firstName: "Updated",
        lastName: "Student",
        email: "student@test.local",
        phone: "0891234567",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Profile updated");
  });

  it("changes the password after validating the current password", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      ...activeUser(),
      passwordHash: await bcrypt.hash("Current123!", 4),
    } as never);
    vi.spyOn(prisma.user, "update").mockResolvedValue(activeUser() as never);

    const response = await request(app)
      .patch("/api/users/me/password")
      .set("Authorization", `Bearer ${token()}`)
      .send({ currentPassword: "Current123!", newPassword: "NewPassword123!" });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Password changed");
  });

  it("lists the authenticated user's bookings", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.booking, "count").mockResolvedValue(0);

    const response = await request(app)
      .get("/api/users/me/bookings?page=1&limit=20")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 0 });
  });

  it("allows an admin to use the active-user directory", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(
      activeUser("ADMIN") as never,
    );
    vi.spyOn(prisma.user, "findMany").mockResolvedValue([] as never);

    const response = await request(app)
      .get("/api/users/directory?search=test")
      .set("Authorization", `Bearer ${token("ADMIN")}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("returns booking rules for frontend validation", async () => {
    const response = await request(app)
      .get("/api/config/business-rules")
      .set("Authorization", `Bearer ${token()}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      bookingOpenTime: expect.any(String),
      bookingCloseTime: expect.any(String),
    });
  });
});
