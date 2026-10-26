/**
 * สร้าง BigInt ID จาก timestamp ระดับมิลลิวินาทีและเลขสุ่ม 0–999
 * คืนค่าเพื่อใช้เป็น primary key ที่แอปกำหนดเอง; unique constraint เป็นตัวตรวจ ID ซ้ำ
 */
export const newId = (): bigint =>
  BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
