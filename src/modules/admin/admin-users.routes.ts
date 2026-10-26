import { Router } from "express";

import bcrypt from "bcryptjs";
import { Prisma, Role, UserStatus } from "@prisma/client";
import { z } from "zod";

import { AppError } from "../../shared/middlewares/error";
import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { newId } from "../../shared/utils/id";
import { created, ok } from "../../shared/utils/response";

import { pageQuery, adminUserInput, safeUser } from "./admin.schemas";
import { audit } from "./admin-audit.service";

const r = Router();

// ค้นหา/แบ่งหน้าผู้ใช้ตามชื่อ รหัส email role และสถานะ โดยเลือกข้อมูลที่ไม่มี passwordHash
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
// สร้างบัญชีด้วย role/status ที่ admin กำหนด hash รหัสผ่าน และบันทึก audit
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
// คืนโปรไฟล์ผู้ใช้และประวัติการจองพร้อมห้อง โดยไม่เลือก passwordHash
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
// แก้เฉพาะข้อมูลโปรไฟล์ที่ส่งมา และบันทึก snapshot เก่า/ใหม่ลง audit
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
// เปลี่ยน role พร้อม audit โดยกันการลดสิทธิ์แอดมินเมื่อเหลือ active admin ไม่เกินหนึ่งคน
r.patch("/users/:id/role", async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const role = z.nativeEnum(Role).parse(req.body.role);
    const oldValue = await prisma.user.findUnique({
      where: { id },
      select: safeUser,
    });
    if (!oldValue) throw new AppError(404, "User not found");
    // คง admin ที่ active ไว้อย่างน้อยหนึ่งคน เพื่อให้ยังมีผู้จัดการระบบได้
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
// เปลี่ยนสถานะบัญชีพร้อม audit โดยกันการปิดแอดมินเมื่อเหลือ active admin ไม่เกินหนึ่งคน
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
// ให้ ADMIN ตั้งรหัสผ่านใหม่ที่ผ่าน schema โดยเก็บเฉพาะ hash และบันทึก action ใน audit
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
// ปิดบัญชีเป็น INACTIVE แบบ soft delete พร้อม audit และตรวจเงื่อนไข active admin คนสุดท้าย
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

export default r;
