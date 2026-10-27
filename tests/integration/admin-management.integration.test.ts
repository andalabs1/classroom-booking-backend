import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/shared/database/prisma";
import { activeUser, authenticateAs } from "../helpers/auth";
let auth: string;
beforeEach(() => {
  auth = authenticateAs("ADMIN");
});
describe("Admin management routes", () => {
  it("lists classrooms through the protected admin router", async () => {
    vi.spyOn(prisma.classroom, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.classroom, "count").mockResolvedValue(0);
    const response = await request(app)
      .get("/api/admin/classrooms?status=ACTIVE&building=A&limit=5")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(prisma.classroom.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "ACTIVE", building: "A" },
        take: 5,
      }),
    );
  });
  it("creates a classroom and audit log", async () => {
    const body = {
      code: "A101",
      name: "Lecture",
      building: "A",
      floor: "1",
      capacity: 30,
      category: "Lecture",
      description: "Classroom",
      equipment: ["Projector"],
    };
    vi.spyOn(prisma.classroom, "create").mockResolvedValue({
      id: 20n,
      ...body,
      status: "ACTIVE",
    } as never);
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({ id: 30n } as never);
    const response = await request(app)
      .post("/api/admin/classrooms")
      .set("Authorization", auth)
      .send(body);
    expect(response.status).toBe(201);
    expect(prisma.classroom.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ...body,
        status: "ACTIVE",
        id: expect.any(BigInt),
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        entity: "CLASSROOM",
        entityId: 20n,
        newValue: expect.objectContaining({ id: "20" }),
      }),
    });
  });
  it("rejects invalid classroom input", async () => {
    const response = await request(app)
      .post("/api/admin/classrooms")
      .set("Authorization", auth)
      .send({ name: "Room" });
    expect(response.status).toBe(400);
    expect(prisma.classroom.create).not.toHaveBeenCalled();
  });
  it("deletes a classroom with no booking history", async () => {
    const classroom = { id: 20n, status: "ACTIVE", imageUrl: null };
    vi.spyOn(prisma.classroom, "findUnique").mockResolvedValue(
      classroom as never,
    );
    vi.spyOn(prisma.booking, "count").mockResolvedValue(0);
    vi.spyOn(prisma.classroom, "delete").mockResolvedValue(classroom as never);
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({ id: 30n } as never);

    const response = await request(app)
      .delete("/api/admin/classrooms/20")
      .set("Authorization", auth);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Classroom deleted");
    expect(prisma.booking.count).toHaveBeenCalledWith({
      where: { classroomId: 20n },
    });
    expect(prisma.classroom.delete).toHaveBeenCalledWith({
      where: { id: 20n },
    });
    expect(prisma.classroom.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        entity: "CLASSROOM",
        entityId: 20n,
        oldValue: { id: "20", status: "ACTIVE", imageUrl: null },
      }),
    });
  });
  it("rejects deleting a classroom with booking history", async () => {
    vi.spyOn(prisma.classroom, "findUnique").mockResolvedValue({
      id: 20n,
      status: "ACTIVE",
    } as never);
    vi.spyOn(prisma.booking, "count").mockResolvedValue(1);

    const response = await request(app)
      .delete("/api/admin/classrooms/20")
      .set("Authorization", auth);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "Cannot delete classroom with existing bookings; deactivate it instead",
    );
    expect(prisma.classroom.delete).not.toHaveBeenCalled();
    expect(prisma.classroom.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
  it("returns 404 for a missing classroom", async () => {
    vi.spyOn(prisma.classroom, "findUnique").mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get("/api/admin/classrooms/20")
          .set("Authorization", auth)
      ).status,
    ).toBe(404);
  });
  it("lists users with search and role filters", async () => {
    vi.spyOn(prisma.user, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.user, "count").mockResolvedValue(0);
    const response = await request(app)
      .get(
        "/api/admin/users?role=STUDENT&status=ACTIVE&search=test&page=2&limit=5",
      )
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: expect.objectContaining({
          role: "STUDENT",
          status: "ACTIVE",
          OR: expect.any(Array),
        }),
        select: expect.not.objectContaining({ passwordHash: true }),
      }),
    );
  });
  it.each([
    ["role", { role: "STUDENT" }],
    ["status", { status: "INACTIVE" }],
    ["", {}],
  ])("protects the last active admin for %s", async (action, body) => {
    vi.spyOn(prisma.user, "count").mockResolvedValue(1);
    const req = action
      ? request(app).patch(`/api/admin/users/10/${action}`)
      : request(app).delete("/api/admin/users/10");
    const response = await req.set("Authorization", auth).send(body);
    expect(response.status).toBe(409);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it("changes a user role and records an audit entry", async () => {
    vi.spyOn(prisma.user, "findUnique")
      .mockResolvedValueOnce(activeUser("ADMIN") as never)
      .mockResolvedValueOnce({ ...activeUser(), id: 20n } as never);
    vi.spyOn(prisma.user, "update").mockResolvedValue({
      ...activeUser("TEACHER"),
      id: 20n,
    } as never);
    vi.spyOn(prisma.auditLog, "create").mockResolvedValue({ id: 30n } as never);
    const response = await request(app)
      .patch("/api/admin/users/20/role")
      .set("Authorization", auth)
      .send({ role: "TEACHER" });
    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe("TEACHER");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ROLE_CHANGE",
        entity: "USER",
        entityId: 20n,
      }),
    });
  });
  it("returns dashboard counters without a top classroom", async () => {
    vi.spyOn(prisma.user, "count").mockResolvedValue(2);
    vi.spyOn(prisma.classroom, "count").mockResolvedValue(3);
    vi.spyOn(prisma.booking, "count").mockResolvedValue(0);
    vi.spyOn(prisma.booking, "groupBy").mockResolvedValue([]);
    const response = await request(app)
      .get("/api/admin/dashboard/summary")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      users: 2,
      classrooms: 3,
      bookings: 0,
      mostBookedClassroom: null,
    });
  });
  it("returns recent bookings from the dashboard router", async () => {
    vi.spyOn(prisma.booking, "findMany").mockResolvedValue([
      { id: 20n },
    ] as never);
    const response = await request(app)
      .get("/api/admin/dashboard/recent-bookings?limit=5")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: "20" }]);
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });
  it("lists filtered audit logs", async () => {
    vi.spyOn(prisma.auditLog, "findMany").mockResolvedValue([]);
    vi.spyOn(prisma.auditLog, "count").mockResolvedValue(0);
    const response = await request(app)
      .get("/api/admin/audit-logs?action=CREATE&entity=BOOKING&userId=10")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: "CREATE", entity: "BOOKING", userId: 10n },
      }),
    );
  });
  it.each([
    "dashboard/summary",
    "classrooms",
    "bookings",
    "users",
    "reports/summary",
    "audit-logs",
  ])("protects the %s child router", async (path) => {
    expect((await request(app).get(`/api/admin/${path}`)).status).toBe(401);
    expect(
      (
        await request(app)
          .get(`/api/admin/${path}`)
          .set("Authorization", authenticateAs())
      ).status,
    ).toBe(403);
  });
});
