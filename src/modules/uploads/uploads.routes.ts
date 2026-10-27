import { Router } from "express";
import multer from "multer";
import { authenticate, requireRole } from "../../shared/middlewares/auth";
import { AppError } from "../../shared/middlewares/error";
import { imageStorage } from "./image-storage.service";
import { created, ok } from "../../shared/utils/response";

const r = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(
      null,
      ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.mimetype,
      ),
    );
  },
});

r.use(authenticate, requireRole("ADMIN"));
// รับ multipart field image สำหรับ ADMIN ขนาดไม่เกิน 5 MB แล้วส่ง buffer ไป storage และคืน key/URL
r.post("/images", upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, "Image file is required");
    created(res, await imageStorage.save(req.file), "Image uploaded");
  } catch (error) {
    next(error);
  }
});
// ให้ ADMIN ลบรูปด้วย key ผ่าน storage; การตรวจ key และข้อผิดพลาด R2 จัดการใน service
r.delete("/images/:key", async (req, res, next) => {
  try {
    await imageStorage.remove(req.params.key);
    ok(res, null, "Image deleted");
  } catch (error) {
    next(error);
  }
});
export default r;
