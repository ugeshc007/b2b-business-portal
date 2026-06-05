import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { flushCategories, flushTransactionalData } from "../services/maintenance";

export const maintenanceRouter = Router();
maintenanceRouter.use(requireAuth);

const flushSchema = z.object({
  categories: z.array(z.enum(flushCategories)).optional(),
});

maintenanceRouter.post("/flush-transactional-data", async (req, res, next) => {
  try {
    res.json(await flushTransactionalData(flushSchema.parse(req.body ?? {})));
  } catch (error) {
    next(error);
  }
});
