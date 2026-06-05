import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { appDate, appMonthEnd, appMonthStart } from "../../shared/timezone";
import { createMonthlyTarget, logAgentAudit, runTargetWorkflow, vendorCreateInvoiceForTarget } from "./workflow";
import { itemBuyingPrice, itemSellingPrice } from "./stockLedger";

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
  const start = new Date(`${dateFrom || appMonthStart(month)}T00:00:00+04:00`);
  const end = new Date(`${dateTo || appMonthEnd(month)}T00:00:00+04:00`);
  const spanDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  return Array.from({ length: count }, (_, index) => {
    const dayOffset = count <= 1 ? 0 : Math.round((spanDays * index) / Math.max(count - 1, 1));
    const date = new Date(start);
    date.setDate(start.getDate() + dayOffset);
    return appDate(date);
  });
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
  lineCount: number;
  notes: string;
}) {
  const stock = await prisma.stock.findMany({
    where: { companyId: input.sellerCompanyId, quantity: { gt: 0 }, item: { active: true } },
    include: { item: true },
  });
  if (!stock.length) throw new Error("Seller has no stock available for business plan agent");
  const shuffled = [...stock].sort(() => Math.random() - 0.5).slice(0, Math.min(input.lineCount, stock.length));
  const amountPerLine = input.amount / shuffled.length;
  const lines = shuffled.map((stockRow) => {
    const unitPrice = input.direction === "PURCHASE" ? itemBuyingPrice(stockRow.item) : itemSellingPrice(stockRow.item);
    const quantity = Math.max(1, Math.min(stockRow.quantity, Math.round(amountPerLine / Math.max(Number(unitPrice), 0.01))));
    return {
      itemId: stockRow.itemId,
      quantity,
      maxPrice: Number(unitPrice),
    };
  });

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

async function runAndInvoiceTarget(targetId: string) {
  const workflow = await runTargetWorkflow(targetId);
  const vendorInvoice = await vendorCreateInvoiceForTarget(targetId);
  return { workflow, vendorInvoice };
}

export async function runBusinessPlanAgent(input: {
  companyId: string;
  month: string;
  dateFrom?: string;
  dateTo?: string;
  lineCount?: number;
}) {
  const setting = await prisma.appSetting.findUnique({ where: { key: `businessPlan:${input.companyId}` } });
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
    metadata: { companyId: input.companyId, month: input.month, purchaseAmount, salesAmount },
  });

  const result = {
    companyId: input.companyId,
    month: input.month,
    purchase: { amount: purchaseAmount, targets: 0, invoices: 0, partners: [] as Array<{ name: string; amount: number; invoices: number }> },
    sales: { amount: salesAmount, targets: 0, invoices: 0, partners: [] as Array<{ name: string; amount: number; invoices: number }> },
    targetIds: [] as string[],
    invoiceIds: [] as string[],
  };

  for (const allocation of allocationRows(plan.purchaseVendors, purchaseAmount)) {
    const vendor = await findPartnerCompany(input.companyId, allocation.partner.name);
    if (!vendor) throw new Error(`Purchase vendor not found: ${allocation.partner.name}`);
    await ensureSupplierStock(vendor.id, allocation.amount);
    const split = invoicePlan(plan.purchasePlan, allocation.amount);
    const dates = scheduleDates(input.month, split.count, input.dateFrom, input.dateTo);
    for (let index = 0; index < split.count; index += 1) {
      const amount = Math.min(split.valueLimit, allocation.amount / split.count);
      const target = await createAllocatedTarget({
        buyerCompanyId: input.companyId,
        sellerCompanyId: vendor.id,
        month: input.month,
        targetDate: dates[index],
        direction: "PURCHASE",
        amount,
        lineCount: input.lineCount ?? 3,
        notes: `Business plan purchase ${index + 1}/${split.count}: ${allocation.percent.toFixed(2)}% allocation from ${vendor.name}`,
      });
      const completed = await runAndInvoiceTarget(target.id);
      result.targetIds.push(target.id);
      result.invoiceIds.push(completed.vendorInvoice.invoice.id);
      result.purchase.targets += 1;
      result.purchase.invoices += 1;
      await logAgentAudit({
        targetId: target.id,
        step: "BUSINESS_PLAN_PURCHASE_COMPLETED",
        message: `Vendor invoice received and stock updated for ${vendor.name}.`,
        metadata: { allocationAmount: allocation.amount, invoiceId: completed.vendorInvoice.invoice.id },
      });
    }
    result.purchase.partners.push({ name: vendor.name, amount: money(allocation.amount).toNumber(), invoices: split.count });
  }

  const salesPartners = plan.salesAllocations?.length ? plan.salesAllocations : plan.salesCustomers;
  for (const allocation of allocationRows(salesPartners, salesAmount)) {
    const customer = await findPartnerCompany(input.companyId, allocation.partner.name);
    if (!customer) throw new Error(`Sales customer not found: ${allocation.partner.name}`);
    const split = invoicePlan(plan.salesPlan, allocation.amount);
    const dates = scheduleDates(input.month, split.count, input.dateFrom, input.dateTo);
    for (let index = 0; index < split.count; index += 1) {
      const amount = Math.min(split.valueLimit, allocation.amount / split.count);
      const target = await createAllocatedTarget({
        buyerCompanyId: customer.id,
        sellerCompanyId: input.companyId,
        month: input.month,
        targetDate: dates[index],
        direction: "SALES",
        amount,
        lineCount: input.lineCount ?? 3,
        notes: `Business plan sales ${index + 1}/${split.count}: ${allocation.percent.toFixed(2)}% allocation to ${customer.name}`,
      });
      const completed = await runAndInvoiceTarget(target.id);
      result.targetIds.push(target.id);
      result.invoiceIds.push(completed.vendorInvoice.invoice.id);
      result.sales.targets += 1;
      result.sales.invoices += 1;
      await logAgentAudit({
        targetId: target.id,
        step: "BUSINESS_PLAN_SALES_COMPLETED",
        message: `Sales invoice created for ${customer.name} from available stock.`,
        metadata: { allocationAmount: allocation.amount, invoiceId: completed.vendorInvoice.invoice.id },
      });
    }
    result.sales.partners.push({ name: customer.name, amount: money(allocation.amount).toNumber(), invoices: split.count });
  }

  await logAgentAudit({
    step: "BUSINESS_PLAN_AGENT_COMPLETED",
    message: `Business plan agent completed: ${result.purchase.invoices} purchase invoices, ${result.sales.invoices} sales invoices.`,
    metadata: result,
  });
  return result;
}
