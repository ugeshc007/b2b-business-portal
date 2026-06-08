import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware";
import { createAgentInstructionTarget, createDailyTransactionTarget, createMonthlyTarget, createRandomMonthlyTarget, createTransactionTarget, deleteMonthlyTarget, runTargetWorkflow, stopTargetWorkflow, updateMonthlyTarget, vendorCreateInvoiceForTarget } from "../services/workflow";
import { getPurchaseOrderPdfForTarget } from "../services/purchaseOrderPdf";
import { runBusinessPlanAgent } from "../services/businessPlanAgent";

export const workflowRouter = Router();
workflowRouter.use(requireAuth);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hourSchema = z.string().regex(/^\d{2}:\d{2}$/);

workflowRouter.post("/targets", async (req, res, next) => {
  try {
    const input = z.object({
      buyerCompanyId: z.string(),
      sellerCompanyId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      targetDate: dateSchema.optional(),
      periodType: z.enum(["MONTHLY", "DAILY"]).optional(),
      dateFrom: dateSchema.optional(),
      dateTo: dateSchema.optional(),
      hourFrom: hourSchema.optional(),
      hourTo: hourSchema.optional(),
      direction: z.enum(["PURCHASE", "SALES"]).optional(),
      productMode: z.enum(["RANDOM", "SELECTED"]).optional(),
      amountVolume: z.number().positive().optional(),
      notes: z.string().optional(),
      lines: z.array(z.object({
        itemId: z.string(),
        quantity: z.number().int().positive(),
        maxPrice: z.number().positive().optional(),
      })).min(1),
    }).parse(req.body);
    res.status(201).json(await createMonthlyTarget(input));
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/targets/random", async (req, res, next) => {
  try {
    const input = z.object({
      buyerCompanyId: z.string(),
      sellerCompanyId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      targetDate: dateSchema.optional(),
      periodType: z.enum(["MONTHLY", "DAILY"]).optional(),
      dateFrom: dateSchema.optional(),
      dateTo: dateSchema.optional(),
      hourFrom: hourSchema.optional(),
      hourTo: hourSchema.optional(),
      direction: z.enum(["PURCHASE", "SALES"]).optional(),
      productMode: z.enum(["RANDOM", "SELECTED"]).optional(),
      amount: z.number().positive(),
      lineCount: z.number().int().positive().max(20).default(3),
      itemIds: z.array(z.string()).optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await createRandomMonthlyTarget(input));
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/targets/transaction", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string(),
      counterpartyId: z.string(),
      direction: z.enum(["PURCHASE", "SALES"]),
      periodType: z.enum(["MONTHLY", "DAILY"]),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      dateFrom: dateSchema.optional(),
      dateTo: dateSchema.optional(),
      hourFrom: hourSchema.optional(),
      hourTo: hourSchema.optional(),
      amount: z.number().positive(),
      lineCount: z.number().int().positive().max(20).default(3),
      productMode: z.enum(["RANDOM", "SELECTED"]),
      itemIds: z.array(z.string()).optional(),
      notes: z.string().optional(),
      runNow: z.boolean().optional(),
    }).parse(req.body);
    res.status(201).json(await createTransactionTarget(input));
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/targets/agent", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string().optional(),
      counterpartyId: z.string().optional(),
      direction: z.enum(["PURCHASE", "SALES"]).optional(),
      instruction: z.string().min(5).max(1000),
      autoStart: z.boolean().default(true),
      autoInvoice: z.boolean().optional(),
      poCount: z.number().int().positive().max(10).optional(),
      dateFrom: dateSchema.optional(),
      dateTo: dateSchema.optional(),
      invoiceDelayMode: z.enum(["FIXED", "RANDOM"]).optional(),
      invoiceDelayMinutes: z.number().nonnegative().max(1440).optional(),
      invoiceDelayMinMinutes: z.number().nonnegative().max(1440).optional(),
      invoiceDelayMaxMinutes: z.number().nonnegative().max(1440).optional(),
      amount: z.number().positive().optional(),
      amountMode: z.enum(["PER_PO", "TOTAL_SPLIT"]).optional(),
      lineCount: z.number().int().positive().max(20).optional(),
      productMode: z.enum(["RANDOM", "SELECTED"]).optional(),
      itemIds: z.array(z.string()).optional(),
    }).parse(req.body);
    res.status(201).json(await createAgentInstructionTarget(input));
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/business-plan-agent/run", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string(),
      planId: z.string().optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      dateFrom: dateSchema.optional(),
      dateTo: dateSchema.optional(),
      lineCount: z.number().int().positive().max(20).optional(),
    }).parse(req.body);
    res.status(201).json(await runBusinessPlanAgent(input));
  } catch (error) {
    next(error);
  }
});

workflowRouter.patch("/business-plan/:companyId/:planId", async (req, res, next) => {
  try {
    const body = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      purchaseTargetAmount: z.number().nonnegative().optional(),
      salesTargetAmount: z.number().nonnegative().optional(),
      plan: z.object({
        importedAt: z.string().optional(),
        excelMainCompanyName: z.string().optional(),
        mainCompanyId: z.string().optional(),
        purchasePlan: z.record(z.string(), z.unknown()).optional(),
        salesPlan: z.record(z.string(), z.unknown()).optional(),
        purchaseVendors: z.array(z.object({
          name: z.string().min(1),
          role: z.string().optional(),
          allocationPercent: z.number().nonnegative().optional(),
          address: z.string().optional(),
          email: z.string().optional(),
        })).optional(),
        salesCustomers: z.array(z.object({
          name: z.string().min(1),
          role: z.string().optional(),
          allocationPercent: z.number().nonnegative().optional(),
          address: z.string().optional(),
          email: z.string().optional(),
          bank: z.record(z.string(), z.unknown()).optional(),
        })).optional(),
        salesAllocations: z.array(z.object({
          name: z.string().min(1),
          role: z.string().optional(),
          allocationPercent: z.number().nonnegative().optional(),
          address: z.string().optional(),
          email: z.string().optional(),
        })).optional(),
      }),
    }).parse(req.body);

    const company = await prisma.company.findUnique({ where: { id: req.params.companyId } });
    if (!company) throw new Error("Company not found");

    const planId = decodeURIComponent(req.params.planId);
    if (!planId.startsWith(`businessPlan:${company.id}`)) throw new Error("Selected business plan does not belong to this company.");
    const existing = await prisma.appSetting.findUnique({ where: { key: planId } });
    if (!existing) throw new Error("Business plan not found for selected company. Import a business plan first.");

    const current = JSON.parse(existing.value);
    const nextPlan = {
      ...current,
      ...body.plan,
      mainCompanyId: company.id,
      modifiedAt: new Date().toISOString(),
    };

    await prisma.appSetting.update({
      where: { key: planId },
      data: { value: JSON.stringify({ ...nextPlan, planKey: planId }), isSecret: false },
    });

    const targetUpdates = [
      { type: "PURCHASE", amount: body.purchaseTargetAmount },
      { type: "SALES", amount: body.salesTargetAmount },
    ].filter((entry): entry is { type: string; amount: number } => entry.amount !== undefined);
    for (const target of targetUpdates) {
      await prisma.turnoverTarget.upsert({
        where: { companyId_type_month: { companyId: company.id, type: target.type, month: body.month } },
        update: {
          amount: new Prisma.Decimal(target.amount),
          notes: `${target.type.toLowerCase()} target modified from Workflow business plan editor.`,
        },
        create: {
          companyId: company.id,
          type: target.type,
          month: body.month,
          amount: new Prisma.Decimal(target.amount),
          notes: `${target.type.toLowerCase()} target created from Workflow business plan editor.`,
        },
      });
    }

    res.json({
      companyId: company.id,
      companyName: company.name,
      ...nextPlan,
    });
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/targets/daily", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string(),
      counterpartyId: z.string(),
      direction: z.enum(["PURCHASE", "SALES"]),
      date: dateSchema,
      amount: z.number().positive(),
      lineCount: z.number().int().positive().max(20).default(3),
      notes: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await createDailyTransactionTarget(input));
  } catch (error) {
    next(error);
  }
});

workflowRouter.patch("/targets/:id", async (req, res, next) => {
  try {
    const input = z.object({
      buyerCompanyId: z.string(),
      sellerCompanyId: z.string(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      targetDate: dateSchema.optional(),
      periodType: z.enum(["MONTHLY", "DAILY"]).optional(),
      dateFrom: dateSchema.optional(),
      dateTo: dateSchema.optional(),
      hourFrom: hourSchema.optional(),
      hourTo: hourSchema.optional(),
      direction: z.enum(["PURCHASE", "SALES"]).optional(),
      productMode: z.enum(["RANDOM", "SELECTED"]).optional(),
      amountVolume: z.number().positive().optional(),
      notes: z.string().optional(),
      lines: z.array(z.object({
        itemId: z.string(),
        quantity: z.number().int().positive(),
        maxPrice: z.number().positive().optional(),
      })).min(1),
    }).parse(req.body);
    res.json(await updateMonthlyTarget(req.params.id, input));
  } catch (error) {
    next(error);
  }
});

workflowRouter.delete("/targets/:id", async (req, res, next) => {
  try {
    res.json(await deleteMonthlyTarget(req.params.id));
  } catch (error) {
    next(error);
  }
});

workflowRouter.get("/targets/:id/po-pdf", async (req, res, next) => {
  try {
    const file = await getPurchaseOrderPdfForTarget(req.params.id);
    res.download(file.path, file.filename);
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/targets/:id/run", async (req, res, next) => {
  try {
    res.json(await runTargetWorkflow(req.params.id));
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/targets/:id/vendor-invoice", async (req, res, next) => {
  try {
    res.status(201).json(await vendorCreateInvoiceForTarget(req.params.id));
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/targets/:id/stop", async (req, res, next) => {
  try {
    res.json(await stopTargetWorkflow(req.params.id));
  } catch (error) {
    next(error);
  }
});
