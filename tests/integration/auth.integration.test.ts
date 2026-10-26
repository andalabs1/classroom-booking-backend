import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app";
import { prisma } from "../../src/shared/database/prisma";
import { env } from "../../src/shared/config/env";
describe("Authentication API", () => {
  afterEach(() => vi.restoreAllMocks());
  it("registers a student without returning password data", async () => {
    vi.spyOn(prisma.user, "create").mockResolvedValue({
      id: 101n,
      name: "Test Student",
      email: "student@test.local",
      role: "STUDENT",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const response = await request(app).post("/api/auth/register").send({
      name: "Test Student",
      email: "student@test.local",
      password: "Test12345",
      role: "STUDENT",
    });
    expect(response.status).toBe(201);
    expect(response.body.data).not.toHaveProperty("password");
    expect(response.body.data).not.toHaveProperty("passwordHash");
    expect(response.body.data.role).toBe("STUDENT");
  });
  it("returns 409 for a duplicate email", async () => {
    vi.spyOn(prisma.user, "create").mockRejectedValue(
      new Error("Unique constraint failed on email"),
    );
    const response = await request(app).post("/api/auth/register").send({
      name: "Duplicate",
      email: "duplicate@test.local",
      password: "Test12345",
    });
    expect(response.status).toBe(409);
  });
  it("logs in with valid credentials", async () => {
    const bcrypt = await import("bcryptjs");
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 102n,
      name: "Test Student",
      email: "login@test.local",
      passwordHash: await bcrypt.hash("Test12345", 4),
      role: "STUDENT",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@test.local", password: "Test12345" });
    expect(response.status).toBe(200);
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
  });
  it("logs in with a user code", async () => {
    const bcrypt = await import("bcryptjs");
    vi.spyOn(prisma.user, "findFirst").mockResolvedValue({
      id: 103n,
      userCode: "65010001",
      name: "Test Student",
      email: "code@test.local",
      passwordHash: await bcrypt.hash("Test12345", 4),
      role: "USER",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "65010001", password: "Test12345" });
    expect(response.status).toBe(200);
    expect(response.body.data.user.userCode).toBe("65010001");
  });
  it("rejects an invalid login", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "missing@test.local", password: "Wrong12345" });
    expect(response.status).toBe(401);
  });
  it("rejects invalid registration input", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "", email: "not-an-email", password: "short" });
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.any(Array));
  });
  it("logs out an authenticated user", async () => {
    vi.spyOn(prisma.user, "findUnique")
      .mockResolvedValueOnce({
        id: 104n,
        email: "logout@test.local",
        role: "STUDENT",
        status: "ACTIVE",
        tokenVersion: 0,
      } as never)
      .mockResolvedValueOnce({
        id: 104n,
        email: "logout@test.local",
        role: "STUDENT",
        status: "ACTIVE",
        tokenVersion: 1,
      } as never);
    vi.spyOn(prisma.user, "update").mockResolvedValue({
      id: 104n,
      tokenVersion: 1,
    } as never);
    const token = jwt.sign({ id: "104" }, env.JWT_SECRET);
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .send();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: "Logged out",
      data: null,
    });
    const reuse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(reuse.status).toBe(401);
  });
  it("requires authentication to log out", async () => {
    const response = await request(app).post("/api/auth/logout").send();
    expect(response.status).toBe(401);
  });
});
