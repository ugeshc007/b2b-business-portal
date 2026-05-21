import { Router } from "express";
import { requireAuth } from "../middleware";
import { getInvoice, listInvoices, sendInvoiceEmail } from "../services/invoices";
import { generateInvoicePdf, getInvoicePdfFile } from "../services/invoicePdf";

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);

invoiceRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listInvoices());
  } catch (error) {
    next(error);
  }
});

invoiceRouter.get("/:id", async (req, res, next) => {
  try {
    res.json(await getInvoice(req.params.id));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post("/:id/pdf", async (req, res, next) => {
  try {
    res.status(201).json(await generateInvoicePdf(req.params.id));
  } catch (error) {
    next(error);
  }
});

invoiceRouter.get("/:id/pdf", async (req, res, next) => {
  try {
    const file = await getInvoicePdfFile(req.params.id);
    res.download(file.path, file.filename);
  } catch (error) {
    next(error);
  }
});

invoiceRouter.post("/:id/send", async (req, res, next) => {
  try {
    res.status(201).json(await sendInvoiceEmail(req.params.id));
  } catch (error) {
    next(error);
  }
});
