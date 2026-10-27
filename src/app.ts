import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import auth from "./modules/auth/auth.routes";
import classrooms from "./modules/classrooms/classrooms.routes";
import bookings from "./modules/bookings/bookings.routes";
import users from "./modules/users/users.routes";
import admin from "./modules/admin/admin.routes";
import notifications from "./modules/notifications/notifications.routes";
import uploads from "./modules/uploads/uploads.routes";
import config from "./modules/config/config.routes";
import { notFound, errorHandler } from "./shared/middlewares/error";
import { swaggerDocument } from "./shared/config/swagger";
// การเริ่ม server และ worker อยู่ใน server.ts เพื่อให้ import app มาทดสอบได้โดยไม่เริ่มงานเบื้องหลัง
export const app = express();
// ส่งข้อมูล API gateway และลิงก์ endpoint หลักให้ตรวจว่ากำลังเรียก service ใด
app.get("/", (_req, res) =>
  res.json({
    success: true,
    message: "Classroom Reservation API Gateway",
    data: {
      service: "classroom-reservation-api",
      status: "online",
      endpoints: {
        health: "/health",
        documentation: "/docs",
        openApiDocumentation: "/api-docs",
        api: "/api",
      },
    },
  }),
);
// ตอบสถานะการทำงานของ HTTP app โดยไม่ได้ query ฐานข้อมูลหรือ storage
app.get("/health", (_req, res) =>
  res.json({
    success: true,
    message: "Healthy",
    data: { service: "classroom-reservation-api" },
  }),
);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
app.use("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use("/api/auth", auth);
app.use("/api/classrooms", classrooms);
app.use("/api/bookings", bookings);
app.use("/api/users", users);
app.use("/api/notifications", notifications);
app.use("/api/config", config);
app.use("/api/admin/uploads", uploads);
app.use("/api/admin", admin);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use(notFound);
app.use(errorHandler);

// Vercel loads this file as the serverless Express entry point.
export default app;
