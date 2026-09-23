import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/utils/prisma";

describe("Notification API", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns notifications belonging only to the authenticated user", async () => {
    jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: 10n,
      role: "STUDENT",
      email: "student@test.local",
      status: "ACTIVE",
      tokenVersion: 0,
    } as never);
    const findMany = jest
      .spyOn(prisma.notification, "findMany")
      .mockResolvedValue([] as never);
    jest.spyOn(prisma.notification, "count").mockResolvedValue(0);
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
