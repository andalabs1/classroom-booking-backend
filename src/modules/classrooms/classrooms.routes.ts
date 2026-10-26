import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../shared/middlewares/error";
import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { ok } from "../../shared/utils/response";

const router = Router();

const blockingStatuses = ["PENDING", "CONFIRMED", "IN_USE"] as const;
/**
 * รับ query เป็นข้อความคั่น comma หรือ array แล้ว trim/ตัดค่าว่างก่อนตรวจรายการอุปกรณ์
 */
const csvStrings = z.preprocess(
  (value) =>
    value === undefined
      ? undefined
      : (Array.isArray(value) ? value : [value])
          .flatMap((item) => String(item).split(","))
          .map((item) => item.trim())
          .filter(Boolean),
  z.array(z.string().min(1)).max(100).optional(),
);
/**
 * รับ classroomIds แบบ comma หรือ array แล้วตรวจและแปลงแต่ละค่าเป็น BigInt บวก
 */
const csvIds = z.preprocess(
  (value) =>
    value === undefined
      ? undefined
      : (Array.isArray(value) ? value : [value])
          .flatMap((item) => String(item).split(","))
          .map((item) => item.trim())
          .filter(Boolean),
  z.array(z.coerce.bigint().positive()).max(100).optional(),
);

const rangeQuery = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  classroomIds: csvIds,
});
/**
 * ตรวจให้เวลาสิ้นสุดอยู่หลังเวลาเริ่ม; ช่วงเวลาเท่ากันหรือกลับด้านทำให้เกิด AppError 400
 */
const ensureRange = (startAt: Date, endAt: Date) => {
  if (endAt <= startAt) throw new AppError(400, "Invalid time range");
};

// ค้นหา/เรียงห้องแบบสาธารณะ แล้วกรองอุปกรณ์ก่อนแบ่งหน้าและคำนวณ total
router.get("/", async (req, res, next) => {
  try {
    const query = z
      .object({
        search: z.string().optional(),
        building: z.string().optional(),
        floor: z.string().optional(),
        category: z.string().optional(),
        status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
        minCapacity: z.coerce.number().int().positive().optional(),
        equipment: csvStrings,
        sort: z.enum(["code", "capacity", "name"]).default("code"),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
      })
      .parse(req.query);
    const where: Prisma.ClassroomWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search } },
              { name: { contains: query.search } },
              { building: { contains: query.search } },
            ],
          }
        : {}),
      ...(query.building ? { building: query.building } : {}),
      ...(query.floor ? { floor: query.floor } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.minCapacity ? { capacity: { gte: query.minCapacity } } : {}),
    };
    const rooms = await prisma.classroom.findMany({
      where,
      orderBy:
        query.sort === "capacity"
          ? { capacity: "desc" }
          : query.sort === "name"
            ? { name: "asc" }
            : [{ code: "asc" }, { name: "asc" }],
    });
    // กรองอุปกรณ์ใน JSON ก่อนแบ่งหน้า เพื่อให้ total และจำนวนรายการต่อหน้าตรงกับผลกรอง
    const filtered = query.equipment?.length
      ? rooms.filter((room) => {
          const equipment = Array.isArray(room.equipment)
            ? room.equipment.map(String)
            : [];
          return query.equipment!.every((item) => equipment.includes(item));
        })
      : rooms;
    const data = filtered.slice(
      (query.page - 1) * query.limit,
      query.page * query.limit,
    );
    ok(res, jsonSafe(data), "Success", {
      page: query.page,
      limit: query.limit,
      total: filtered.length,
    });
  } catch (error) {
    next(error);
  }
});

// คืนห้อง ACTIVE พร้อมรายการชนและ available ในช่วงที่เลือก; availableOnly ใช้ซ่อนห้องที่ไม่ว่าง
router.get("/availability", async (req, res, next) => {
  try {
    const query = rangeQuery
      .extend({
        building: z.string().optional(),
        minCapacity: z.coerce.number().int().positive().optional(),
        equipment: csvStrings,
        availableOnly: z.enum(["true", "false"]).default("false"),
      })
      .parse(req.query);
    ensureRange(query.startAt, query.endAt);
    const rooms = await prisma.classroom.findMany({
      where: {
        status: "ACTIVE",
        ...(query.classroomIds?.length
          ? { id: { in: query.classroomIds } }
          : {}),
        ...(query.building ? { building: query.building } : {}),
        ...(query.minCapacity ? { capacity: { gte: query.minCapacity } } : {}),
      },
      orderBy: [{ building: "asc" }, { name: "asc" }],
    });
    const equipmentFiltered = query.equipment?.length
      ? rooms.filter((room) => {
          const equipment = Array.isArray(room.equipment)
            ? room.equipment.map(String)
            : [];
          return query.equipment!.every((item) => equipment.includes(item));
        })
      : rooms;
    const conflicts = equipmentFiltered.length
      ? await prisma.booking.findMany({
          where: {
            classroomId: { in: equipmentFiltered.map((room) => room.id) },
            status: { in: [...blockingStatuses] },
            startAt: { lt: query.endAt },
            endAt: { gt: query.startAt },
          },
          select: {
            id: true,
            classroomId: true,
            startAt: true,
            endAt: true,
            status: true,
          },
        })
      : [];
    const result = equipmentFiltered
      .map((room) => {
        const roomConflicts = conflicts.filter(
          (booking) => booking.classroomId === room.id,
        );
        return {
          ...room,
          available: roomConflicts.length === 0,
          conflicts: roomConflicts,
        };
      })
      .filter((room) => query.availableOnly !== "true" || room.available);
    ok(
      res,
      jsonSafe({ startAt: query.startAt, endAt: query.endAt, rooms: result }),
    );
  } catch (error) {
    next(error);
  }
});

// คืนตารางใช้งานของห้อง ACTIVE แบบจัดกลุ่มตามห้อง โดยอนุญาตช่วงค้นหาสูงสุด 31 วัน
router.get("/schedule", async (req, res, next) => {
  try {
    const query = rangeQuery.parse(req.query);
    ensureRange(query.startAt, query.endAt);
    if (
      query.endAt.getTime() - query.startAt.getTime() >
      31 * 24 * 60 * 60 * 1000
    )
      throw new AppError(400, "Schedule range cannot exceed 31 days");
    const rooms = await prisma.classroom.findMany({
      where: {
        status: "ACTIVE",
        ...(query.classroomIds?.length
          ? { id: { in: query.classroomIds } }
          : {}),
      },
      orderBy: [{ building: "asc" }, { name: "asc" }],
    });
    const bookings = rooms.length
      ? await prisma.booking.findMany({
          where: {
            classroomId: { in: rooms.map((room) => room.id) },
            status: { in: [...blockingStatuses] },
            startAt: { lt: query.endAt },
            endAt: { gt: query.startAt },
          },
          select: {
            id: true,
            classroomId: true,
            startAt: true,
            endAt: true,
            status: true,
          },
          orderBy: { startAt: "asc" },
        })
      : [];
    ok(
      res,
      jsonSafe({
        startAt: query.startAt,
        endAt: query.endAt,
        rooms: rooms.map((room) => ({
          ...room,
          bookings: bookings.filter(
            (booking) => booking.classroomId === room.id,
          ),
        })),
      }),
    );
  } catch (error) {
    next(error);
  }
});

// คืนรายละเอียดห้องตาม ID แบบสาธารณะ หรือส่ง 404 เมื่อไม่พบ
router.get("/:id", async (req, res, next) => {
  try {
    const classroom = await prisma.classroom.findUnique({
      where: { id: BigInt(req.params.id) },
    });
    if (!classroom) throw new AppError(404, "Classroom not found");
    ok(res, jsonSafe(classroom));
  } catch (error) {
    next(error);
  }
});

// ตรวจห้อง ACTIVE รายห้องว่ามี PENDING/CONFIRMED/IN_USE ที่ทับช่วงหรือไม่ แล้วคืน available
router.get("/:id/availability", async (req, res, next) => {
  try {
    const query = rangeQuery.omit({ classroomIds: true }).parse(req.query);
    ensureRange(query.startAt, query.endAt);
    const classroom = await prisma.classroom.findUnique({
      where: { id: BigInt(req.params.id) },
    });
    if (!classroom || classroom.status !== "ACTIVE")
      throw new AppError(404, "Classroom not found or inactive");
    const count = await prisma.booking.count({
      where: {
        classroomId: classroom.id,
        status: { in: [...blockingStatuses] },
        startAt: { lt: query.endAt },
        endAt: { gt: query.startAt },
      },
    });
    ok(res, { available: count === 0 });
  } catch (error) {
    next(error);
  }
});

export default router;
