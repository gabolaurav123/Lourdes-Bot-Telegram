import type { NextFunction, Request, Response } from "express";
import type { AdminRole } from "@prisma/client";
import type { JwtUser } from "../lib/auth";

export function requireRole(...roles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: JwtUser }).user;
    if (user && (user.role === "OWNER" || roles.includes(user.role))) {
      next();
      return;
    }

    res.status(403).json({ error: "Permiso insuficiente" });
  };
}
