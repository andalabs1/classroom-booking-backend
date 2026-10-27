import { Router } from "express";

import { ClassroomStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { AppError } from "../../shared/middlewares/error";
import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { newId } from "../../shared/utils/id";
import { created, ok } from "../../shared/utils/response";

import { pageQuery, classroomInput, safeUser } from "./admin.schemas";
import { audit } from "./admin-audit.service";

const r = Router();

// ค้นหา/แบ่งหน้าห้องสำหรับ ADMIN ตามชื่อ อาคาร และสถานะ
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
// คืนห้องพร้อมประวัติการจองและโปรไฟล์ผู้จอง หรือส่ง 404 เมื่อไม่พบ
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
// สร้างห้องจาก schema ของ admin และบันทึก audit; รหัสห้องซ้ำส่ง 409
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
// แก้ฟิลด์ห้องที่ส่งมาและบันทึก snapshot ก่อน/หลังลง audit; รหัสห้องซ้ำส่ง 409
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
// เปลี่ยนสถานะห้องตาม ClassroomStatus และบันทึก audit ของการเปลี่ยนแปลง
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
// ปิดห้องเป็น INACTIVE แบบ soft delete เพื่อเก็บประวัติที่อ้างถึงห้อง พร้อมบันทึก audit
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

export default r;
