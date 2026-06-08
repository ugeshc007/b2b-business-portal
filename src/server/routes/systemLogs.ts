import { Router } from "express";
import { requireAuth, requireFinanceOrAdmin } from "../middleware";
import { getLogDownload, getLogStatus, getRecentLogs, getRecentRawLogs } from "../services/appLogger";

export const systemLogsRouter = Router();
systemLogsRouter.use(requireAuth);

systemLogsRouter.get("/", (req, res, next) => {
  try {
    const level = typeof req.query.level === "string" && req.query.level ? req.query.level.toUpperCase() : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    res.json({
      status: getLogStatus(),
      logs: getRecentLogs({ level, limit }),
      rawLogs: getRecentRawLogs({ limit }),
    });
  } catch (error) {
    next(error);
  }
});

systemLogsRouter.get("/download", requireFinanceOrAdmin, (_req, res, next) => {
  try {
    const file = getLogDownload();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.send(file.body);
  } catch (error) {
    next(error);
  }
});
