import jwt from "jsonwebtoken";
import type { AdminRole } from "@prisma/client";
import { config } from "../config";

export type JwtUser = {
  id: string;
  email: string;
  role: AdminRole;
};

export function signToken(user: JwtUser) {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "8h" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, config.jwtSecret) as JwtUser;
}
