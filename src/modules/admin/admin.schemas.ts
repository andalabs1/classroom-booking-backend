import { ClassroomStatus, Role, UserStatus } from "@prisma/client";
import { z } from "zod";

export const pageQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const classroomInput = z.object({
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
export const adminUserInput = z.object({
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
export const safeUser = {
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
