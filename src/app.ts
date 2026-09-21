import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import auth from "./modules/auth/routes";
import classrooms from "./modules/classrooms/routes";
import bookings from "./modules/bookings/routes";
import users from "./modules/users/routes";
import admin from "./modules/admin/routes";
import notifications from "./modules/notifications/routes";
import uploads from "./modules/uploads/routes";
import config from "./modules/config/routes";
import { notFound, errorHandler } from "./middlewares/error";
import { swaggerDocument } from "./config/swagger";
export const app = express();
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
app.use(
  "/assets",
  express.static("public/assets", { maxAge: "1d", immutable: false }),
);
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
