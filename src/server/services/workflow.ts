import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getCompanySmtpSettings } from "./emailIntegrations";
import { generateInvoicePdf } from "./invoicePdf";
import { getPurchaseOrderPdf } from "./purchaseOrderPdf";
import { purchaseOrderHtml } from "./documentEmail";
import nodemailer from "nodemailer";

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function docNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

async function sendSmtpMail(input: {
  companyId: string;
  fallbackFromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{ filename: string; path: string }>;
}) {
  const smtp = await getCompanySmtpSettings(input.companyId);
  if (!smtp) {
    return { status: "SENT", fromEmail: input.fallbackFromEmail, messageId: undefined as string | undefined };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });

  const result = await transporter.sendMail({
    from: smtp.username,
    to: input.toEmail,
    subject: input.subject,
    text: input.body,
    html: input.html,
    attachments: input.attachments ?? [],
  });

  return { status: "SENT_VIA_SMTP", fromEmail: smtp.username, messageId: result.messageId };
}

export async function createMonthlyTarget(input: {
  buyerCompanyId: string;
  sellerCompanyId: string;
  month: string;
  targetDate?: string;
  periodType?: string;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: string;
  hourTo?: string;
  direction?: string;
  productMode?: string;
  amountVolume?: number;
  notes?: string;
  lines: Array<{ itemId: string; quantity: number; maxPrice?: number }>;
}) {
  if (input.buyerCompanyId === input.sellerCompanyId) throw new Error("Buyer and seller must be different companies");
  if (!input.lines.length) throw new Error("Target must include at least one item");

  return prisma.monthlyTarget.create({
    data: {
      buyerCompanyId: input.buyerCompanyId,
      sellerCompanyId: input.sellerCompanyId,
      month: input.month,
      targetDate: input.targetDate,
      periodType: input.periodType ?? "MONTHLY",
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      hourFrom: input.hourFrom,
      hourTo: input.hourTo,
      direction: input.direction,
      productMode: input.productMode ?? "RANDOM",
      amountVolume: input.amountVolume === undefined ? undefined : new Prisma.Decimal(input.amountVolume),
      notes: input.notes,
      lines: {
        create: input.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          maxPrice: line.maxPrice === undefined ? undefined : new Prisma.Decimal(line.maxPrice),
        })),
      },
    },
    include: { buyerCompany: true, sellerCompany: true, lines: { include: { item: true } } },
  });
}

export async function createRandomMonthlyTarget(input: {
  buyerCompanyId: string;
  sellerCompanyId: string;
  month: string;
  targetDate?: string;
  periodType?: string;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: string;
  hourTo?: string;
  direction?: string;
  productMode?: string;
  amount: number;
  lineCount: number;
  itemIds?: string[];
  notes?: string;
}) {
  if (input.buyerCompanyId === input.sellerCompanyId) throw new Error("Buyer and seller must be different companies");
  if (input.amount <= 0) throw new Error("Amount must be greater than zero");
  if (input.lineCount < 1) throw new Error("Line count must be at least one");

  const availableStock = await prisma.stock.findMany({
    where: {
      companyId: input.sellerCompanyId,
      quantity: { gt: 0 },
      ...(input.itemIds?.length ? { itemId: { in: input.itemIds } } : {}),
      item: { active: true },
    },
    include: { item: true },
  });
  if (!availableStock.length) throw new Error("Seller has no stock available for random target");

  const shuffled = [...availableStock].sort(() => Math.random() - 0.5).slice(0, Math.min(input.lineCount, availableStock.length));
  const amountPerLine = input.amount / shuffled.length;

  const lines = shuffled.map((stock) => {
    const price = Number(stock.item.expectedPrice);
    const idealQuantity = Math.max(1, Math.round(amountPerLine / Math.max(price, 0.01)));
    const randomCap = Math.max(1, Math.min(stock.quantity, Math.ceil(idealQuantity * (0.7 + Math.random() * 0.8))));
    const quantity = Math.max(1, Math.min(stock.quantity, randomCap));
    return {
      itemId: stock.itemId,
      quantity,
      maxPrice: Number(stock.item.maxPrice ?? stock.item.expectedPrice),
    };
  });

  return createMonthlyTarget({
    buyerCompanyId: input.buyerCompanyId,
    sellerCompanyId: input.sellerCompanyId,
    month: input.month,
    targetDate: input.targetDate,
    periodType: input.periodType,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    hourFrom: input.hourFrom,
    hourTo: input.hourTo,
    direction: input.direction,
    productMode: input.productMode,
    amountVolume: input.amount,
    notes: input.notes ?? `Random target generated for amount AED ${input.amount.toFixed(2)}`,
    lines,
  });
}

export async function createTransactionTarget(input: {
  companyId: string;
  counterpartyId: string;
  direction: "PURCHASE" | "SALES";
  periodType: "MONTHLY" | "DAILY";
  month: string;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: string;
  hourTo?: string;
  amount: number;
  lineCount: number;
  productMode: "RANDOM" | "SELECTED";
  itemIds?: string[];
  notes?: string;
  runNow?: boolean;
}) {
  if (input.companyId === input.counterpartyId) throw new Error("Company and counterparty must be different");
  if (input.productMode === "SELECTED" && !input.itemIds?.length) throw new Error("Select at least one product");
  if (input.periodType === "MONTHLY" && (!input.dateFrom || !input.dateTo)) throw new Error("Monthly target needs date from and date to");
  if (input.periodType === "DAILY" && (!input.dateFrom || !input.hourFrom || !input.hourTo)) throw new Error("Daily target needs date and hour range");

  const buyerCompanyId = input.direction === "PURCHASE" ? input.companyId : input.counterpartyId;
  const sellerCompanyId = input.direction === "PURCHASE" ? input.counterpartyId : input.companyId;
  const label = input.direction === "PURCHASE" ? "purchase from vendor" : "sale to customer";

  const target = await createRandomMonthlyTarget({
    buyerCompanyId,
    sellerCompanyId,
    month: input.month,
    targetDate: input.periodType === "DAILY" ? input.dateFrom : undefined,
    periodType: input.periodType,
    dateFrom: input.dateFrom,
    dateTo: input.periodType === "MONTHLY" ? input.dateTo : input.dateFrom,
    hourFrom: input.periodType === "DAILY" ? input.hourFrom : undefined,
    hourTo: input.periodType === "DAILY" ? input.hourTo : undefined,
    direction: input.direction,
    productMode: input.productMode,
    amount: input.amount,
    lineCount: input.productMode === "SELECTED" ? input.itemIds?.length ?? input.lineCount : input.lineCount,
    itemIds: input.productMode === "SELECTED" ? input.itemIds : undefined,
    notes: input.notes ?? `${input.periodType.toLowerCase()} ${label} target: AED ${input.amount.toFixed(2)}`,
  });

  if (!input.runNow) return { target, workflow: null };
  return { target, workflow: await runTargetWorkflow(target.id) };
}

function instructionNumber(instruction: string, fallback: number) {
  const match = instruction.match(/\baed\s*([0-9][0-9,]*(?:\.\d+)?)(?:\s*(k|m|million|thousand))?/i)
    ?? instruction.match(/\b(?:amount|volume|for)\s*(?:aed\s*)?([0-9][0-9,]*(?:\.\d+)?)(?:\s*(k|m|million|thousand))?/i)
    ?? instruction.match(/\b([0-9][0-9,]*(?:\.\d+)?)(?:\s*(k|m|million|thousand))?\s*(?:aed|dirham|value|volume)\b/i);
  if (!match) return fallback;
  const base = Number(match[1].replaceAll(",", ""));
  const suffix = match[2]?.toLowerCase();
  if (!Number.isFinite(base)) return fallback;
  if (suffix === "m" || suffix === "million") return base * 1_000_000;
  if (suffix === "k" || suffix === "thousand") return base * 1_000;
  return base;
}

function instructionProductCount(instruction: string, fallback: number) {
  const match = instruction.match(/([0-9]+)\s*(?:product|item|sku|card)/i);
  if (!match) return fallback;
  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 ? Math.min(count, 20) : fallback;
}

function instructionPoCount(instruction: string) {
  const explicit = instruction.match(/([0-9]+)\s*(?:separate\s+|different\s+|multiple\s+)?(?:po|purchase\s+orders?|orders?)\b/i);
  if (explicit) {
    const count = Number(explicit[1]);
    if (Number.isInteger(count) && count > 1) return Math.min(count, 10);
  }
  if (/\bmultiple|several|many|batch\b/i.test(instruction) && /\bpo|purchase order|order\b/i.test(instruction)) return 5;
  return 1;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

const scheduledVendorInvoices = new Map<string, NodeJS.Timeout>();
const vendorInvoiceDelayMs = Number(process.env.VENDOR_INVOICE_DELAY_MS ?? 120000);

function randomInvoiceDelayMs(input: {
  mode?: "FIXED" | "RANDOM";
  minutes?: number;
  minMinutes?: number;
  maxMinutes?: number;
}) {
  if (input.mode !== "RANDOM") {
    return Math.round((input.minutes ?? 2) * 60000);
  }

  const min = Math.max(0, input.minMinutes ?? 1);
  const max = Math.max(min, input.maxMinutes ?? 5);
  const delayMinutes = min + Math.random() * (max - min);
  return Math.round(delayMinutes * 60000);
}

export async function logAgentAudit(input: {
  targetId?: string;
  step: string;
  status?: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.agentAuditLog.create({
      data: {
        targetId: input.targetId,
        step: input.step,
        status: input.status ?? "OK",
        message: input.message,
        metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      },
    });
  } catch (error) {
    console.error("Agent audit log failed:", error);
  }
}

export function scheduleVendorInvoiceForTarget(targetId: string, delayMs = vendorInvoiceDelayMs) {
  if (scheduledVendorInvoices.has(targetId)) return;
  void logAgentAudit({
    targetId,
    step: "INVOICE_SCHEDULED",
    message: `Vendor invoice scheduled after ${Math.round(delayMs / 1000)} seconds.`,
    metadata: { delayMs },
  });
  const timeout = setTimeout(async () => {
    scheduledVendorInvoices.delete(targetId);
    try {
      await vendorCreateInvoiceForTarget(targetId);
    } catch (error) {
      await logAgentAudit({
        targetId,
        step: "FAILURE",
        status: "ERROR",
        message: error instanceof Error ? error.message : "Scheduled vendor invoice failed",
      });
      console.error(`Scheduled vendor invoice failed for target ${targetId}:`, error);
    }
  }, delayMs);
  timeout.unref?.();
  scheduledVendorInvoices.set(targetId, timeout);
}

export async function createAgentInstructionTarget(input: {
  companyId?: string;
  counterpartyId?: string;
  direction?: "PURCHASE" | "SALES";
  instruction: string;
  autoStart: boolean;
  autoInvoice?: boolean;
  poCount?: number;
  dateFrom?: string;
  dateTo?: string;
  invoiceDelayMode?: "FIXED" | "RANDOM";
  invoiceDelayMinutes?: number;
  invoiceDelayMinMinutes?: number;
  invoiceDelayMaxMinutes?: number;
  amount?: number;
  amountMode?: "PER_PO" | "TOTAL_SPLIT";
  lineCount?: number;
  productMode?: "RANDOM" | "SELECTED";
  itemIds?: string[];
}) {
  const instruction = input.instruction.trim();
  if (instruction.length < 5) throw new Error("Agent instruction is too short");

  const companies = await prisma.company.findMany({ orderBy: { createdAt: "asc" } });
  if (companies.length < 2) throw new Error("Agent needs at least two companies");

  const company = input.companyId
    ? companies.find((entry) => entry.id === input.companyId)
    : companies.find((entry) => instruction.toLowerCase().includes(entry.name.toLowerCase())) ?? companies[0];
  if (!company) throw new Error("Agent company not found");
  const counterparty = input.counterpartyId
    ? companies.find((entry) => entry.id === input.counterpartyId && entry.id !== company.id)
    : companies.find((entry) =>
      entry.id !== company.id && instruction.toLowerCase().includes(entry.name.toLowerCase())
    ) ?? companies.find((entry) => entry.id !== company.id);
  if (!counterparty) throw new Error("Agent counterparty not found");

  const direction = input.direction ?? (/\bsale|sales|sell|customer\b/i.test(instruction) ? "SALES" : "PURCHASE");
  const poCount = input.poCount ?? instructionPoCount(instruction);
  const isWeeklySchedule = !input.dateFrom && /\bthis week|weekly|week\b/i.test(instruction);
  const todayDate = new Date();
  const today = dateString(todayDate);
  const requestedDateFrom = input.dateFrom ?? today;
  const requestedDateTo = input.dateTo ?? (isWeeklySchedule ? dateString(addDays(todayDate, Math.max(poCount, 5) - 1)) : requestedDateFrom);
  const isTodaySchedule = requestedDateFrom <= today && requestedDateTo >= today && /\btoday|now|immediate|immediately\b/i.test(instruction);
  const periodType = poCount > 1 || isWeeklySchedule || input.dateFrom || /\btoday|daily|hour|tomorrow\b/i.test(instruction) ? "DAILY" : "MONTHLY";
  const month = requestedDateFrom.slice(0, 7);
  const amount = input.amount ?? instructionNumber(instruction, 10000);
  const lineCount = input.lineCount ?? instructionProductCount(instruction, 3);
  const productMode = input.productMode ?? "RANDOM";
  const itemIds = productMode === "SELECTED" ? input.itemIds : undefined;
  const autoInvoice = input.autoInvoice ?? /\binvoice|bill\b/i.test(instruction);
  const invoiceDelayMode = input.invoiceDelayMode ?? "RANDOM";
  await logAgentAudit({
    step: "PARSED_INSTRUCTION",
    message: "Agent instruction parsed.",
    metadata: {
      instruction,
      companyId: company.id,
      counterpartyId: counterparty.id,
      direction,
      poCount,
      dateFrom: requestedDateFrom,
      dateTo: requestedDateTo,
      amount,
      amountMode: input.amountMode ?? "PER_PO",
      lineCount,
      productMode,
      itemIds,
      autoStart: input.autoStart,
      autoInvoice,
      invoiceDelayMode,
      invoiceDelayMinutes: input.invoiceDelayMinutes,
      invoiceDelayMinMinutes: input.invoiceDelayMinMinutes ?? 1,
      invoiceDelayMaxMinutes: input.invoiceDelayMaxMinutes ?? 5,
    },
  });

  if (poCount > 1 || isWeeklySchedule || (input.dateFrom && input.dateTo && input.dateFrom !== input.dateTo)) {
    const count = poCount > 1 ? poCount : isWeeklySchedule ? 5 : 1;
    const targets = [];
    const workflows: unknown[] = [];
    const runEachTargetNow = input.autoStart && !isWeeklySchedule && isTodaySchedule;
    const shouldScheduleVendorInvoice = runEachTargetNow && autoInvoice;
    const amountPerTarget = input.amountMode === "TOTAL_SPLIT" || isWeeklySchedule ? amount / count : amount;
    const startDate = new Date(`${requestedDateFrom}T00:00:00.000Z`);
    const endDate = new Date(`${requestedDateTo}T00:00:00.000Z`);
    const rangeDays = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
    for (let index = 0; index < count; index += 1) {
      const scheduledDate = dateString(addDays(startDate, Math.min(index, rangeDays - 1)));
      const scheduledMonth = scheduledDate.slice(0, 7);
      const result = await createTransactionTarget({
        companyId: company.id,
        counterpartyId: counterparty.id,
        direction,
        periodType: "DAILY",
        month: scheduledMonth,
        dateFrom: scheduledDate,
        dateTo: scheduledDate,
        hourFrom: "09:00",
        hourTo: "18:00",
        amount: amountPerTarget,
        lineCount,
        productMode,
        itemIds,
        notes: `AI scheduled PO ${index + 1}/${count}: ${instruction}`,
        runNow: runEachTargetNow,
      });
      let target = result.target;
      let workflow: any = result.workflow;
      await logAgentAudit({
        targetId: target.id,
        step: "TARGET_CREATED",
        message: `Target ${index + 1}/${count} created.`,
        metadata: { amount: amountPerTarget, scheduledDate, productMode, lineCount },
      });
      if (shouldScheduleVendorInvoice && workflow?.order) {
        const invoiceDelayMs = randomInvoiceDelayMs({
          mode: invoiceDelayMode,
          minutes: input.invoiceDelayMinutes,
          minMinutes: input.invoiceDelayMinMinutes,
          maxMinutes: input.invoiceDelayMaxMinutes,
        });
        scheduleVendorInvoiceForTarget(target.id, invoiceDelayMs);
      }
      targets.push(target);
      workflows.push(workflow);
    }

    return {
      target: targets[0],
      targets,
      workflows,
      workflow: workflows[0] ?? null,
    };
  }

  const result = await createTransactionTarget({
    companyId: company.id,
    counterpartyId: counterparty.id,
    direction,
    periodType,
    month,
    dateFrom: requestedDateFrom,
    dateTo: periodType === "MONTHLY" ? requestedDateTo : requestedDateFrom,
    hourFrom: periodType === "DAILY" ? "09:00" : undefined,
    hourTo: periodType === "DAILY" ? "18:00" : undefined,
    amount,
    lineCount,
    productMode,
    itemIds,
    notes: `AI agent instruction: ${instruction}`,
    runNow: input.autoStart,
  });
  await logAgentAudit({
    targetId: result.target.id,
    step: "TARGET_CREATED",
    message: "Target created.",
    metadata: { amount, dateFrom: requestedDateFrom, dateTo: requestedDateTo, productMode, lineCount },
  });

  const shouldIssueVendorInvoice = input.autoStart && autoInvoice;
  if (!shouldIssueVendorInvoice || !result.workflow?.order) return result;

  const invoiceDelayMs = randomInvoiceDelayMs({
    mode: invoiceDelayMode,
    minutes: input.invoiceDelayMinutes,
    minMinutes: input.invoiceDelayMinMinutes,
    maxMinutes: input.invoiceDelayMaxMinutes,
  });
  scheduleVendorInvoiceForTarget(result.target.id, invoiceDelayMs);
  return result;
}

export async function createDailyTransactionTarget(input: {
  companyId: string;
  counterpartyId: string;
  direction: "PURCHASE" | "SALES";
  date: string;
  amount: number;
  lineCount: number;
  notes?: string;
}) {
  if (input.companyId === input.counterpartyId) throw new Error("Company and counterparty must be different");

  const month = input.date.slice(0, 7);
  const buyerCompanyId = input.direction === "PURCHASE" ? input.companyId : input.counterpartyId;
  const sellerCompanyId = input.direction === "PURCHASE" ? input.counterpartyId : input.companyId;
  const label = input.direction === "PURCHASE" ? "purchase from vendor" : "sale to customer";

  return createRandomMonthlyTarget({
    buyerCompanyId,
    sellerCompanyId,
    month,
    targetDate: input.date,
    periodType: "DAILY",
    dateFrom: input.date,
    dateTo: input.date,
    direction: input.direction,
    amount: input.amount,
    lineCount: input.lineCount,
    notes: input.notes ?? `Daily ${label} target for ${input.date}: AED ${input.amount.toFixed(2)}`,
  });
}

export async function updateMonthlyTarget(targetId: string, input: {
  buyerCompanyId: string;
  sellerCompanyId: string;
  month: string;
  targetDate?: string;
  periodType?: string;
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: string;
  hourTo?: string;
  direction?: string;
  productMode?: string;
  amountVolume?: number;
  notes?: string;
  lines: Array<{ itemId: string; quantity: number; maxPrice?: number }>;
}) {
  if (input.buyerCompanyId === input.sellerCompanyId) throw new Error("Buyer and seller must be different companies");
  if (!input.lines.length) throw new Error("Target must include at least one item");

  const target = await prisma.monthlyTarget.findUnique({
    where: { id: targetId },
    include: { requirements: true },
  });
  if (!target) throw new Error("Target not found");
  if (target.requirements.length > 0 || !["OPEN", "STOPPED"].includes(target.status)) {
    throw new Error("Target cannot be updated after workflow has started");
  }

  return prisma.$transaction(async (tx) => {
    await tx.monthlyTargetLine.deleteMany({ where: { targetId } });
    return tx.monthlyTarget.update({
      where: { id: targetId },
      data: {
        buyerCompanyId: input.buyerCompanyId,
        sellerCompanyId: input.sellerCompanyId,
        month: input.month,
        targetDate: input.targetDate,
        periodType: input.periodType ?? "MONTHLY",
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        hourFrom: input.hourFrom,
        hourTo: input.hourTo,
        direction: input.direction,
        productMode: input.productMode ?? "RANDOM",
        amountVolume: input.amountVolume === undefined ? undefined : new Prisma.Decimal(input.amountVolume),
        status: "OPEN",
        notes: input.notes,
        lines: {
          create: input.lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
            maxPrice: line.maxPrice === undefined ? undefined : new Prisma.Decimal(line.maxPrice),
          })),
        },
      },
      include: { buyerCompany: true, sellerCompany: true, lines: { include: { item: true } } },
    });
  });
}

export async function deleteMonthlyTarget(targetId: string) {
  const target = await prisma.monthlyTarget.findUnique({
    where: { id: targetId },
    include: { requirements: true },
  });
  if (!target) throw new Error("Target not found");
  if (target.requirements.length > 0 || !["OPEN", "STOPPED"].includes(target.status)) {
    throw new Error("Target cannot be deleted after workflow has started");
  }

  await prisma.monthlyTarget.delete({ where: { id: targetId } });
  return { deleted: true, id: targetId };
}

export async function stopTargetWorkflow(targetId: string) {
  const target = await prisma.monthlyTarget.findUnique({
    where: { id: targetId },
    include: { requirements: true },
  });
  if (!target) throw new Error("Target not found");
  if (target.status !== "OPEN" || target.requirements.length > 0) {
    throw new Error("Only an open target can be stopped before workflow starts");
  }
  return prisma.monthlyTarget.update({
    where: { id: targetId },
    data: { status: "STOPPED" },
    include: { buyerCompany: true, sellerCompany: true, lines: { include: { item: true } } },
  });
}

export async function sendRequirement(targetId: string) {
  const target = await prisma.monthlyTarget.findUnique({
    where: { id: targetId },
    include: { buyerCompany: true, sellerCompany: true, lines: { include: { item: true } } },
  });
  if (!target) throw new Error("Target not found");

  const subject = `Internal PO preparation for ${target.month}`;
  const body = [
    `Internal buyer agent prepared a purchase order draft for ${target.sellerCompany.name}.`,
    ...target.lines.map((line) => `- ${line.item.sku} ${line.item.name}: ${line.quantity} ${line.item.unit}`),
  ].join("\n");

  return prisma.requirement.create({
    data: {
      targetId,
      buyerCompanyId: target.buyerCompanyId,
      sellerCompanyId: target.sellerCompanyId,
      status: "SENT",
      subject,
      body,
      sentAt: new Date(),
      lines: { create: target.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })) },
    },
    include: { lines: { include: { item: true } }, emails: true, buyerCompany: true, sellerCompany: true },
  });
}

export async function createQuotation(requirementId: string) {
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    include: {
      lines: { include: { item: true } },
      sellerCompany: true,
      buyerCompany: true,
    },
  });
  if (!requirement) throw new Error("Requirement not found");

  const stocks = await prisma.stock.findMany({
    where: {
      companyId: requirement.sellerCompanyId,
      itemId: { in: requirement.lines.map((line) => line.itemId) },
    },
  });
  const stockByItem = new Map(stocks.map((stock) => [stock.itemId, stock]));

  for (const line of requirement.lines) {
    const stock = stockByItem.get(line.itemId);
    if (!stock || stock.quantity - stock.reserved < line.quantity) {
      await prisma.requirement.update({ where: { id: requirementId }, data: { status: "HELD" } });
      throw new Error(`Insufficient seller stock for ${line.item.sku}`);
    }
  }

  const lines = requirement.lines.map((line) => {
    const unitPrice = money(line.item.expectedPrice);
    const lineTotal = money(unitPrice.mul(line.quantity));
    const vatRate = requirement.buyerCompany.vatEnabled ? line.item.vatRate : new Prisma.Decimal(0);
    return { itemId: line.itemId, quantity: line.quantity, unitPrice, vatRate, lineTotal };
  });
  const subtotal = money(lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0)));
  const vatAmount = money(lines.reduce((sum, line) => sum.plus(line.lineTotal.mul(line.vatRate)), new Prisma.Decimal(0)));
  const total = money(subtotal.plus(vatAmount));

  const quotation = await prisma.quotation.create({
    data: {
      requirementId,
      buyerCompanyId: requirement.buyerCompanyId,
      sellerCompanyId: requirement.sellerCompanyId,
      quoteNumber: docNumber("QT"),
      subtotal,
      vatAmount,
      total,
      lines: { create: lines },
    },
    include: { lines: { include: { item: true } }, requirement: true },
  });

  await prisma.requirement.update({ where: { id: requirementId }, data: { status: "QUOTED" } });
  return quotation;
}

export async function autoApproveQuotation(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      buyerCompany: true,
      lines: { include: { item: true } },
      requirement: { include: { target: { include: { lines: true } } } },
    },
  });
  if (!quotation) throw new Error("Quotation not found");

  const targetLines = new Map(quotation.requirement.target.lines.map((line) => [line.itemId, line]));
  const failures: string[] = [];

  for (const line of quotation.lines) {
    const targetLine = targetLines.get(line.itemId);
    if (!targetLine) failures.push(`${line.item.sku} is not in target`);
    if (targetLine && line.quantity > targetLine.quantity) failures.push(`${line.item.sku} quantity exceeds target`);
    const maxPrice = targetLine?.maxPrice ?? line.item.maxPrice;
    if (maxPrice && line.unitPrice.gt(maxPrice)) failures.push(`${line.item.sku} price exceeds approval limit`);
    const expectedVatRate = quotation.buyerCompany.vatEnabled ? line.item.vatRate : new Prisma.Decimal(0);
    if (!line.vatRate.equals(expectedVatRate)) failures.push(`${line.item.sku} VAT rate mismatch`);
  }

  if (failures.length) {
    await prisma.agentDecision.create({
      data: { quotationId, agentName: "Company A Agent", decision: "HELD", reason: failures.join("; ") },
    });
    await prisma.quotation.update({ where: { id: quotationId }, data: { status: "HELD" } });
    await prisma.requirement.update({ where: { id: quotation.requirementId }, data: { status: "HELD" } });
    return { approved: false, reason: failures.join("; ") };
  }

  await prisma.agentDecision.create({
    data: { quotationId, agentName: "Company A Agent", decision: "APPROVED", reason: "Within target, stock, price, and VAT rules" },
  });
  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "APPROVED" } });
  await prisma.requirement.update({ where: { id: quotation.requirementId }, data: { status: "APPROVED" } });
  return { approved: true, reason: "Within target, stock, price, and VAT rules" };
}

export async function confirmOrder(quotationId: string) {
  const quotation = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { lines: true } });
  if (!quotation) throw new Error("Quotation not found");
  if (quotation.status !== "APPROVED") throw new Error("Quotation must be approved before order confirmation");

  const order = await prisma.purchaseOrder.create({
    data: {
      quotationId,
      buyerCompanyId: quotation.buyerCompanyId,
      sellerCompanyId: quotation.sellerCompanyId,
      poNumber: docNumber("PO"),
      subtotal: quotation.subtotal,
      vatAmount: quotation.vatAmount,
      total: quotation.total,
      lines: {
        create: quotation.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          lineTotal: line.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });

  for (const line of quotation.lines) {
    const sellerStock = await prisma.stock.findUnique({
      where: { companyId_itemId: { companyId: quotation.sellerCompanyId, itemId: line.itemId } },
    });
    if (!sellerStock || sellerStock.quantity < line.quantity) throw new Error("Seller stock changed before confirmation");

    await prisma.stock.update({
      where: { companyId_itemId: { companyId: quotation.sellerCompanyId, itemId: line.itemId } },
      data: { quantity: { decrement: line.quantity } },
    });
    await prisma.stock.upsert({
      where: { companyId_itemId: { companyId: quotation.buyerCompanyId, itemId: line.itemId } },
      update: { quantity: { increment: line.quantity } },
      create: { companyId: quotation.buyerCompanyId, itemId: line.itemId, quantity: line.quantity },
    });
  }

  await prisma.requirement.update({ where: { id: quotation.requirementId }, data: { status: "ORDER_CONFIRMED" } });
  return order;
}

export async function sendPurchaseOrder(orderId: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    include: {
      buyerCompany: true,
      sellerCompany: true,
      lines: { include: { item: true } },
      quotation: { include: { requirement: true } },
    },
  });
  if (!order) throw new Error("Purchase order not found");

  const lineText = order.lines
    .map((line) => `${line.item.sku} ${line.item.name}: ${line.quantity} ${line.item.unit} @ AED ${line.unitPrice.toFixed(2)}`)
    .join("\n");
  const body = [
    `Purchase Order ${order.poNumber}`,
    `Buyer: ${order.buyerCompany.legalName}`,
    `Vendor: ${order.sellerCompany.legalName}`,
    "",
    lineText,
    "",
    `Subtotal: AED ${order.subtotal.toFixed(2)}`,
    `${order.vatAmount.gt(0) ? "VAT 5%" : "VAT"}: AED ${order.vatAmount.toFixed(2)}`,
    `Total: AED ${order.total.toFixed(2)}`,
    "",
    "Please issue the invoice for this same purchase order.",
  ].join("\n");

  const poPdf = await getPurchaseOrderPdf(order.id);
  const html = purchaseOrderHtml({
    buyer: order.buyerCompany,
    vendor: order.sellerCompany,
    poNumber: order.poNumber,
    date: order.createdAt.toLocaleDateString(),
    lines: order.lines.map((line) => ({
      sku: line.item.sku,
      name: line.item.name,
      quantity: line.quantity,
      unit: line.item.unit,
      unitPrice: `AED ${line.unitPrice.toFixed(2)}`,
      vatRate: `${Number(line.vatRate) * 100}%`,
      lineTotal: `AED ${line.lineTotal.toFixed(2)}`,
    })),
    subtotal: `AED ${order.subtotal.toFixed(2)}`,
    vatAmount: `AED ${order.vatAmount.toFixed(2)}`,
    total: `AED ${order.total.toFixed(2)}`,
  });
  const mail = await sendSmtpMail({
    companyId: order.buyerCompanyId,
    fallbackFromEmail: order.buyerCompany.email,
    toEmail: order.sellerCompany.email,
    subject: `Purchase Order ${order.poNumber}`,
    body,
    html,
    attachments: [{ filename: poPdf.filename, path: poPdf.path }],
  });

  await prisma.emailLog.create({
    data: {
      requirementId: order.quotation.requirementId,
      direction: "OUTBOUND",
      fromEmail: mail.fromEmail,
      toEmail: order.sellerCompany.email,
      subject: `Purchase Order ${order.poNumber}`,
      body,
      status: mail.status,
      messageId: mail.messageId,
      attachmentPath: poPdf.path,
    },
  });

  await logAgentAudit({
    targetId: order.quotation.requirement.targetId,
    step: "PO_SENT",
    message: `Purchase order ${order.poNumber} sent to ${order.sellerCompany.email}.`,
    metadata: {
      purchaseOrderId: order.id,
      poNumber: order.poNumber,
      fromEmail: mail.fromEmail,
      toEmail: order.sellerCompany.email,
      emailStatus: mail.status,
      attachmentPath: poPdf.path,
    },
  });

  return order;
}

export async function issueInvoice(purchaseOrderId: string) {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { lines: true, quotation: { include: { requirement: true } }, invoice: true } });
  if (!order) throw new Error("Purchase order not found");
  if (order.invoice) throw new Error("Invoice already exists for this purchase order");

  const invoice = await prisma.invoice.create({
    data: {
      purchaseOrderId,
      buyerCompanyId: order.buyerCompanyId,
      sellerCompanyId: order.sellerCompanyId,
      invoiceNumber: docNumber("INV"),
      subtotal: order.subtotal,
      vatAmount: order.vatAmount,
      total: order.total,
      lines: {
        create: order.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          lineTotal: line.lineTotal,
        })),
      },
    },
    include: { lines: { include: { item: true } }, buyerCompany: true, sellerCompany: true },
  });

  const invoiceWithPdf = await generateInvoicePdf(invoice.id);
  const body = [
    `Tax Invoice ${invoiceWithPdf.invoiceNumber}`,
    `PO Ref: ${invoiceWithPdf.purchaseOrder.poNumber}`,
    `Seller: ${invoiceWithPdf.sellerCompany.legalName}`,
    `Buyer: ${invoiceWithPdf.buyerCompany.legalName}`,
    `VAT: ${invoiceWithPdf.vatAmount.toFixed(2)}`,
    `Total: ${invoiceWithPdf.total.toFixed(2)}`,
  ].join("\n");

  const mail = await sendSmtpMail({
    companyId: invoiceWithPdf.sellerCompanyId,
    fallbackFromEmail: invoiceWithPdf.sellerCompany.email,
    toEmail: invoiceWithPdf.buyerCompany.email,
    subject: `Tax Invoice ${invoiceWithPdf.invoiceNumber}`,
    body,
    attachments: invoiceWithPdf.pdfPath ? [{ filename: `${invoiceWithPdf.invoiceNumber}.pdf`, path: invoiceWithPdf.pdfPath }] : [],
  });

  await prisma.emailLog.create({
    data: {
      direction: "OUTBOUND",
      fromEmail: mail.fromEmail,
      toEmail: invoiceWithPdf.buyerCompany.email,
      subject: `Tax Invoice ${invoiceWithPdf.invoiceNumber}`,
      body,
      status: mail.status,
      messageId: mail.messageId,
      attachmentPath: invoiceWithPdf.pdfPath,
    },
  });
  await logAgentAudit({
    targetId: order.quotation.requirement.targetId,
    step: "INVOICE_SENT",
    message: `Invoice ${invoiceWithPdf.invoiceNumber} sent to ${invoiceWithPdf.buyerCompany.email}.`,
    metadata: {
      invoiceId: invoiceWithPdf.id,
      invoiceNumber: invoiceWithPdf.invoiceNumber,
      purchaseOrderId,
      fromEmail: mail.fromEmail,
      toEmail: invoiceWithPdf.buyerCompany.email,
      emailStatus: mail.status,
      attachmentPath: invoiceWithPdf.pdfPath,
    },
  });
  await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: "INVOICED" } });
  await prisma.requirement.update({ where: { id: order.quotation.requirementId }, data: { status: "INVOICED" } });

  return invoiceWithPdf;
}

export async function vendorCreateInvoiceForTarget(targetId: string) {
  try {
    const target = await prisma.monthlyTarget.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new Error("Target not found");
    if (target.status !== "PO_SENT") throw new Error("Vendor can create invoice only after PO is sent");

    const order = await prisma.purchaseOrder.findFirst({
      where: { quotation: { requirement: { targetId } } },
      include: { invoice: true },
      orderBy: { createdAt: "desc" },
    });
    if (!order) throw new Error("Purchase order not found for target");
    if (order.invoice) throw new Error("Invoice already exists for this target");

    const invoice = await issueInvoice(order.id);
    await prisma.monthlyTarget.update({ where: { id: targetId }, data: { status: "COMPLETED" } });
    return { order, invoice };
  } catch (error) {
    await logAgentAudit({
      targetId,
      step: "FAILURE",
      status: "ERROR",
      message: error instanceof Error ? error.message : "Vendor invoice creation failed",
    });
    throw error;
  }
}

export async function runTargetWorkflow(targetId: string) {
  const target = await prisma.monthlyTarget.findUnique({
    where: { id: targetId },
    include: { requirements: true },
  });
  if (!target) throw new Error("Target not found");
  if (target.status !== "OPEN" || target.requirements.length > 0) {
    throw new Error("Workflow already ran for this target");
  }

  const requirement = await sendRequirement(targetId);
  try {
    const quotation = await createQuotation(requirement.id);
    const approval = await autoApproveQuotation(quotation.id);
    if (!approval.approved) {
      await prisma.monthlyTarget.update({ where: { id: targetId }, data: { status: "HELD" } });
      return { requirement, quotation, approval, order: null, invoice: null };
    }
    const order = await confirmOrder(quotation.id);
    await sendPurchaseOrder(order.id);
    await prisma.monthlyTarget.update({ where: { id: targetId }, data: { status: "PO_SENT" } });
    return { requirement, quotation, approval, order, invoice: null };
  } catch (error) {
    await prisma.monthlyTarget.update({ where: { id: targetId }, data: { status: "HELD" } });
    await logAgentAudit({
      targetId,
      step: "FAILURE",
      status: "ERROR",
      message: error instanceof Error ? error.message : "Workflow failed",
    });
    throw error;
  }
}
