import { Role } from "@prisma/client";
declare global {
  namespace Express {
    interface Request {
      user?: { id: bigint; role: Role; email: string };
    }
  }
}
export {};
