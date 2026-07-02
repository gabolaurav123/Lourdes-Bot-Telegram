import type { NextFunction, Request, Response } from "express";
import { verifyToken, type JwtUser } from "../lib/auth";

export type AuthenticatedRequest = Request & { user: JwtUser };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.token;

  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  try {
    (req as Request & { user: JwtUser }).user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Sesion invalida" });
  }
}
