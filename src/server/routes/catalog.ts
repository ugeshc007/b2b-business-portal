import express, { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { bulkUpsertStock, createCompany, createItem, deleteCompany, deleteStock, listCatalog, parsePurchaseInvoiceText, parseStockCsv, saveCompanyLogo, setStock, updateCompany } from "../services/catalog";

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

catalogRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listCatalog());
  } catch (error) {
    next(error);
  }
});

catalogRouter.post("/companies", async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().min(2),
      legalName: z.string().min(2),
      trn: z.string().optional(),
      location: z.string().min(2),
      email: z.string().email(),
      active: z.boolean().optional(),
      vatEnabled: z.boolean().optional(),
      logoPath: z.string().optional(),
      bankName: z.string().optional(),
      bankBeneficiaryName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankIban: z.string().optional(),
      bankCid: z.string().optional(),
      bankBranch: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await createCompany(input));
  } catch (error) {
    next(error);
  }
});

catalogRouter.patch("/companies/:id", async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().min(2),
      legalName: z.string().min(2),
      trn: z.string().optional().or(z.literal("")),
      location: z.string().min(2),
      email: z.string().email(),
      active: z.boolean().optional(),
      vatEnabled: z.boolean().optional(),
      logoPath: z.string().optional().or(z.literal("")),
      bankName: z.string().optional().or(z.literal("")),
      bankBeneficiaryName: z.string().optional().or(z.literal("")),
      bankAccountNumber: z.string().optional().or(z.literal("")),
      bankIban: z.string().optional().or(z.literal("")),
      bankCid: z.string().optional().or(z.literal("")),
      bankBranch: z.string().optional().or(z.literal("")),
    }).parse(req.body);
    res.json(await updateCompany(req.params.id, {
      ...input,
      trn: input.trn || undefined,
      logoPath: input.logoPath || undefined,
      bankName: input.bankName || undefined,
      bankBeneficiaryName: input.bankBeneficiaryName || undefined,
      bankAccountNumber: input.bankAccountNumber || undefined,
      bankIban: input.bankIban || undefined,
      bankCid: input.bankCid || undefined,
      bankBranch: input.bankBranch || undefined,
    }));
  } catch (error) {
    next(error);
  }
});

catalogRouter.put(
  "/companies/:id/logo",
  express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "2mb" }),
  async (req, res, next) => {
    try {
      const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim();
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      res.json(await saveCompanyLogo(req.params.id, { mimeType: contentType, buffer }));
    } catch (error) {
      next(error);
    }
  },
);

catalogRouter.delete("/companies/:id", async (req, res, next) => {
  try {
    res.json(await deleteCompany(req.params.id));
  } catch (error) {
    next(error);
  }
});

catalogRouter.post("/items", async (req, res, next) => {
  try {
    const input = z.object({
      sku: z.string().min(2),
      name: z.string().min(2),
      unit: z.string().default("pcs"),
      expectedPrice: z.number().positive(),
      minPrice: z.number().positive().optional(),
      maxPrice: z.number().positive().optional(),
      vatRate: z.number().min(0).max(1).default(0.05),
    }).parse(req.body);
    res.status(201).json(await createItem(input));
  } catch (error) {
    next(error);
  }
});

catalogRouter.post("/stock", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string(),
      itemId: z.string(),
      quantity: z.number().int().min(0),
    }).parse(req.body);
    res.status(201).json(await setStock(input.companyId, input.itemId, input.quantity));
  } catch (error) {
    next(error);
  }
});

catalogRouter.delete("/stock/:id", async (req, res, next) => {
  try {
    res.json(await deleteStock(req.params.id));
  } catch (error) {
    next(error);
  }
});

catalogRouter.post("/stock/bulk", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string(),
      mode: z.enum(["SET", "ADD"]).default("SET"),
      csvText: z.string().min(1),
    }).parse(req.body);
    res.status(201).json(await bulkUpsertStock({
      companyId: input.companyId,
      mode: input.mode,
      rows: parseStockCsv(input.csvText),
    }));
  } catch (error) {
    next(error);
  }
});

catalogRouter.post("/stock/from-purchase-invoice", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string(),
      invoiceText: z.string().min(1),
    }).parse(req.body);
    res.status(201).json(await bulkUpsertStock({
      companyId: input.companyId,
      mode: "ADD",
      rows: parsePurchaseInvoiceText(input.invoiceText),
    }));
  } catch (error) {
    next(error);
  }
});
