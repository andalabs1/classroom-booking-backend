import { prisma } from "../../shared/database/prisma";
import { newId } from "../../shared/utils/id";

type NotificationInput = {
  userId: bigint;
  bookingId?: bigint;
  title: string;
  message: string;
  type: string;
  dedupeKey?: string;
};

/**
 * สร้างแจ้งเตือน in-app พร้อม ID ใหม่และข้อมูลผู้รับ/booking/dedupeKey ที่ caller ระบุ
 * คืน Promise ของ notification; unique conflict และข้อผิดพลาดฐานข้อมูลส่งให้ caller จัดการ
 */
export const createNotification = (input: NotificationInput) =>
  prisma.notification.create({ data: { id: newId(), ...input } });

/**
 * ค้นหา ADMIN ที่ ACTIVE แล้วสร้างแจ้งเตือนให้ทุกคนแบบขนาน
 * Promise สำเร็จเมื่อบันทึกครบ; หากบางรายการล้มเหลว รายการอื่นอาจถูกบันทึกไปแล้ว
 */
export async function notifyActiveAdmins(
  input: Omit<NotificationInput, "userId">,
) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
  await Promise.all(
    admins.map((admin) => createNotification({ ...input, userId: admin.id })),
  );
}

/**
 * แจ้งเจ้าของด้วย BOOKING_CREATED และ admin ที่ active ด้วย BOOKING_PENDING
 * ใช้หลังสร้าง booking เพื่อให้เจ้าของทราบว่ารออนุมัติ และให้ admin เข้าตรวจคำขอ
 */
export async function notifyBookingCreated(booking: {
  id: bigint;
  userId: bigint;
  bookingCode: string;
}) {
  await Promise.all([
    createNotification({
      userId: booking.userId,
      bookingId: booking.id,
      title: "ส่งคำขอจองสำเร็จ",
      message: "Booking " + booking.bookingCode + " กำลังรอการอนุมัติ",
      type: "BOOKING_CREATED",
    }),
    notifyActiveAdmins({
      bookingId: booking.id,
      title: "มีรายการรออนุมัติ",
      message: "Booking " + booking.bookingCode + " รอการตรวจสอบ",
      type: "BOOKING_PENDING",
    }),
  ]);
}

/**
 * สร้าง BOOKING_UPDATED ให้เจ้าของและ admin ที่ active หลังแก้ไข booking
 * service นี้บันทึกเฉพาะ notification โดย caller เป็นผู้จัดการข้อมูลและสถานะการจอง
 */
export async function notifyBookingUpdated(booking: {
  id: bigint;
  userId: bigint;
  bookingCode: string;
}) {
  await Promise.all([
    createNotification({
      userId: booking.userId,
      bookingId: booking.id,
      title: "แก้ไขการจองสำเร็จ",
      message: "Booking " + booking.bookingCode + " ถูกแก้ไขและรอการอนุมัติ",
      type: "BOOKING_UPDATED",
    }),
    notifyActiveAdmins({
      bookingId: booking.id,
      title: "รายการจองถูกแก้ไข",
      message: "Booking " + booking.bookingCode + " ต้องตรวจสอบอีกครั้ง",
      type: "BOOKING_UPDATED",
    }),
  ]);
}

/**
 * สร้าง BOOKING_CANCELLED ให้เจ้าของและ admin ที่ active หลังยกเลิกการจอง
 */
export async function notifyBookingCancelled(booking: {
  id: bigint;
  userId: bigint;
  bookingCode: string;
}) {
  await Promise.all([
    createNotification({
      userId: booking.userId,
      bookingId: booking.id,
      title: "ยกเลิกการจองแล้ว",
      message: "Booking " + booking.bookingCode + " ถูกยกเลิกเรียบร้อยแล้ว",
      type: "BOOKING_CANCELLED",
    }),
    notifyActiveAdmins({
      bookingId: booking.id,
      title: "ผู้ใช้ยกเลิกการจอง",
      message: "Booking " + booking.bookingCode + " ถูกยกเลิก",
      type: "BOOKING_CANCELLED",
    }),
  ]);
}

/**
 * สร้าง BOOKING_IN_USE ให้เจ้าของและ admin ที่ active หลัง check-in สำเร็จ
 */
export async function notifyBookingCheckedIn(booking: {
  id: bigint;
  userId: bigint;
  bookingCode: string;
}) {
  await Promise.all([
    createNotification({
      userId: booking.userId,
      bookingId: booking.id,
      title: "เริ่มใช้งานห้อง",
      message: "Booking " + booking.bookingCode + " check-in สำเร็จ",
      type: "BOOKING_IN_USE",
    }),
    notifyActiveAdmins({
      bookingId: booking.id,
      title: "ผู้ใช้ check-in แล้ว",
      message: "Booking " + booking.bookingCode + " เริ่มใช้งานห้องแล้ว",
      type: "BOOKING_IN_USE",
    }),
  ]);
}
