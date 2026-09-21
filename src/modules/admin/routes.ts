import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  BookingStatus,
  ClassroomStatus,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../../middlewares/auth";
import { AppError } from "../../middlewares/error";
import { prisma, jsonSafe, newId } from "../../utils/prisma";
import { created, ok } from "../../utils/response";

const r = Router();
r.use(authenticate, requireRole("ADMIN"));
const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const classroomInput = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().min(1).max(100),
  building: z.string().min(1).max(100),
  floor: z
    .string()
    .regex(/^[1-9]\d*$/)
    .max(50),
  capacity: z.coerce.number().int().positive(),
  description: z.string().trim().min(1).max(5000),
  category: z.string().trim().min(1).max(100),
  equipment: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  imageUrl: z.string().url().nullable().optional(),
  status: z.nativeEnum(ClassroomStatus).default("ACTIVE"),
});
const adminUserInput = z.object({
  name: z.string().min(1).max(150),
  userCode: z.string().trim().min(3).max(50).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z
    .string()
    .regex(/^0[0-9]{8,9}$/)
    .optional(),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(Role).default("USER"),
  status: z.nativeEnum(UserStatus).default("ACTIVE"),
});
const safeUser = {
  id: true,
  userCode: true,
  name: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;
const audit = (
  userId: bigint,
  action: string,
  entity: string,
  entityId: bigint,
  oldValue?: unknown,
  newValue?: unknown,
) =>
  prisma.auditLog.create({
    data: {
      id: newId(),
      userId,
      action,
      entity,
      entityId,
      oldValue: oldValue
        ? (jsonSafe(oldValue) as Prisma.InputJsonValue)
        : undefined,
      newValue: newValue
        ? (jsonSafe(newValue) as Prisma.InputJsonValue)
        : undefined,
    },
  });

r.get("/dashboard/summary", async (_req, res, next) => {
  try {
    const [
      users,
      activeUsers,
      classrooms,
      bookings,
      pending,
      confirmed,
      inUse,
      completed,
      noShow,
      cancelled,
      todayBookings,
      top,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.classroom.count(),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: "PENDING" } }),
      prisma.booking.count({ where: { status: "CONFIRMED" } }),
      prisma.booking.count({ where: { status: "IN_USE" } }),
      prisma.booking.count({ where: { status: "COMPLETED" } }),
      prisma.booking.count({ where: { status: "NO_SHOW" } }),
      prisma.booking.count({ where: { status: "CANCELLED" } }),
      prisma.booking.count({
        where: {
          startAt: {
            gte: new Date(
              new Date().toLocaleDateString("en-CA", {
                timeZone: "Asia/Bangkok",
              }) + "T00:00:00+07:00",
            ),
            lt: new Date(
              new Date(
                new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Bangkok",
                }) + "T00:00:00+07:00",
              ).getTime() +
                24 * 60 * 60 * 1000,
            ),
          },
        },
      }),
      prisma.booking.groupBy({
        by: ["classroomId"],
        _count: { _all: true },
        orderBy: { _count: { classroomId: "desc" } },
        take: 1,
      }),
    ]);
    const topRoom = top[0]
      ? await prisma.classroom.findUnique({ where: { id: top[0].classroomId } })
      : null;
    ok(
      res,
      jsonSafe({
        users,
        activeUsers,
        classrooms,
        bookings,
        pending,
        confirmed,
        inUse,
        completed,
        noShow,
        cancelled,
        todayBookings,
        mostBookedClassroom: topRoom
          ? { ...topRoom, bookingCount: top[0]._count._all }
          : null,
      }),
    );
  } catch (error) {
    next(error);
  }
});
r.get("/dashboard/recent-bookings", async (req, res, next) => {
  try {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .parse(req.query.limit);
    ok(
      res,
      jsonSafe(
        await prisma.booking.findMany({
          take: limit,
          orderBy: { createdAt: "desc" },
          include: { user: { select: safeUser }, classroom: true },
        }),
      ),
    );
  } catch (error) {
    next(error);
  }
});

r.get("/classrooms", async (req, res, next) => {
  try {
    const q = pageQuery
      .extend({
        search: z.string().optional(),
        building: z.string().optional(),
        status: z.nativeEnum(ClassroomStatus).optional(),
      })
      .parse(req.query);
    const where = {
      ...(q.search ? { name: { contains: q.search } } : {}),
      ...(q.building ? { building: q.building } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.classroom.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { id: "desc" },
      }),
      prisma.classroom.count({ where }),
    ]);
    ok(res, jsonSafe(data), "Success", { page: q.page, limit: q.limit, total });
  } catch (error) {
    next(error);
  }
});
r.get("/classrooms/:id", async (req, res, next) => {
  try {
    const classroom = await prisma.classroom.findUnique({
      where: { id: BigInt(req.params.id) },
      include: {
        bookings: {
          orderBy: { startAt: "desc" },
          include: { user: { select: safeUser } },
        },
      },
    });
    if (!classroom) throw new AppError(404, "Classroom not found");
    ok(res, jsonSafe(classroom));
  } catch (error) {
    next(error);
  }
});
r.post("/classrooms", async (req, res, next) => {
  try {
    const input = classroomInput.parse(req.body);
    const classroom = await prisma.classroom.create({
      data: {
        id: newId(),
        ...input,
        equipment: input.equipment as Prisma.InputJsonValue,
      },
    });
    await audit(
      req.user!.id,
      "CREATE",
      "CLASSROOM",
      classroom.id,
      undefined,
      classroom,
    );
    created(res, jsonSafe(classroom));
  } catch (error) {
    const message = String((error as Error).message);
    next(
      message.includes("Unique constraint")
        ? new AppError(409, "Classroom code already exists")
        : error,
    );
  }
});
r.patch("/classrooms/:id", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const oldValue = await prisma.classroom.findUnique({ where: { id } });
    if (!oldValue) throw new AppError(404, "Classroom not found");
    const input = classroomInput.partial().parse(req.body);
    const classroom = await prisma.classroom.update({
      where: { id },
      data: {
        ...input,
        equipment: input.equipment as Prisma.InputJsonValue | undefined,
      },
    });
    await audit(req.user!.id, "UPDATE", "CLASSROOM", id, oldValue, classroom);
    ok(res, jsonSafe(classroom), "Classroom updated");
  } catch (error) {
    const message = String((error as Error).message);
    next(
      message.includes("Unique constraint")
        ? new AppError(409, "Classroom code already exists")
        : error,
    );
  }
});
r.patch("/classrooms/:id/status", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const oldValue = await prisma.classroom.findUnique({ where: { id } });
    if (!oldValue) throw new AppError(404, "Classroom not found");
    const status = z.nativeEnum(ClassroomStatus).parse(req.body.status);
    const classroom = await prisma.classroom.update({
      where: { id },
      data: { status },
    });
    await audit(
      req.user!.id,
      "STATUS_CHANGE",
      "CLASSROOM",
      id,
      oldValue,
      classroom,
    );
    ok(res, jsonSafe(classroom));
  } catch (error) {
    next(error);
  }
});
r.delete("/classrooms/:id", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const oldValue = await prisma.classroom.findUnique({ where: { id } });
    if (!oldValue) throw new AppError(404, "Classroom not found");
    const classroom = await prisma.classroom.update({
      where: { id },
      data: { status: "INACTIVE" },
    });
    await audit(
      req.user!.id,
      "SOFT_DELETE",
      "CLASSROOM",
      id,
      oldValue,
      classroom,
    );
    ok(res, jsonSafe(classroom), "Classroom deactivated");
  } catch (error) {
    next(error);
  }
});

const adminBookingQuery = pageQuery.extend({
  status: z.nativeEnum(BookingStatus).optional(),
  classroomId: z.coerce.bigint().optional(),
  userId: z.coerce.bigint().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().optional(),
});
r.get("/bookings", async (req, res, next) => {
  try {
    const q = adminBookingQuery.parse(req.query);
    const where: Prisma.BookingWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.classroomId ? { classroomId: q.classroomId } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.startDate || q.endDate
        ? {
            startAt: {
              ...(q.startDate ? { gte: q.startDate } : {}),
              ...(q.endDate ? { lte: q.endDate } : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            OR: [
              { bookingCode: { contains: q.search } },
              { purpose: { contains: q.search } },
              { user: { name: { contains: q.search } } },
              { classroom: { name: { contains: q.search } } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: safeUser }, classroom: true },
      }),
      prisma.booking.count({ where }),
    ]);
    ok(res, jsonSafe(data), "Success", { page: q.page, limit: q.limit, total });
  } catch (error) {
    next(error);
  }
});
r.get("/bookings/:id", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        user: { select: safeUser },
        classroom: true,
        approver: { select: safeUser },
      },
    });
    if (!booking) throw new AppError(404, "Booking not found");
    const history = await prisma.auditLog.findMany({
      where: { entity: "BOOKING", entityId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: safeUser } },
    });
    ok(res, jsonSafe({ ...booking, history }));
  } catch (error) {
    next(error);
  }
});
const changeBookingStatus = async (
  id: bigint,
  adminId: bigint,
  status: BookingStatus,
  note?: string,
) => {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new AppError(404, "Booking not found");
  if (
    ["CONFIRMED", "REJECTED"].includes(status) &&
    booking.status !== "PENDING"
  )
    throw new AppError(
      409,
      "Only pending bookings can be approved or rejected",
    );
  if (
    status === "CANCELLED" &&
    !["PENDING", "CONFIRMED"].includes(booking.status)
  )
    throw new AppError(
      409,
      "Booking cannot be cancelled from its current status",
    );
  if (status === "IN_USE" && booking.status !== "CONFIRMED")
    throw new AppError(409, "Only confirmed bookings can be started");
  if (
    status === "COMPLETED" &&
    !["CONFIRMED", "IN_USE"].includes(booking.status)
  )
    throw new AppError(
      409,
      "Only confirmed or in-use bookings can be completed",
    );
  if (
    status === "NO_SHOW" &&
    (booking.status !== "CONFIRMED" || booking.startAt > new Date())
  )
    throw new AppError(
      409,
      "Only started confirmed bookings can be marked no-show",
    );
  return prisma.$transaction(
    async (tx) => {
      if (status === "CONFIRMED") {
        const conflict = await tx.booking.findFirst({
          where: {
            id: { not: id },
            classroomId: booking.classroomId,
            status: { in: ["CONFIRMED", "IN_USE"] },
            startAt: { lt: booking.endAt },
            endAt: { gt: booking.startAt },
          },
        });
        if (conflict) throw new AppError(409, "Booking time conflicts");
      }
      const now = new Date();
      const updated = await tx.booking.update({
        where: { id },
        data: {
          status,
          adminNote: note,
          ...(status === "CONFIRMED"
            ? { approvedBy: adminId, approvedAt: now }
            : {}),
          ...(status === "IN_USE" ? { checkedInAt: now } : {}),
          ...(["COMPLETED", "NO_SHOW"].includes(status)
            ? { completedAt: now }
            : {}),
          ...(status === "CANCELLED"
            ? { cancelledAt: now, cancelReason: note }
            : {}),
        },
      });
      await tx.notification.create({
        data: {
          id: newId(),
          userId: booking.userId,
          bookingId: booking.id,
          title: "Booking " + status.toLowerCase(),
          message: note || booking.bookingCode + " was " + status.toLowerCase(),
          type: "BOOKING_" + status,
        },
      });
      await tx.auditLog.create({
        data: {
          id: newId(),
          userId: adminId,
          action: status,
          entity: "BOOKING",
          entityId: id,
          oldValue: jsonSafe(booking) as Prisma.InputJsonValue,
          newValue: jsonSafe(updated) as Prisma.InputJsonValue,
        },
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};
r.patch("/bookings/:id/approve", async (req, res, next) => {
  try {
    ok(
      res,
      jsonSafe(
        await changeBookingStatus(
          BigInt(req.params.id),
          req.user!.id,
          "CONFIRMED",
        ),
      ),
      "Booking approved",
    );
  } catch (error) {
    next(error);
  }
});
r.patch("/bookings/:id/reject", async (req, res, next) => {
  try {
    const note = z.string().min(1).parse(req.body.adminNote);
    ok(
      res,
      jsonSafe(
        await changeBookingStatus(
          BigInt(req.params.id),
          req.user!.id,
          "REJECTED",
          note,
        ),
      ),
      "Booking rejected",
    );
  } catch (error) {
    next(error);
  }
});
r.patch("/bookings/:id/cancel", async (req, res, next) => {
  try {
    const reason = z.string().trim().min(1).optional().parse(req.body?.reason);
    ok(
      res,
      jsonSafe(
        await changeBookingStatus(
          BigInt(req.params.id),
          req.user!.id,
          "CANCELLED",
          reason,
        ),
      ),
      "Booking cancelled",
    );
  } catch (error) {
    next(error);
  }
});
r.patch("/bookings/:id/start", async (req, res, next) => {
  try {
    ok(
      res,
      jsonSafe(
        await changeBookingStatus(
          BigInt(req.params.id),
          req.user!.id,
          "IN_USE",
        ),
      ),
      "Booking started",
    );
  } catch (error) {
    next(error);
  }
});
r.patch("/bookings/:id/complete", async (req, res, next) => {
  try {
    ok(
      res,
      jsonSafe(
        await changeBookingStatus(
          BigInt(req.params.id),
          req.user!.id,
          "COMPLETED",
        ),
      ),
      "Booking completed",
    );
  } catch (error) {
    next(error);
  }
});
r.patch("/bookings/:id/no-show", async (req, res, next) => {
  try {
    const note = z.string().min(1).optional().parse(req.body?.reason);
    ok(
      res,
      jsonSafe(
        await changeBookingStatus(
          BigInt(req.params.id),
          req.user!.id,
          "NO_SHOW",
          note,
        ),
      ),
      "Booking marked no-show",
    );
  } catch (error) {
    next(error);
  }
});

r.get("/users", async (req, res, next) => {
  try {
    const q = pageQuery
      .extend({
        search: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        status: z.nativeEnum(UserStatus).optional(),
      })
      .parse(req.query);
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search } },
              { userCode: { contains: q.search } },
              { email: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: "desc" },
        select: safeUser,
      }),
      prisma.user.count({ where }),
    ]);
    ok(res, jsonSafe(data), "Success", { page: q.page, limit: q.limit, total });
  } catch (error) {
    next(error);
  }
});
r.post("/users", async (req, res, next) => {
  try {
    const { password, ...input } = adminUserInput.parse(req.body);
    const user = await prisma.user.create({
      data: {
        id: newId(),
        ...input,
        passwordHash: await bcrypt.hash(password, 12),
      },
      select: safeUser,
    });
    await audit(req.user!.id, "CREATE", "USER", user.id, undefined, user);
    created(res, jsonSafe(user), "User created");
  } catch (error) {
    const message = String((error as Error).message);
    next(
      message.includes("Unique constraint")
        ? new AppError(409, "Email already exists")
        : error,
    );
  }
});
r.get("/users/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(req.params.id) },
      select: {
        ...safeUser,
        bookings: {
          orderBy: { createdAt: "desc" },
          include: { classroom: true },
        },
      },
    });
    if (!user) throw new AppError(404, "User not found");
    ok(res, jsonSafe(user));
  } catch (error) {
    next(error);
  }
});
r.patch("/users/:id", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const input = z
      .object({
        name: z.string().min(1).max(150),
        userCode: z.string().trim().min(3).max(50).nullable(),
        firstName: z.string().trim().min(1).max(100).nullable(),
        lastName: z.string().trim().min(1).max(100).nullable(),
        phone: z
          .string()
          .regex(/^0[0-9]{8,9}$/)
          .nullable(),
        email: z.string().email(),
      })
      .partial()
      .parse(req.body);
    const oldValue = await prisma.user.findUnique({
      where: { id },
      select: safeUser,
    });
    if (!oldValue) throw new AppError(404, "User not found");
    const user = await prisma.user.update({
      where: { id },
      data: input,
      select: safeUser,
    });
    await audit(req.user!.id, "UPDATE", "USER", id, oldValue, user);
    ok(res, jsonSafe(user));
  } catch (error) {
    next(error);
  }
});
r.patch("/users/:id/role", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const role = z.nativeEnum(Role).parse(req.body.role);
    const oldValue = await prisma.user.findUnique({
      where: { id },
      select: safeUser,
    });
    if (!oldValue) throw new AppError(404, "User not found");
    if (
      oldValue.role === "ADMIN" &&
      role !== "ADMIN" &&
      (await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      })) <= 1
    )
      throw new AppError(409, "Cannot change the last active admin");
    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: safeUser,
    });
    await audit(req.user!.id, "ROLE_CHANGE", "USER", id, oldValue, user);
    ok(res, jsonSafe(user));
  } catch (error) {
    next(error);
  }
});
r.patch("/users/:id/status", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const status = z.nativeEnum(UserStatus).parse(req.body.status);
    const oldValue = await prisma.user.findUnique({
      where: { id },
      select: safeUser,
    });
    if (!oldValue) throw new AppError(404, "User not found");
    if (
      oldValue.role === "ADMIN" &&
      status !== "ACTIVE" &&
      (await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      })) <= 1
    )
      throw new AppError(409, "Cannot deactivate the last active admin");
    const user = await prisma.user.update({
      where: { id },
      data: { status },
      select: safeUser,
    });
    await audit(req.user!.id, "STATUS_CHANGE", "USER", id, oldValue, user);
    ok(res, jsonSafe(user));
  } catch (error) {
    next(error);
  }
});
r.patch("/users/:id/reset-password", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const password = z.string().min(8).parse(req.body.newPassword);
    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12) },
    });
    await audit(req.user!.id, "RESET_PASSWORD", "USER", id);
    ok(res, null, "Password reset");
  } catch (error) {
    next(error);
  }
});
r.delete("/users/:id", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const oldValue = await prisma.user.findUnique({
      where: { id },
      select: safeUser,
    });
    if (!oldValue) throw new AppError(404, "User not found");
    if (
      oldValue.role === "ADMIN" &&
      (await prisma.user.count({
        where: { role: "ADMIN", status: "ACTIVE" },
      })) <= 1
    )
      throw new AppError(409, "Cannot deactivate the last active admin");
    const user = await prisma.user.update({
      where: { id },
      data: { status: "INACTIVE" },
      select: safeUser,
    });
    await audit(req.user!.id, "SOFT_DELETE", "USER", id, oldValue, user);
    ok(res, jsonSafe(user), "User deactivated");
  } catch (error) {
    next(error);
  }
});

const reportDate = z
  .string()
  .trim()
  .refine((value) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(`${value}T00:00:00+07:00`);
      return (
        !Number.isNaN(parsed.getTime()) &&
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Bangkok",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(parsed) === value
      );
    }
    return !Number.isNaN(Date.parse(value));
  }, "Invalid date; use YYYY-MM-DD or an ISO 8601 date-time");
const reportFilter = z
  .object({
    startDate: reportDate.optional(),
    endDate: reportDate.optional(),
    status: z.nativeEnum(BookingStatus).optional(),
    classroomId: z.coerce.bigint().positive().optional(),
    userId: z.coerce.bigint().positive().optional(),
    userRole: z.nativeEnum(Role).optional(),
    building: z.string().trim().min(1).max(100).optional(),
    floor: z.string().trim().min(1).max(50).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    search: z.string().trim().min(1).max(255).optional(),
  })
  .superRefine((query, ctx) => {
    if (
      query.startDate &&
      query.endDate &&
      reportDateBoundary(query.startDate, "start").date >
        reportDateBoundary(query.endDate, "end").date
    )
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "endDate must be on or after startDate",
      });
  });
const reportDateBoundary = (value: string, side: "start" | "end") => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly) return { date: new Date(value), exclusive: false };
  const date = new Date(`${value}T00:00:00+07:00`);
  if (side === "end") date.setUTCDate(date.getUTCDate() + 1);
  return { date, exclusive: side === "end" };
};
const reportWhere = (
  q: z.infer<typeof reportFilter>,
): Prisma.BookingWhereInput => {
  const start = q.startDate ? reportDateBoundary(q.startDate, "start") : null;
  const end = q.endDate ? reportDateBoundary(q.endDate, "end") : null;
  return {
    ...(q.status ? { status: q.status } : {}),
    ...(q.classroomId ? { classroomId: q.classroomId } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.userRole ? { user: { role: q.userRole } } : {}),
    ...(q.building || q.floor || q.category
      ? {
          classroom: {
            ...(q.building ? { building: q.building } : {}),
            ...(q.floor ? { floor: q.floor } : {}),
            ...(q.category ? { category: q.category } : {}),
          },
        }
      : {}),
    ...(start || end
      ? {
          AND: [
            ...(start ? [{ endAt: { gt: start.date } }] : []),
            ...(end
              ? [
                  {
                    startAt: end.exclusive
                      ? { lt: end.date }
                      : { lte: end.date },
                  },
                ]
              : []),
          ],
        }
      : {}),
    ...(q.search
      ? {
          OR: [
            { bookingCode: { contains: q.search } },
            { purpose: { contains: q.search } },
            { classroom: { code: { contains: q.search } } },
            { classroom: { name: { contains: q.search } } },
            { classroom: { building: { contains: q.search } } },
            { user: { name: { contains: q.search } } },
            { user: { email: { contains: q.search } } },
          ],
        }
      : {}),
  };
};
const bangkokDateKey = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
const shiftCalendarDate = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
};
r.get("/reports/summary", async (_req, res, next) => {
  try {
    const today = bangkokDateKey(new Date());
    const graphStartDate = shiftCalendarDate(today, -6);
    const graphEndDate = shiftCalendarDate(today, 1);
    const graphStartAt = new Date(`${graphStartDate}T00:00:00+07:00`);
    const graphEndAt = new Date(`${graphEndDate}T00:00:00+07:00`);
    const [users, classrooms, bookings, byStatus, recentBookings] =
      await Promise.all([
        prisma.user.count(),
        prisma.classroom.count(),
        prisma.booking.count(),
        prisma.booking.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.booking.findMany({
          where: { startAt: { gte: graphStartAt, lt: graphEndAt } },
          select: { startAt: true },
        }),
      ]);
    const graphCounts = new Map<string, number>();
    for (const booking of recentBookings) {
      const date = bangkokDateKey(booking.startAt);
      graphCounts.set(date, (graphCounts.get(date) ?? 0) + 1);
    }
    const statusCounts = new Map(
      byStatus.map((item) => [item.status, item._count._all]),
    );
    const statusPie = Object.values(BookingStatus).map((status) => {
      const count = statusCounts.get(status) ?? 0;
      return {
        status,
        count,
        percentage: bookings
          ? Number(((count / bookings) * 100).toFixed(2))
          : 0,
      };
    });
    ok(
      res,
      jsonSafe({
        users,
        classrooms,
        bookings,
        byStatus,
        bookingsGraph: {
          timezone: "Asia/Bangkok",
          startDate: graphStartDate,
          endDate: today,
          data: Array.from({ length: 7 }, (_, index) => {
            const date = shiftCalendarDate(graphStartDate, index);
            return { date, count: graphCounts.get(date) ?? 0 };
          }),
        },
        statusPie: {
          total: bookings,
          data: statusPie,
        },
      }),
    );
  } catch (error) {
    next(error);
  }
});
r.get("/reports/bookings", async (req, res, next) => {
  try {
    const q = reportFilter.parse(req.query);
    const rows = await prisma.booking.findMany({
      where: reportWhere(q),
      include: { classroom: true, user: { select: safeUser } },
      orderBy: { startAt: "asc" },
    });
    const byStatus = await prisma.booking.groupBy({
      by: ["status"],
      where: reportWhere(q),
      _count: { _all: true },
    });
    ok(res, jsonSafe({ total: rows.length, byStatus, rows }));
  } catch (error) {
    next(error);
  }
});
r.get("/reports/classrooms", async (req, res, next) => {
  try {
    const q = reportFilter.parse(req.query);
    const rows = await prisma.booking.findMany({
      where: reportWhere(q),
      include: { classroom: true },
    });
    const map = new Map<
      string,
      { classroom: unknown; bookingCount: number; totalHours: number }
    >();
    for (const row of rows) {
      const key = row.classroomId.toString();
      const item = map.get(key) || {
        classroom: row.classroom,
        bookingCount: 0,
        totalHours: 0,
      };
      item.bookingCount++;
      item.totalHours +=
        (row.endAt.getTime() - row.startAt.getTime()) / 3600000;
      map.set(key, item);
    }
    ok(
      res,
      jsonSafe(
        [...map.values()].sort((a, b) => b.bookingCount - a.bookingCount),
      ),
    );
  } catch (error) {
    next(error);
  }
});
r.get("/reports/users", async (req, res, next) => {
  try {
    const q = reportFilter.parse(req.query);
    const groups = await prisma.booking.groupBy({
      by: ["userId"],
      where: reportWhere(q),
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: groups.map((g) => g.userId) } },
      select: safeUser,
    });
    ok(
      res,
      jsonSafe(
        groups.map((group) => ({
          user: users.find((user) => user.id === group.userId),
          bookingCount: group._count._all,
        })),
      ),
    );
  } catch (error) {
    next(error);
  }
});
r.get("/reports/export", async (req, res, next) => {
  try {
    const q = reportFilter.parse(req.query);
    const rows = await prisma.booking.findMany({
      where: reportWhere(q),
      include: { classroom: true, user: { select: safeUser } },
      orderBy: { startAt: "asc" },
    });
    const escape = (value: unknown) =>
      '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const thaiMonths = [
      "ม.ค.",
      "ก.พ.",
      "มี.ค.",
      "เม.ย.",
      "พ.ค.",
      "มิ.ย.",
      "ก.ค.",
      "ส.ค.",
      "ก.ย.",
      "ต.ค.",
      "พ.ย.",
      "ธ.ค.",
    ];
    const formatBangkokDateTime = (value: Date) => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Bangkok",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(value)
          .map((part) => [part.type, part.value]),
      );
      return `${parts.day} ${thaiMonths[Number(parts.month) - 1]} ${parts.year} ${parts.hour}:${parts.minute} น.`;
    };
    const csv = [
      [
        "รหัสการจอง",
        "รหัสผู้ใช้",
        "ชื่อผู้จอง",
        "อีเมลผู้จอง",
        "บทบาทผู้ใช้",
        "รหัสห้องในระบบ",
        "รหัสห้อง",
        "ชื่อห้อง",
        "อาคาร",
        "ชั้น",
        "ประเภทห้อง",
        "วัตถุประสงค์",
        "จำนวนผู้เข้าร่วม",
        "อุปกรณ์ที่ต้องการ",
        "วันเวลาเริ่มต้น (เวลาไทย)",
        "วันเวลาสิ้นสุด (เวลาไทย)",
        "สถานะการจอง",
        "วันที่สร้างรายการ (เวลาไทย)",
      ].join(","),
      ...rows.map((row) =>
        [
          row.bookingCode,
          row.userId,
          row.user.name,
          row.user.email,
          row.user.role,
          row.classroomId,
          row.classroom.code,
          row.classroom.name,
          row.classroom.building,
          row.classroom.floor,
          row.classroom.category,
          row.purpose,
          row.attendeeCount,
          Array.isArray(row.requestedEquipment)
            ? row.requestedEquipment.join(" | ")
            : "",
          formatBangkokDateTime(row.startAt),
          formatBangkokDateTime(row.endAt),
          row.status,
          formatBangkokDateTime(row.createdAt),
        ]
          .map(escape)
          .join(","),
      ),
    ].join("\n");
    const range = [q.startDate, q.endDate]
      .filter(Boolean)
      .map((value) => value!.slice(0, 10))
      .join("-to-");
    res
      .type("text/csv; charset=utf-8")
      .attachment(`booking-report${range ? `-${range}` : ""}.csv`)
      .send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
});
r.get("/audit-logs", async (req, res, next) => {
  try {
    const q = pageQuery
      .extend({
        userId: z.coerce.bigint().optional(),
        action: z.string().optional(),
        entity: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      })
      .parse(req.query);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.startDate || q.endDate
        ? {
            createdAt: {
              ...(q.startDate ? { gte: q.startDate } : {}),
              ...(q.endDate ? { lte: q.endDate } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: safeUser } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    ok(res, jsonSafe(data), "Success", { page: q.page, limit: q.limit, total });
  } catch (error) {
    next(error);
  }
});
export default r;
