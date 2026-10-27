import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "./error";
import { prisma } from "../database/prisma";

/**
 * ตรวจ Bearer JWT และผู้ใช้ในฐานข้อมูล ก่อนแนบ id/role/email ลง req.user
 * ส่งข้อผิดพลาด 401 ผ่าน next เมื่อ token ใช้ไม่ได้ ผู้ใช้ไม่ active หรือ tokenVersion ไม่ตรง
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new AppError(401, "Unauthorized");
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as {
      id: string;
      tokenVersion?: number;
    };
    // อ่านสิทธิ์และสถานะล่าสุดจากฐานข้อมูล เพื่อให้การเปลี่ยน role/ปิดบัญชีมีผลกับ token ที่ออกไปแล้ว
    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.id) },
      select: {
        id: true,
        role: true,
        email: true,
        status: true,
        tokenVersion: true,
      },
    });
    // tokenVersion เปลี่ยนเมื่อ logout; token รุ่นเดิมที่ไม่มีฟิลด์นี้ถือเป็น version 0
    if (
      !user ||
      user.status !== "ACTIVE" ||
      (user.tokenVersion ?? 0) !== (payload.tokenVersion ?? 0)
    )
      throw new AppError(401, "User is inactive or no longer exists");
    req.user = { id: user.id, role: user.role, email: user.email };
    next();
  } catch (error) {
    next(
      error instanceof AppError ? error : new AppError(401, "Invalid token"),
    );
  }
};

/**
 * สร้าง middleware ที่อนุญาต role เดียว โดยใช้ req.user จาก authenticate
 */
export const requireRole = (role: Role) => requireAnyRole(role);
/**
 * สร้าง middleware ที่อนุญาตอย่างน้อยหนึ่ง role ในรายการ; ส่ง 403 เมื่อไม่ผ่าน
 * ต้องวางหลัง authenticate เพื่อให้มีข้อมูลผู้ใช้สำหรับตรวจสิทธิ์
 */
export const requireAnyRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : next(new AppError(403, "Forbidden"));
