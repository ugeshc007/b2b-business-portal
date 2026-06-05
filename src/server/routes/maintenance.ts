import { Router } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth, requireFinanceOrAdmin } from "../middleware";
import { createDatabaseBackup, flushCategories, flushTransactionalData, listDatabaseBackups, restoreDatabaseBackup } from "../services/maintenance";

export const maintenanceRouter = Router();
maintenanceRouter.use(requireAuth);

const flushSchema = z.object({
  categories: z.array(z.enum(flushCategories)).optional(),
});

maintenanceRouter.post("/flush-transactional-data", requireAdmin, async (req, res, next) => {
  try {
    res.json(await flushTransactionalData(flushSchema.parse(req.body ?? {})));
  } catch (error) {
    next(error);
  }
});

maintenanceRouter.get("/backups", requireFinanceOrAdmin, async (_req, res, next) => {
  try {
    res.json(await listDatabaseBackups());
  } catch (error) {
    next(error);
  }
});

maintenanceRouter.post("/backups", requireFinanceOrAdmin, async (_req, res, next) => {
  try {
    res.status(201).json(await createDatabaseBackup());
  } catch (error) {
    next(error);
  }
});

maintenanceRouter.post("/restore", requireAdmin, async (req, res, next) => {
  try {
    const input = z.object({
      fileName: z.string().min(5),
      typedConfirmation: z.string(),
    }).parse(req.body);
    res.json(await restoreDatabaseBackup(input));
  } catch (error) {
    next(error);
  }
});
