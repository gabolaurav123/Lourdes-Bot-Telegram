import { Router } from "express";
import { asyncHandler } from "../lib/async";
import { dashboardService } from "../services/dashboard.service";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await dashboardService.stats());
  })
);
