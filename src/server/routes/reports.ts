import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { getAllReports } from "../services/reports";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get("/", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string().optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }).parse(req.query);
    res.json(await getAllReports(input));
  } catch (error) {
    next(error);
  }
});
