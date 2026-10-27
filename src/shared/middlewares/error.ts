import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
/**
 * ข้อผิดพลาดของแอปที่ระบุ HTTP status และรายการ errors เพิ่มเติมได้
 * errorHandler ใช้ข้อมูลนี้สร้าง response มาตรฐาน
 */
export class AppError extends Error {
  /**
   * เก็บ status/message/errors ของเหตุการณ์ที่ caller ต้องการส่งผ่าน error middleware
   */
  constructor(
    public status: number,
    message: string,
    public errors?: unknown[],
  ) {
    super(message);
  }
}
/**
 * ส่ง AppError 404 ให้ errorHandler เมื่อไม่มี route รองรับคำขอ; mount หลัง router ทั้งหมด
 */
export const notFound = (_req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(404, "Route not found"));
/**
 * แปลง Zod/Multer errors เป็น 400 และข้อผิดพลาดทั่วไปตาม status หรือ 500
 * คงพารามิเตอร์ทั้งสี่ตัวไว้เพื่อให้ Express รู้จักว่าเป็น error middleware
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must not exceed 5 MB"
          : err.message,
    });
  }
  const e = err as { status?: number; message?: string; errors?: unknown[] };
  res.status(e.status ?? 500).json({
    success: false,
    message: e.message ?? "Internal server error",
    ...(e.errors ? { errors: e.errors } : {}),
  });
};
