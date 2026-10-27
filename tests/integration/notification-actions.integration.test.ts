import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/shared/database/prisma";
import { authenticateAs } from "../helpers/auth";
let auth: string;
beforeEach(() => {
  auth = authenticateAs();
});
describe("Notification actions", () => {
  it("filters unread notifications for the authenticated owner", async () => {
    vi.spyOn(prisma.notification, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.notification, "count").mockResolvedValue(0);
    const response = await request(app)
      .get("/api/notifications?isRead=false&page=2&limit=5")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 10n, isRead: false },
        skip: 5,
        take: 5,
      }),
    );
  });
  it("returns only the owner's unread count", async () => {
    vi.spyOn(prisma.notification, "count").mockResolvedValue(3);
    const response = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ count: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 10n, isRead: false },
    });
  });
  it("marks all unread notifications belonging to the owner", async () => {
    vi.spyOn(prisma.notification, "updateMany").mockResolvedValue({ count: 2 });
    const response = await request(app)
      .patch("/api/notifications/read-all")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updated: 2 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 10n, isRead: false },
      data: { isRead: true, readAt: expect.any(Date) },
    });
  });
  it("preserves the read timestamp when marking an already-read notification", async () => {
    const readAt = new Date("2026-09-20T00:00:00Z");
    vi.spyOn(prisma.notification, "findFirst").mockResolvedValue({
      id: 20n,
      readAt,
    } as never);
    vi.spyOn(prisma.notification, "update").mockResolvedValue({
      id: 20n,
      isRead: true,
      readAt,
    } as never);
    const response = await request(app)
      .patch("/api/notifications/20/read")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 20n, userId: 10n },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 20n },
      data: { isRead: true, readAt },
    });
  });
  it("hides notifications that do not belong to the user", async () => {
    vi.spyOn(prisma.notification, "findFirst").mockResolvedValue(null);
    const response = await request(app)
      .patch("/api/notifications/20/read")
      .set("Authorization", auth);
    expect(response.status).toBe(404);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
  it.each(["isRead=invalid", "limit=101", "page=0"])(
    "rejects invalid filters %s",
    async (query) => {
      const response = await request(app)
        .get(`/api/notifications?${query}`)
        .set("Authorization", auth);
      expect(response.status).toBe(400);
      expect(prisma.notification.findMany).not.toHaveBeenCalled();
    },
  );
});
