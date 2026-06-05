import { Router } from "express";
import { requireAuth } from "../middleware";
import { flushTransactionalData } from "../services/maintenance";

export const maintenanceRouter = Router();
maintenanceRouter.use(requireAuth);

maintenanceRouter.post("/flush-transactional-data", async (_req, res, next) => {
  try {
    res.json(await flushTransactionalData());
  } catch (error) {
    next(error);
  }
});
