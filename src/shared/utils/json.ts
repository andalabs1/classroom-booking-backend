/**
 * สร้างข้อมูลที่ serialize เป็น JSON ได้ โดยแปลง BigInt เป็น string และ Date เป็น ISO string
 * ใช้กับ API response และ audit snapshot เพื่อรักษาความแม่นยำของ ID ขนาดใหญ่
 */
export const jsonSafe = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
