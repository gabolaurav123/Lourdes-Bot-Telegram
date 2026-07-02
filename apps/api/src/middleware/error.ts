import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validacion fallida", details: error.flatten() });
    return;
  }

  const status = typeof error.status === "number" ? error.status : 500;
  res.status(status).json({
    error: error.message ?? "Error interno"
  });
};
