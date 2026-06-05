import express, { Router } from "express";
import { requireAuth } from "../middleware";
import { importBusinessPlanProducts, importBusinessPlanScenario, parseBusinessPlanWorkbook } from "../services/businessPlanImport";

export const businessPlanImportRouter = Router();
businessPlanImportRouter.use(requireAuth);

businessPlanImportRouter.post(
  "/preview",
  express.raw({
    type: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ],
    limit: "10mb",
  }),
  async (req, res, next) => {
    try {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      if (!buffer.length) throw new Error("Excel file is required");
      res.json(parseBusinessPlanWorkbook(buffer));
    } catch (error) {
      next(error);
    }
  },
);

businessPlanImportRouter.post(
  "/import-products",
  express.raw({
    type: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ],
    limit: "10mb",
  }),
  async (req, res, next) => {
    try {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      if (!buffer.length) throw new Error("Excel file is required");
      res.json(await importBusinessPlanProducts(buffer));
    } catch (error) {
      next(error);
    }
  },
);

businessPlanImportRouter.post(
  "/import-scenario",
  express.raw({
    type: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ],
    limit: "10mb",
  }),
  async (req, res, next) => {
    try {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      if (!buffer.length) throw new Error("Excel file is required");
      const companyId = typeof req.query.companyId === "string" && req.query.companyId.trim()
        ? req.query.companyId.trim()
        : undefined;
      res.json(await importBusinessPlanScenario(buffer, { companyId }));
    } catch (error) {
      next(error);
    }
  },
);
