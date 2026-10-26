import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../shared/database/prisma";
import { jsonSafe } from "../../shared/utils/json";
import { newId } from "../../shared/utils/id";
import { env } from "../../shared/config/env";
import { AppError } from "../../shared/middlewares/error";
import { authenticate } from "../../shared/middlewares/auth";
import { created, ok } from "../../shared/utils/response";

const r = Router();
const registration = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    userCode: z.string().trim().min(3).max(50).optional(),
    phone: z
      .string()
      .regex(/^0[0-9]{8,9}$/)
      .optional(),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(["USER", "STUDENT", "TEACHER"]).default("STUDENT"),
  })
  .refine((value) => value.name || (value.firstName && value.lastName), {
    message: "Name or firstName and lastName are required",
  });
const login = z
  .object({
    username: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1),
  })
  .refine((value) => value.username || value.email, {
    message: "Username or email is required",
  });
const publicUser = {
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
} as const;

// สมัคร USER/STUDENT/TEACHER ด้วยรหัสผ่านที่ hash แล้ว; คืนข้อมูลผู้ใช้ที่เลือกไว้โดยไม่มี passwordHash
r.post("/register", async (req, res, next) => {
  try {
    const { password, ...profile } = registration.parse(req.body);
    const name =
      profile.name ??
      `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim();
    const user = await prisma.user.create({
      data: {
        id: newId(),
        ...profile,
        name,
        passwordHash: await bcrypt.hash(password, 12),
      },
      select: publicUser,
    });
    created(res, jsonSafe(user), "Registered");
  } catch (error) {
    const message = String((error as Error).message);
    next(
      message.includes("Unique constraint")
        ? new AppError(409, "Email or user code already exists")
        : error,
    );
  }
});

// ตรวจ email หรือ user code และรหัสผ่านของบัญชี ACTIVE ก่อนคืน JWT พร้อมข้อมูลผู้ใช้
r.post("/login", async (req, res, next) => {
  try {
    const input = login.parse(req.body);
    const identifier = input.username ?? input.email!;
    const user = identifier.includes("@")
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findFirst({ where: { userCode: identifier } });
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    )
      throw new AppError(401, "Invalid username, email, or password");
    const token = jwt.sign(
      {
        id: user.id.toString(),
        role: user.role,
        email: user.email,
        tokenVersion: user.tokenVersion,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
    );
    const { passwordHash: _passwordHash, ...safe } = user;
    void _passwordHash;
    ok(res, { token, user: jsonSafe(safe) }, "Logged in");
  } catch (error) {
    next(error);
  }
});

// เพิกถอน JWT เดิมทุก session ของผู้ใช้ด้วยการเพิ่ม tokenVersion
r.post("/logout", authenticate, async (req, res, next) => {
  try {
    // เพิ่ม version เพื่อยกเลิก token เดิมทุก session ของผู้ใช้ ไม่ใช่เพียง token ที่ส่งมา logout
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { tokenVersion: { increment: 1 } },
    });
    ok(res, null, "Logged out");
  } catch (error) {
    next(error);
  }
});

// คืนข้อมูลบัญชีที่ผ่าน authenticate โดยเลือกเฉพาะฟิลด์โปรไฟล์ที่เปิดเผยได้
r.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: publicUser,
    });
    ok(res, jsonSafe(user));
  } catch (error) {
    next(error);
  }
});

export default r;
