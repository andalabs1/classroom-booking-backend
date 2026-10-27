import { Response } from "express";
/**
 * ส่ง JSON รูปแบบ success/message/data และเพิ่ม meta เมื่อส่งมา
 * ใช้ HTTP status ที่ response ตั้งไว้ โดยปกติคือ 200; caller ต้องแปลง BigInt ก่อน
 */
export const ok = (
  res: Response,
  data: unknown,
  message = "Success",
  meta?: unknown,
) => res.json({ success: true, message, data, ...(meta ? { meta } : {}) });
/**
 * ส่ง HTTP 201 พร้อม JSON รูปแบบ success/message/data หลังสร้างรายการสำเร็จ
 * caller ต้องแปลงข้อมูลที่มี BigInt ก่อนส่งเข้าฟังก์ชัน
 */
export const created = (res: Response, data: unknown, message = "Created") =>
  res.status(201).json({ success: true, message, data });
