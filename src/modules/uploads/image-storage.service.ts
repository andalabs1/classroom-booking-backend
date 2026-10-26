import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../../shared/config/env";
import { AppError } from "../../shared/middlewares/error";

/**
 * สัญญาของที่จัดเก็บรูป: รับไฟล์ในหน่วยความจำ คืน key/URL และลบรูปด้วย key
 */
export interface ImageStorage {
  /**
   * อัปโหลดไฟล์จาก Multer และคืน key สำหรับจัดการรูปกับ URL สำหรับแสดงผล
   */
  save(file: Express.Multer.File): Promise<{ key: string; url: string }>;
  /**
   * ลบ object ด้วย key ที่ storage คืนให้ตอนอัปโหลด
   */
  remove(key: string): Promise<void>;
}

const extensionByMime: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const contentTypeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * เลือกนามสกุลจาก MIME ที่รองรับ และโยน AppError 400 สำหรับชนิดไฟล์อื่น
 */
function resolveExtension(mimetype: string): string {
  const extension = extensionByMime[mimetype];
  if (!extension)
    throw new AppError(400, "Only JPEG, PNG, WebP and GIF images are allowed");
  return extension;
}

/**
 * ตรวจ key ให้เป็นชื่อไฟล์รูปแบบที่ระบบสร้างและไม่มี path ของโฟลเดอร์
 * โยน AppError 400 ก่อนส่งคำขอลบเมื่อ key ไม่ผ่านเงื่อนไข
 */
function assertSafeKey(key: string) {
  const safeKey = path.basename(key);
  if (safeKey !== key || !/^[0-9a-f-]+\.(jpg|png|webp|gif)$/i.test(key)) {
    throw new AppError(400, "Invalid image key");
  }
}

/**
 * เลือก R2_ENDPOINT ที่ตั้งไว้ก่อน หรือประกอบ endpoint จาก R2_ACCOUNT_ID
 * ตัด slash ท้าย URL และโยน AppError 500 หากไม่สามารถระบุ endpoint ได้
 */
function resolveR2Endpoint(): string {
  if (env.R2_ENDPOINT) return env.R2_ENDPOINT.replace(/\/$/, "");
  if (!env.R2_ACCOUNT_ID) {
    throw new AppError(
      500,
      "R2 storage is not configured (missing R2_ENDPOINT or R2_ACCOUNT_ID)",
    );
  }
  return `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

/**
 * จัดเก็บรูปถาวรบน Cloudflare R2 ผ่าน S3 SDK เพื่อรองรับ filesystem ชั่วคราวบน Vercel
 * ใช้ public base URL สำหรับลิงก์รูป และ credentials สำหรับการอัปโหลด/ลบ
 */
export class R2ImageStorage implements ImageStorage {
  private readonly client: S3Client;
  private readonly bucket = env.R2_BUCKET;
  private readonly publicBaseUrl = env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");

  /**
   * สร้าง S3 client จาก env และตรวจว่า endpoint ระบุได้
   * การสร้าง instance ยังไม่ส่งคำขอไป R2
   */
  constructor() {
    this.client = new S3Client({
      region: "auto",
      endpoint: resolveR2Endpoint(),
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      forcePathStyle: false,
    });
  }

  /**
   * อัปโหลด buffer ของไฟล์ด้วย UUID key ใหม่และ cache แบบ immutable
   * คืน key/URL หลัง R2 รับไฟล์สำเร็จ; ข้อผิดพลาด MIME หรือ SDK ส่งกลับ caller
   */
  async save(file: Express.Multer.File) {
    const extension = resolveExtension(file.mimetype);
    // ใช้ key ใหม่ทุกครั้ง จึง cache รูปแบบ immutable ได้โดยไม่ทับเนื้อหาที่ URL เดิม
    const key = randomUUID() + extension;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || contentTypeByExtension[extension],
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { key, url: `${this.publicBaseUrl}/${key}` };
  }

  /**
   * ตรวจ key แล้วส่ง DeleteObjectCommand ไปยัง bucket ที่กำหนด
   * คืน Promise<void> เมื่อ SDK สำเร็จ; ข้อผิดพลาดจาก R2 ส่งกลับ caller
   */
  async remove(key: string) {
    assertSafeKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export const imageStorage: ImageStorage = new R2ImageStorage();
