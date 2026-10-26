import { Router } from "express";
import { env } from "../../shared/config/env";
import { authenticate } from "../../shared/middlewares/auth";
import { ok } from "../../shared/utils/response";

const router = Router();
router.use(authenticate);

// คืนกติกาจาก env และรายการ role/status ให้ frontend ใช้แสดงผลและตรวจฟอร์มของผู้ใช้ที่เข้าสู่ระบบ
router.get("/business-rules", (_req, res) => {
  ok(res, {
    bookingCancelMinutes: env.BOOKING_CANCEL_MINUTES,
    bookingMaxDurationHours: env.BOOKING_MAX_DURATION_HOURS,
    bookingMaxAdvanceDays: env.BOOKING_MAX_ADVANCE_DAYS,
    bookingOpenTime: env.BOOKING_OPEN_TIME,
    bookingCloseTime: env.BOOKING_CLOSE_TIME,
    bookingCheckinEarlyMinutes: env.BOOKING_CHECKIN_EARLY_MINUTES,
    bookingCheckinLateMinutes: env.BOOKING_CHECKIN_LATE_MINUTES,
    bookingReminderMinutes: env.BOOKING_REMINDER_MINUTES,
    roles: ["USER", "STUDENT", "TEACHER", "ADMIN"],
    bookingStatuses: [
      "PENDING",
      "CONFIRMED",
      "IN_USE",
      "COMPLETED",
      "REJECTED",
      "CANCELLED",
      "NO_SHOW",
    ],
  });
});

export default router;
