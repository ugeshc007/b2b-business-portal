import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { appDate, appMonthEnd, appMonthStart } from "../../shared/timezone";
import { createMonthlyTarget, logAgentAudit, runTargetWorkflow, scheduleVendorInvoiceForTarget, vendorCreateInvoiceForTarget } from "./workflow";
import { itemBuyingPrice, itemSellingPrice } from "./stockLedger";
import { logSystemEvent } from "./appLogger";

type PlanPartner = {
  name: string;
  allocationPercent?: number;
};

type PlanRule = {
  invoiceRuleText?: string;
  invoiceCountMin?: number;
  invoiceCountMax?: number;
};

type SavedBusinessPlan = {
  mainCompanyId: string;
  purchaseVendors?: PlanPartner[];
  salesCustomers?: PlanPartner[];
  salesAllocations?: PlanPartner[];
  purchasePlan?: PlanRule;
  salesPlan?: PlanRule;
};

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function parseAmountText(value?: string) {
  if (!value) return undefined;
  const match = value.match(/(?:below|under|less\s+than|limit|max(?:imum)?)\s*(?:aed\s*)?([0-9][0-9,]*(?:\.\d+)?)\s*(k|m|million|thousand)?/i);
  if (!match) return undefined;
  const base = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(base) || base <= 0) return undefined;
  const suffix = match[2]?.toLowerCase();
  if (suffix === "m" || suffix === "million") return base * 1_000_000;
  if (suffix === "k" || suffix === "thousand") return base * 1_000;
  return base;
}

function invoicePlan(rule?: PlanRule, amount = 0, defaultLimit = 10000) {
  const valueLimit = parseAmountText(rule?.invoiceRuleText) ?? defaultLimit;
  const neededForLimit = Math.max(1, Math.ceil(amount / valueLimit));
  const minCount = Math.max(1, Math.floor(rule?.invoiceCountMin ?? 1));
  const maxCount = Math.max(minCount, Math.floor(rule?.invoiceCountMax ?? neededForLimit));
  return {
    valueLimit,
    count: Math.max(minCount, Math.min(maxCount, neededForLimit)),
  };
}

function allocationRows(partners: PlanPartner[] | undefined, amount: number) {
  const cleaned = (partners ?? []).filter((partner) => partner.name?.trim());
  if (!cleaned.length || amount <= 0) return [];
  const explicitTotal = cleaned.reduce((sum, partner) => sum + (partner.allocationPercent ?? 0), 0);
  const fallbackPercent = explicitTotal > 0 ? 0 : 100 / cleaned.length;
  return cleaned.map((partner) => {
    const percent = partner.allocationPercent ?? fallbackPercent;
    return { partner, percent, amount: amount * (percent / (explicitTotal || 100)) };
  }).filter((row) => row.amount > 0);
}

function scheduleDates(month: string, count: number, dateFrom?: string, dateTo?: string) {
  const start = parseDateParts(dateFrom || appMonthStart(month));
  const end = parseDateParts(dateTo || appMonthEnd(month));
  const spanDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  return Array.from({ length: count }, (_, index) => {
    const dayOffset = count <= 1 ? 0 : Math.round((spanDays * index) / Math.max(count - 1, 1));
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + dayOffset);
    return formatDateParts(date);
  });
}

function parseDateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateParts(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function appTimeMinutes(value: Date | string | number = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function timeMinutes(value?: string | null) {
  const match = String(value || "00:00").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isScheduledTargetDue(targetDate?: string | null, hourFrom?: string | null, now = new Date()) {
  const date = targetDate || appDate(now);
  const today = appDate(now);
  if (date < today) return true;
  if (date > today) return false;
  return timeMinutes(hourFrom) <= appTimeMinutes(now);
}

function isAutomaticScheduledTarget(notes?: string | null) {
  return /business plan|ai scheduled/i.test(notes || "");
}

async function findPartnerCompany(mainCompanyId: string, partnerName: string) {
  const normalized = partnerName.trim().toLowerCase();
  return prisma.company.findFirst({
    where: {
      OR: [
        { managedByCompanyId: mainCompanyId, name: { contains: partnerName } },
        { managedByCompanyId: mainCompanyId, legalName: { contains: partnerName } },
        { name: { contains: partnerName } },
        { legalName: { contains: partnerName } },
      ],
    },
  }).then(async (candidate) => {
    if (candidate) return candidate;
    const companies = await prisma.company.findMany();
    return companies.find((company) =>
      company.name.toLowerCase() === normalized || company.legalName.toLowerCase() === normalized
    ) ?? null;
  });
}

async function ensureSupplierStock(companyId: string, targetAmount: number) {
  const existing = await prisma.stock.count({ where: { companyId, quantity: { gt: 0 } } });
  if (existing > 0) return;
  const items = await prisma.item.findMany({ where: { active: true }, orderBy: { sku: "asc" } });
  if (!items.length) throw new Error("Product master is empty. Import products before running business plan agent.");
  const amountPerItem = targetAmount / items.length;
  await prisma.$transaction(items.map((item) => {
    const unitCost = Math.max(Number(itemBuyingPrice(item)), 0.01);
    const quantity = Math.max(1, Math.ceil(amountPerItem / unitCost));
    return prisma.stock.upsert({
      where: { companyId_itemId: { companyId, itemId: item.id } },
      update: { quantity: { increment: quantity } },
      create: { companyId, itemId: item.id, quantity },
    });
  }));
}

async function createAllocatedTarget(input: {
  buyerCompanyId: string;
  sellerCompanyId: string;
  month: string;
  targetDate: string;
  direction: "PURCHASE" | "SALES";
  amount: number;
  lineCount?: number;
  notes: string;
}) {
  const items = await prisma.item.findMany({
    where: { active: true },
    orderBy: { sku: "asc" },
  });
  if (!items.length) throw new Error("Product master is empty. Import products before running business plan agent.");
  const decidedLineCount = input.lineCount ?? decideProductLineCount(input.amount, items.length);
  const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, Math.min(decidedLineCount, items.length));
  const amountPerLine = input.amount / shuffled.length;
  const lines = shuffled.map((item) => {
    const unitPrice = input.direction === "PURCHASE" ? itemBuyingPrice(item) : itemSellingPrice(item);
    const quantity = Math.max(1, Math.round(amountPerLine / Math.max(Number(unitPrice), 0.01)));
    return {
      itemId: item.id,
      quantity,
      maxPrice: Number(unitPrice),
    };
  });
  for (const line of lines) {
    const sellerStock = await prisma.stock.findUnique({
      where: { companyId_itemId: { companyId: input.sellerCompanyId, itemId: line.itemId } },
    });
    const missingQuantity = Math.max(0, line.quantity - (sellerStock?.quantity ?? 0));
    if (!missingQuantity) continue;
    await prisma.stock.upsert({
      where: { companyId_itemId: { companyId: input.sellerCompanyId, itemId: line.itemId } },
      update: { quantity: { increment: missingQuantity } },
      create: { companyId: input.sellerCompanyId, itemId: line.itemId, quantity: missingQuantity },
    });
    await logAgentAudit({
      step: "BUSINESS_PLAN_STOCK_PREPARED",
      message: "Business plan agent prepared product quantity from product master.",
      metadata: {
        sellerCompanyId: input.sellerCompanyId,
        itemId: line.itemId,
        missingQuantity,
        direction: input.direction,
      },
    });
  }

  return createMonthlyTarget({
    buyerCompanyId: input.buyerCompanyId,
    sellerCompanyId: input.sellerCompanyId,
    month: input.month,
    targetDate: input.targetDate,
    periodType: "DAILY",
    dateFrom: input.targetDate,
    dateTo: input.targetDate,
    hourFrom: "09:00",
    hourTo: "18:00",
    direction: input.direction,
    productMode: "RANDOM",
    amountVolume: input.amount,
    notes: input.notes,
    lines,
  });
}

function decideProductLineCount(amount: number, activeProductCount: number) {
  if (activeProductCount <= 1) return 1;
  if (amount >= 100_000) return Math.min(8, activeProductCount);
  if (amount >= 50_000) return Math.min(6, activeProductCount);
  if (amount >= 10_000) return Math.min(4, activeProductCount);
  return Math.min(3, activeProductCount);
}

async function runAndInvoiceTarget(targetId: string) {
  const workflow = await runTargetWorkflow(targetId);
  const vendorInvoice = await vendorCreateInvoiceForTarget(targetId);
  return { workflow, vendorInvoice };
}

async function sendDueScheduledTarget(targetId: string) {
  const workflow = await runTargetWorkflow(targetId);
  scheduleVendorInvoiceForTarget(targetId);
  return workflow;
}

export async function processDueScheduledTargets() {
  const today = appDate();
  const targets = await prisma.monthlyTarget.findMany({
    where: {
      status: "OPEN",
      periodType: "DAILY",
      OR: [
        { targetDate: { lte: today } },
        { dateFrom: { lte: today } },
      ],
    },
    include: { requirements: true },
    orderBy: [{ targetDate: "asc" }, { dateFrom: "asc" }, { createdAt: "asc" }],
    take: 25,
  });
  let sent = 0;
  let skipped = 0;
  for (const target of targets) {
    const targetDate = target.targetDate || target.dateFrom;
    if (target.requirements.length || !isAutomaticScheduledTarget(target.notes) || !isScheduledTargetDue(targetDate, target.hourFrom)) {
      skipped += 1;
      continue;
    }
    try {
      await sendDueScheduledTarget(target.id);
      sent += 1;
      await logAgentAudit({
        targetId: target.id,
        step: "SCHEDULED_PO_SENT",
        message: `Scheduled PO sent for ${targetDate || today} ${target.hourFrom || ""}.`,
        metadata: { targetDate, hourFrom: target.hourFrom },
      });
    } catch (error) {
      await logAgentAudit({
        targetId: target.id,
        step: "SCHEDULED_PO_FAILED",
        status: "ERROR",
        message: error instanceof Error ? error.message : "Scheduled PO send failed",
      });
    }
  }
  return { checked: targets.length, sent, skipped };
}

export async function runBusinessPlanAgent(input: {
  companyId: string;
  planId?: string;
  month: string;
  dateFrom?: string;
  dateTo?: string;
  lineCount?: number;
}) {
  const planKey = input.planId || `businessPlan:${input.companyId}`;
  if (!planKey.startsWith(`businessPlan:${input.companyId}`)) throw new Error("Selected business plan does not belong to this company.");
  const setting = await prisma.appSetting.findUnique({ where: { key: planKey } });
  if (!setting) throw new Error("Business plan rules not found for selected company. Import the business plan first.");
  const plan = JSON.parse(setting.value) as SavedBusinessPlan;
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company || company.active === false) throw new Error("Active company not found");

  const [purchaseTarget, salesTarget] = await Promise.all([
    prisma.turnoverTarget.findUnique({ where: { companyId_type_month: { companyId: input.companyId, type: "PURCHASE", month: input.month } } }),
    prisma.turnoverTarget.findUnique({ where: { companyId_type_month: { companyId: input.companyId, type: "SALES", month: input.month } } }),
  ]);
  const purchaseAmount = Number(purchaseTarget?.amount ?? 0);
  const salesAmount = Number(salesTarget?.amount ?? purchaseTarget?.amount ?? 0);
  if (purchaseAmount <= 0 && salesAmount <= 0) throw new Error("No purchase or sales turnover target found for selected month.");

  await logAgentAudit({
    step: "BUSINESS_PLAN_AGENT_STARTED",
    message: `Business plan agent started for ${company.name} ${input.month}.`,
    metadata: { companyId: input.companyId, planId: planKey, month: input.month, purchaseAmount, salesAmount },
  });

  const result = {
    companyId: input.companyId,
    month: input.month,
    purchase: { amount: purchaseAmount, targets: 0, scheduled: 0, sentNow: 0, invoices: 0, partners: [] as Array<{ name: string; amount: number; invoices: number }> },
    sales: { amount: salesAmount, targets: 0, scheduled: 0, sentNow: 0, invoices: 0, partners: [] as Array<{ name: string; amount: number; invoices: number }> },
    targetIds: [] as string[],
    invoiceIds: [] as string[],
  };

  try {
  const purchaseAllocations = allocationRows(plan.purchaseVendors, purchaseAmount).map((allocation) => ({
    ...allocation,
    split: invoicePlan(plan.purchasePlan, allocation.amount),
  }));
  const purchaseDates = scheduleDates(
    input.month,
    purchaseAllocations.reduce((sum, allocation) => sum + allocation.split.count, 0),
    input.dateFrom,
    input.dateTo,
  );
  let purchaseDateIndex = 0;
  for (const allocation of purchaseAllocations) {
    const vendor = await findPartnerCompany(input.companyId, allocation.partner.name);
    if (!vendor) throw new Error(`Purchase vendor not found: ${allocation.partner.name}`);
    await ensureSupplierStock(vendor.id, allocation.amount);
    for (let index = 0; index < allocation.split.count; index += 1) {
      const amount = Math.min(allocation.split.valueLimit, allocation.amount / allocation.split.count);
      const targetDate = purchaseDates[purchaseDateIndex] ?? purchaseDates.at(-1) ?? input.dateFrom ?? appMonthStart(input.month);
      purchaseDateIndex += 1;
      const target = await createAllocatedTarget({
        buyerCompanyId: input.companyId,
        sellerCompanyId: vendor.id,
        month: input.month,
        targetDate,
        direction: "PURCHASE",
        amount,
        lineCount: input.lineCount,
        notes: `Business plan purchase ${index + 1}/${allocation.split.count}: ${allocation.percent.toFixed(2)}% allocation from ${vendor.name}`,
      });
      result.targetIds.push(target.id);
      result.purchase.targets += 1;
      if (isScheduledTargetDue(targetDate, "09:00")) {
        const completed = await runAndInvoiceTarget(target.id);
        result.invoiceIds.push(completed.vendorInvoice.invoice.id);
        result.purchase.sentNow += 1;
        result.purchase.invoices += 1;
        await logAgentAudit({
          targetId: target.id,
          step: "BUSINESS_PLAN_PURCHASE_COMPLETED",
          message: `Due purchase target executed for ${vendor.name}.`,
          metadata: { allocationAmount: allocation.amount, invoiceId: completed.vendorInvoice.invoice.id },
        });
      } else {
        result.purchase.scheduled += 1;
        await logAgentAudit({
          targetId: target.id,
          step: "BUSINESS_PLAN_PURCHASE_SCHEDULED",
          message: `Purchase target scheduled for ${targetDate} 09:00.`,
          metadata: { allocationAmount: allocation.amount, targetDate },
        });
      }
    }
    result.purchase.partners.push({ name: vendor.name, amount: money(allocation.amount).toNumber(), invoices: allocation.split.count });
  }

  const salesPartners = plan.salesAllocations?.length ? plan.salesAllocations : plan.salesCustomers;
  const salesAllocations = allocationRows(salesPartners, salesAmount).map((allocation) => ({
    ...allocation,
    split: invoicePlan(plan.salesPlan, allocation.amount),
  }));
  const salesDates = scheduleDates(
    input.month,
    salesAllocations.reduce((sum, allocation) => sum + allocation.split.count, 0),
    input.dateFrom,
    input.dateTo,
  );
  let salesDateIndex = 0;
  for (const allocation of salesAllocations) {
    const customer = await findPartnerCompany(input.companyId, allocation.partner.name);
    if (!customer) throw new Error(`Sales customer not found: ${allocation.partner.name}`);
    for (let index = 0; index < allocation.split.count; index += 1) {
      const amount = Math.min(allocation.split.valueLimit, allocation.amount / allocation.split.count);
      const targetDate = salesDates[salesDateIndex] ?? salesDates.at(-1) ?? input.dateFrom ?? appMonthStart(input.month);
      salesDateIndex += 1;
      const target = await createAllocatedTarget({
        buyerCompanyId: customer.id,
        sellerCompanyId: input.companyId,
        month: input.month,
        targetDate,
        direction: "SALES",
        amount,
        lineCount: input.lineCount,
        notes: `Business plan sales ${index + 1}/${allocation.split.count}: ${allocation.percent.toFixed(2)}% allocation to ${customer.name}`,
      });
      result.targetIds.push(target.id);
      result.sales.targets += 1;
      if (isScheduledTargetDue(targetDate, "09:00")) {
        const completed = await runAndInvoiceTarget(target.id);
        result.invoiceIds.push(completed.vendorInvoice.invoice.id);
        result.sales.sentNow += 1;
        result.sales.invoices += 1;
        await logAgentAudit({
          targetId: target.id,
          step: "BUSINESS_PLAN_SALES_COMPLETED",
          message: `Due sales target executed for ${customer.name}.`,
          metadata: { allocationAmount: allocation.amount, invoiceId: completed.vendorInvoice.invoice.id },
        });
      } else {
        result.sales.scheduled += 1;
        await logAgentAudit({
          targetId: target.id,
          step: "BUSINESS_PLAN_SALES_SCHEDULED",
          message: `Sales target scheduled for ${targetDate} 09:00.`,
          metadata: { allocationAmount: allocation.amount, targetDate },
        });
      }
    }
    result.sales.partners.push({ name: customer.name, amount: money(allocation.amount).toNumber(), invoices: allocation.split.count });
  }

  await logAgentAudit({
    step: "BUSINESS_PLAN_AGENT_COMPLETED",
    message: `Business plan agent scheduled ${result.purchase.scheduled + result.sales.scheduled} future targets and executed ${result.purchase.sentNow + result.sales.sentNow} due targets.`,
    metadata: result,
  });
  return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Business plan agent failed";
    logSystemEvent("ERROR", "business_plan_agent_failed", {
      message,
      companyId: input.companyId,
      planId: planKey,
      month: input.month,
      stack: error instanceof Error ? error.stack : undefined,
    });
    await logAgentAudit({
      step: "BUSINESS_PLAN_AGENT_FAILED",
      status: "ERROR",
      message,
      metadata: { companyId: input.companyId, planId: planKey, month: input.month },
    });
    throw error;
  }
}
