import { Router } from "express";
import { requireAuth } from "../middleware";
import { getLogStatus, getRecentLogs } from "../services/appLogger";

export const systemLogsRouter = Router();
systemLogsRouter.use(requireAuth);

systemLogsRouter.get("/", (req, res, next) => {
  try {
    const level = typeof req.query.level === "string" && req.query.level ? req.query.level.toUpperCase() : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    res.json({
      status: getLogStatus(),
      logs: getRecentLogs({ level, limit }),
    });
  } catch (error) {
    next(error);
  }
});
