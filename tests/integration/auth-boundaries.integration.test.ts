import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app";
import { env } from "../../src/shared/config/env";
import { prisma } from "../../src/shared/database/prisma";
import { activeUser, token } from "../helpers/auth";
describe("Authentication boundaries", () => {
  it.each([
    "",
    "Basic invalid",
    "Bearer invalid",
    `Bearer ${jwt.sign({ id: "10" }, "another-secret-at-least-16-chars")}`,
    `Bearer ${jwt.sign({ id: "10" }, env.JWT_SECRET, { expiresIn: -10 })}`,
  ])("rejects an invalid authorization header %s", async (header) => {
    const response = await request(app)
      .get("/api/users/me")
      .set("Authorization", header);
    expect(response.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("rejects tokens belonging to deleted users", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get("/api/users/me")
          .set("Authorization", `Bearer ${token()}`)
      ).status,
    ).toBe(401);
  });
  it("rejects a token after its version is revoked", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      ...activeUser(),
      tokenVersion: 2,
    } as never);
    expect(
      (
        await request(app)
          .get("/api/users/me")
          .set("Authorization", `Bearer ${token()}`)
      ).status,
    ).toBe(401);
  });
  it("rejects registering an admin role", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Admin",
        email: "admin@test.local",
        password: "Password123",
        role: "ADMIN",
      });
    expect(response.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it("rejects login for inactive users", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      ...activeUser(),
      status: "INACTIVE",
    } as never);
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@test.local", password: "Password123" });
    expect(response.status).toBe(401);
  });
  it("returns the shared 404 response for unknown routes", async () => {
    const response = await request(app).get("/api/missing");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: "Route not found",
    });
  });
  it("enforces the configured login rate limit", async () => {
    // Use a fresh app module so other login tests do not affect the limiter store.
    vi.resetModules();
    const { app: isolatedApp } = await import("../../src/app");
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(
        (await request(isolatedApp).post("/api/auth/login").send({})).status,
      ).toBe(400);
    }
    expect(
      (await request(isolatedApp).post("/api/auth/login").send({})).status,
    ).toBe(429);
  });
});
