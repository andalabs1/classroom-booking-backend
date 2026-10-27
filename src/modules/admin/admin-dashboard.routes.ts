import { Router } from "express";

import { z } from "zod";

import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { ok } from "../../shared/utils/response";

import { safeUser } from "./admin.schemas";

const r = Router();

// รวมจำนวนผู้ใช้ ห้อง การจองแต่ละสถานะ รายการเริ่มวันนี้ตามเวลาไทย และห้องที่มีการจองมากที่สุด
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
// คืนการจองที่สร้างล่าสุดตาม limit พร้อมข้อมูลห้องและโปรไฟล์ผู้จองที่เลือกไว้
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

export default r;
