import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app";
import { env } from "../../src/shared/config/env";
import { prisma } from "../../src/shared/database/prisma";

describe("Notification API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns notifications belonging only to the authenticated user", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 10n,
      role: "STUDENT",
      email: "student@test.local",
      status: "ACTIVE",
      tokenVersion: 0,
    } as never);
    const findMany = vi
      .spyOn(prisma.notification, "findMany")
      .mockResolvedValue([] as never);
    vi.spyOn(prisma.notification, "count").mockResolvedValue(0);
    const token = jwt.sign({ id: "10", tokenVersion: 0 }, env.JWT_SECRET);

    const response = await request(app)
      .get("/api/notifications?limit=100")
      .set("Authorization", "Bearer " + token);

    expect(response.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 10n } }),
    );
  });
});
