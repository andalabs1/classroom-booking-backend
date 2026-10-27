import { Router } from "express";

import { BookingStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { AppError } from "../../shared/middlewares/error";
import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { newId } from "../../shared/utils/id";
import { ok } from "../../shared/utils/response";

import { pageQuery, safeUser } from "./admin.schemas";

const r = Router();

const adminBookingQuery = pageQuery.extend({
  status: z.nativeEnum(BookingStatus).optional(),
  classroomId: z.coerce.bigint().optional(),
  userId: z.coerce.bigint().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  search: z.string().optional(),
});
// ให้ ADMIN ค้นหา/แบ่งหน้าการจองทุกผู้ใช้ พร้อมตัวกรองสถานะ ห้อง เจ้าของ และเวลาเริ่ม
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
// คืน booking พร้อมผู้จอง ห้อง ผู้อนุมัติ และ audit history เรียงตามเวลา
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
/**
 * ตรวจ transition ของ booking ตามสถานะปัจจุบัน และตรวจเวลาชนอีกครั้งเมื่ออนุมัติ
 * เขียนสถานะ เวลา ผู้อนุมัติ notification และ audit ใน serializable transaction เดียว
 * คืน booking ที่แก้แล้ว หรือโยน 404/409 เมื่อไม่พบรายการหรือ transition ไม่ผ่าน
 */
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
  // บันทึกสถานะ แจ้งเตือน และ audit พร้อมกัน เพื่อ rollback ทั้งชุดหากส่วนใดล้มเหลว
  return prisma.$transaction(
    async (tx) => {
      // ตรวจชนกับรายการที่อนุมัติ/ใช้งานแล้ว; คำขอ PENDING อื่นยังรอการตัดสินใจของ admin
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
// อนุมัติ PENDING เป็น CONFIRMED ผ่าน changeBookingStatus ซึ่งตรวจเวลาชนภายใน transaction
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
// ปฏิเสธ PENDING โดยบังคับ adminNote แล้วบันทึก REJECTED พร้อมแจ้งเตือนและ audit
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
// ให้ ADMIN ยกเลิก PENDING/CONFIRMED พร้อมเหตุผลถ้ามี ผ่าน service เปลี่ยนสถานะ
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
// ให้ ADMIN เปลี่ยน CONFIRMED เป็น IN_USE และบันทึก checkedInAt ผ่าน changeBookingStatus
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
// ให้ ADMIN ปิด CONFIRMED หรือ IN_USE เป็น COMPLETED พร้อม completedAt
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
// ให้ ADMIN ทำเครื่องหมาย NO_SHOW เฉพาะ CONFIRMED ที่ถึงเวลาเริ่มแล้ว พร้อมเหตุผลถ้ามี
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

export default r;
