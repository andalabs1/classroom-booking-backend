import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../shared/middlewares/auth";
import { AppError } from "../../shared/middlewares/error";
import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { ok } from "../../shared/utils/response";

const r = Router();
r.use(authenticate);
// คืนแจ้งเตือนเฉพาะเจ้าของ พร้อมตัวกรองอ่าน/ยังไม่อ่านและข้อมูล booking ที่เกี่ยวข้อง
r.get("/", async (req, res, next) => {
  try {
    const q = z
      .object({
        isRead: z.enum(["true", "false"]).optional(),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    const where = {
      userId: req.user!.id,
      ...(q.isRead ? { isRead: q.isRead === "true" } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: "desc" },
        include: {
          booking: {
            select: {
              id: true,
              bookingCode: true,
              startAt: true,
              endAt: true,
              status: true,
              classroom: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);
    ok(res, jsonSafe(data), "Success", { page: q.page, limit: q.limit, total });
  } catch (error) {
    next(error);
  }
});
// คืนจำนวนแจ้งเตือนที่ยังไม่อ่านของผู้ใช้ปัจจุบัน
r.get("/unread-count", async (req, res, next) => {
  try {
    ok(res, {
      count: await prisma.notification.count({
        where: { userId: req.user!.id, isRead: false },
      }),
    });
  } catch (error) {
    next(error);
  }
});
// ทำเครื่องหมายอ่านเฉพาะรายการของเจ้าของที่ยังไม่อ่าน และคืนจำนวนที่อัปเดต
r.patch("/read-all", async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    ok(res, { updated: result.count }, "Notifications marked read");
  } catch (error) {
    next(error);
  }
});
// ตรวจเจ้าของก่อนทำเครื่องหมายอ่านรายรายการ; เก็บ readAt เดิมเมื่อเคยอ่านแล้ว และใช้ 404 หากไม่พบของผู้ใช้
r.patch("/:id/read", async (req, res, next) => {
  try {
    const notification = await prisma.notification.findFirst({
      where: { id: BigInt(req.params.id), userId: req.user!.id },
    });
    if (!notification) throw new AppError(404, "Notification not found");
    ok(
      res,
      jsonSafe(
        await prisma.notification.update({
          where: { id: notification.id },
          data: { isRead: true, readAt: notification.readAt ?? new Date() },
        }),
      ),
    );
  } catch (error) {
    next(error);
  }
});
export default r;
