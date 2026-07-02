import { Router } from "express";
import bcrypt from "bcryptjs";
import { adminUserSchema, loginSchema } from "@crm/shared";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/auth";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.adminUser.findUnique({ where: { email: input.email } });
    if (!user || !user.active || !(await bcrypt.compare(input.password, user.passwordHash))) {
      res.status(401).json({ error: "Credenciales invalidas" });
      return;
    }

    await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000
    });
    await auditLog(req, "ADMIN_LOGIN", { actor: { id: user.id, email: user.email, role: user.role } });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  })
);

authRouter.post(
  "/users",
  requireAuth,
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = adminUserSchema.parse(req.body);
    const created = await prisma.adminUser.create({
      data: {
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role
      },
      select: { id: true, email: true, role: true, active: true, createdAt: true }
    });
    await auditLog(req, "ADMIN_USER_CREATED", { entityType: "AdminUser", entityId: created.id });
    res.status(201).json(created);
  })
);

authRouter.post("/logout", requireAuth, (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});
