import jwt from "jsonwebtoken";
import { vi } from "vitest";
import type { Role } from "@prisma/client";
import { env } from "../../src/shared/config/env";
import { prisma } from "../../src/shared/database/prisma";

/**
 * สร้าง fixture ผู้ใช้ ACTIVE ตาม role ที่ระบุสำหรับใช้จำลองผล query ในเทสต์
 */
export const activeUser = (role: Role = "STUDENT") => ({
  id: 10n,
  role,
  email: "user@test.local",
  name: "Test User",
  status: "ACTIVE" as const,
  tokenVersion: 0,
});
/**
 * สร้าง JWT สำหรับเทสต์ด้วย ID/tokenVersion ที่กำหนดและ secret จาก test environment
 */
export const token = (id = "10", tokenVersion = 0) =>
  jwt.sign({ id, tokenVersion }, env.JWT_SECRET);
/**
 * จำลอง user.findUnique ให้คืนบัญชี ACTIVE และคืนค่า Bearer header ตาม role
 * การ stub นี้มีผลกับทุก user.findUnique ในเทสต์; กรณีอ่านหลายบัญชีให้กำหนดผลแต่ละครั้งเพิ่ม
 */
export function authenticateAs(role: Role = "STUDENT") {
  vi.spyOn(prisma.user, "findUnique").mockResolvedValue(
    activeUser(role) as never,
  );
  return `Bearer ${token()}`;
}
/**
 * จำลอง $transaction ให้เรียก callback ด้วย Prisma mock ตัวเดียวกัน
 * ใช้ตรวจ handler และ side effects เท่านั้น; ไม่มี rollback, locking หรือ isolation ของฐานข้อมูลจริง
 */
export function mockTransaction() {
  return vi
    .spyOn(prisma, "$transaction")
    .mockImplementation((async (callback: (client: typeof prisma) => unknown) =>
      callback(prisma)) as never);
}
