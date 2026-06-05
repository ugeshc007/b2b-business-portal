import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { appMonthEnd, appMonthStart } from "../../shared/timezone";
import { itemBuyingPrice, itemSellingPrice } from "./stockLedger";

type ReportInput = {
  companyId?: string;
  month?: string;
};

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

function dateRange(month?: string) {
  const selectedMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : undefined;
  const startText = selectedMonth ? appMonthStart(`${selectedMonth}-15`) : undefined;
  const endText = selectedMonth ? appMonthEnd(`${selectedMonth}-15`) : undefined;
  return {
    month: selectedMonth,
    start: startText ? new Date(`${startText}T00:00:00+04:00`) : undefined,
    end: endText ? new Date(`${endText}T23:59:59+04:00`) : undefined,
  };
}

function createdAtWhere(input: ReportInput) {
  const range = dateRange(input.month);
  return range.start && range.end ? { gte: range.start, lte: range.end } : undefined;
}

function addGroup<T extends Record<string, unknown>>(map: Map<string, T>, key: string, create: () => T) {
  if (!map.has(key)) map.set(key, create());
  return map.get(key)!;
}

export async function getPurchaseReport(input: ReportInput = {}) {
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(input.companyId ? { buyerCompanyId: input.companyId } : {}),
      ...(createdAtWhere(input) ? { createdAt: createdAtWhere(input) } : {}),
    },
    include: {
      buyerCompany: true,
      sellerCompany: true,
      purchaseOrder: true,
      lines: { include: { item: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const vendorWise = new Map<string, { vendorId: string; vendorName: string; invoiceCount: number; quantity: number; subtotal: Prisma.Decimal; vatAmount: Prisma.Decimal; total: Prisma.Decimal }>();
  const productWise = new Map<string, { itemId: string; sku: string; itemName: string; quantity: number; buyingValue: Prisma.Decimal; vatAmount: Prisma.Decimal }>();
  const invoiceWise = [];

  for (const invoice of invoices) {
    const vendor = addGroup(vendorWise, invoice.sellerCompanyId, () => ({
      vendorId: invoice.sellerCompanyId,
      vendorName: invoice.sellerCompany.name,
      invoiceCount: 0,
      quantity: 0,
      subtotal: new Prisma.Decimal(0),
      vatAmount: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
    }));
    vendor.invoiceCount += 1;
    vendor.subtotal = vendor.subtotal.plus(invoice.subtotal);
    vendor.vatAmount = vendor.vatAmount.plus(invoice.vatAmount);
    vendor.total = vendor.total.plus(invoice.total);
    for (const line of invoice.lines) {
      vendor.quantity += line.quantity;
      const product = addGroup(productWise, line.itemId, () => ({
        itemId: line.itemId,
        sku: line.item.sku,
        itemName: line.item.name,
        quantity: 0,
        buyingValue: new Prisma.Decimal(0),
        vatAmount: new Prisma.Decimal(0),
      }));
      product.quantity += line.quantity;
      product.buyingValue = product.buyingValue.plus(line.lineTotal);
      product.vatAmount = product.vatAmount.plus(line.lineTotal.mul(line.vatRate));
    }
    invoiceWise.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      poNumber: invoice.purchaseOrder.poNumber,
      date: invoice.createdAt,
      buyerName: invoice.buyerCompany.name,
      vendorName: invoice.sellerCompany.name,
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      total: invoice.total,
    });
  }

  return {
    vendorWise: [...vendorWise.values()].map((row) => ({ ...row, subtotal: money(row.subtotal), vatAmount: money(row.vatAmount), total: money(row.total) })),
    productWise: [...productWise.values()].map((row) => ({ ...row, buyingValue: money(row.buyingValue), vatAmount: money(row.vatAmount) })),
    invoiceWise,
  };
}

export async function getSalesReport(input: ReportInput = {}) {
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(input.companyId ? { sellerCompanyId: input.companyId } : {}),
      ...(createdAtWhere(input) ? { createdAt: createdAtWhere(input) } : {}),
    },
    include: {
      buyerCompany: true,
      sellerCompany: true,
      purchaseOrder: true,
      lines: { include: { item: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const customerWise = new Map<string, { customerId: string; customerName: string; invoiceCount: number; quantity: number; subtotal: Prisma.Decimal; vatAmount: Prisma.Decimal; total: Prisma.Decimal }>();
  const productWise = new Map<string, { itemId: string; sku: string; itemName: string; quantity: number; sellingValue: Prisma.Decimal; vatAmount: Prisma.Decimal }>();
  const invoiceWise = [];

  for (const invoice of invoices) {
    const customer = addGroup(customerWise, invoice.buyerCompanyId, () => ({
      customerId: invoice.buyerCompanyId,
      customerName: invoice.buyerCompany.name,
      invoiceCount: 0,
      quantity: 0,
      subtotal: new Prisma.Decimal(0),
      vatAmount: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
    }));
    customer.invoiceCount += 1;
    customer.subtotal = customer.subtotal.plus(invoice.subtotal);
    customer.vatAmount = customer.vatAmount.plus(invoice.vatAmount);
    customer.total = customer.total.plus(invoice.total);
    for (const line of invoice.lines) {
      customer.quantity += line.quantity;
      const product = addGroup(productWise, line.itemId, () => ({
        itemId: line.itemId,
        sku: line.item.sku,
        itemName: line.item.name,
        quantity: 0,
        sellingValue: new Prisma.Decimal(0),
        vatAmount: new Prisma.Decimal(0),
      }));
      product.quantity += line.quantity;
      product.sellingValue = product.sellingValue.plus(line.lineTotal);
      product.vatAmount = product.vatAmount.plus(line.lineTotal.mul(line.vatRate));
    }
    invoiceWise.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      poNumber: invoice.purchaseOrder.poNumber,
      date: invoice.createdAt,
      sellerName: invoice.sellerCompany.name,
      customerName: invoice.buyerCompany.name,
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      total: invoice.total,
    });
  }

  return {
    customerWise: [...customerWise.values()].map((row) => ({ ...row, subtotal: money(row.subtotal), vatAmount: money(row.vatAmount), total: money(row.total) })),
    productWise: [...productWise.values()].map((row) => ({ ...row, sellingValue: money(row.sellingValue), vatAmount: money(row.vatAmount) })),
    invoiceWise,
  };
}

export async function getProfitReport(input: ReportInput = {}) {
  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(createdAtWhere(input) ? { createdAt: createdAtWhere(input) } : {}),
    },
    include: { company: true, item: true },
  });
  const invoices = await prisma.invoice.findMany({
    where: {
      ...(input.companyId ? { OR: [{ buyerCompanyId: input.companyId }, { sellerCompanyId: input.companyId }] } : {}),
      ...(createdAtWhere(input) ? { createdAt: createdAtWhere(input) } : {}),
    },
  });
  const rows = new Map<string, { companyId: string; companyName: string; itemId: string; sku: string; itemName: string; purchasedQuantity: number; soldQuantity: number; buyingValue: Prisma.Decimal; sellingValue: Prisma.Decimal; margin: Prisma.Decimal; marginPercent: number }>();
  for (const movement of movements) {
    const row = addGroup(rows, `${movement.companyId}:${movement.itemId}`, () => ({
      companyId: movement.companyId,
      companyName: movement.company.name,
      itemId: movement.itemId,
      sku: movement.item.sku,
      itemName: movement.item.name,
      purchasedQuantity: 0,
      soldQuantity: 0,
      buyingValue: new Prisma.Decimal(0),
      sellingValue: new Prisma.Decimal(0),
      margin: new Prisma.Decimal(0),
      marginPercent: 0,
    }));
    if (movement.type === "PURCHASE") {
      row.purchasedQuantity += movement.quantity;
      row.buyingValue = row.buyingValue.plus(movement.purchaseValue);
    }
    if (movement.type === "SALE") {
      row.soldQuantity += movement.quantity;
      row.sellingValue = row.sellingValue.plus(movement.salesValue);
      row.margin = row.margin.plus(movement.salesValue.minus(itemBuyingPrice(movement.item).mul(movement.quantity)));
    }
  }
  return {
    rows: [...rows.values()].map((row) => ({
      ...row,
      buyingValue: money(row.buyingValue),
      sellingValue: money(row.sellingValue),
      margin: money(row.margin),
      marginPercent: row.sellingValue.gt(0) ? Number(row.margin.div(row.sellingValue).mul(100).toDecimalPlaces(2)) : 0,
    })),
    vat: {
      inputVat: money(invoices.filter((invoice) => invoice.buyerCompanyId === input.companyId).reduce((sum, invoice) => sum.plus(invoice.vatAmount), new Prisma.Decimal(0))),
      outputVat: money(invoices.filter((invoice) => invoice.sellerCompanyId === input.companyId).reduce((sum, invoice) => sum.plus(invoice.vatAmount), new Prisma.Decimal(0))),
      netVat: money(invoices.reduce((sum, invoice) => {
        if (invoice.sellerCompanyId === input.companyId) return sum.plus(invoice.vatAmount);
        if (invoice.buyerCompanyId === input.companyId) return sum.minus(invoice.vatAmount);
        return sum;
      }, new Prisma.Decimal(0))),
    },
  };
}

export async function getStockReport(input: ReportInput = {}) {
  const range = dateRange(input.month);
  const companies = await prisma.company.findMany({ where: input.companyId ? { id: input.companyId } : undefined });
  const items = await prisma.item.findMany({ where: { active: true } });
  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(range.end ? { createdAt: { lte: range.end } } : {}),
    },
    include: { company: true, item: true },
  });
  const movementRows = new Map<string, { companyId: string; companyName: string; itemId: string; sku: string; itemName: string; opening: number; purchased: number; sold: number; closing: number; closingBuyingValue: Prisma.Decimal; closingSellingValue: Prisma.Decimal }>();
  for (const company of companies) {
    for (const item of items) {
      movementRows.set(`${company.id}:${item.id}`, {
        companyId: company.id,
        companyName: company.name,
        itemId: item.id,
        sku: item.sku,
        itemName: item.name,
        opening: 0,
        purchased: 0,
        sold: 0,
        closing: 0,
        closingBuyingValue: new Prisma.Decimal(0),
        closingSellingValue: new Prisma.Decimal(0),
      });
    }
  }
  for (const movement of movements) {
    const row = movementRows.get(`${movement.companyId}:${movement.itemId}`);
    if (!row) continue;
    const isBeforeMonth = Boolean(range.start && movement.createdAt < range.start);
    const signedQty = movement.type === "SALE" ? -movement.quantity : movement.type === "PURCHASE" ? movement.quantity : movement.quantity;
    if (isBeforeMonth) row.opening += signedQty;
    else if (movement.type === "PURCHASE") row.purchased += movement.quantity;
    else if (movement.type === "SALE") row.sold += movement.quantity;
  }
  return {
    rows: [...movementRows.values()]
      .map((row) => {
        row.closing = row.opening + row.purchased - row.sold;
        const item = items.find((entry) => entry.id === row.itemId);
        if (item) {
          row.closingBuyingValue = itemBuyingPrice(item).mul(row.closing);
          row.closingSellingValue = itemSellingPrice(item).mul(row.closing);
        }
        return { ...row, closingBuyingValue: money(row.closingBuyingValue), closingSellingValue: money(row.closingSellingValue) };
      })
      .filter((row) => row.opening || row.purchased || row.sold || row.closing),
  };
}

export async function getTargetAchievementReport(input: ReportInput = {}) {
  const targets = await prisma.turnoverTarget.findMany({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.month ? { month: input.month } : {}),
    },
    include: { company: true },
    orderBy: [{ month: "desc" }, { type: "asc" }],
  });
  const rows = [];
  for (const target of targets) {
    const actualInvoices = await prisma.invoice.findMany({
      where: {
        ...(target.type === "PURCHASE" ? { buyerCompanyId: target.companyId } : { sellerCompanyId: target.companyId }),
        createdAt: createdAtWhere({ month: target.month }),
      },
    });
    const actualValue = money(actualInvoices.reduce((sum, invoice) => sum.plus(invoice.subtotal), new Prisma.Decimal(0)));
    const plannedValue = money(target.amount);
    rows.push({
      companyId: target.companyId,
      companyName: target.company.name,
      month: target.month,
      type: target.type,
      plannedValue,
      actualValue,
      variance: money(actualValue.minus(plannedValue)),
      achievementPercent: plannedValue.gt(0) ? Number(actualValue.div(plannedValue).mul(100).toDecimalPlaces(2)) : 0,
      invoiceCount: actualInvoices.length,
    });
  }
  return { rows };
}

export async function getAuditReport(input: ReportInput = {}) {
  const createdAt = createdAtWhere(input);
  const [agentLogs, emailLogs, invoices] = await Promise.all([
    prisma.agentAuditLog.findMany({ where: createdAt ? { createdAt } : undefined, orderBy: { createdAt: "desc" } }),
    prisma.emailLog.findMany({ where: createdAt ? { createdAt } : undefined, orderBy: { createdAt: "desc" } }),
    prisma.invoice.findMany({
      where: createdAt ? { createdAt } : undefined,
      include: { buyerCompany: true, sellerCompany: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const events = [
    ...agentLogs.map((log) => ({
      id: log.id,
      date: log.createdAt,
      type: "AGENT_STEP",
      status: log.status,
      title: log.step,
      detail: log.message,
      failureReason: log.status === "ERROR" ? log.message : null,
    })),
    ...emailLogs.map((log) => ({
      id: log.id,
      date: log.createdAt,
      type: "EMAIL_SENT",
      status: log.status,
      title: log.subject,
      detail: `${log.fromEmail} -> ${log.toEmail}`,
      failureReason: log.status === "FAILED" || log.status === "ERROR" ? log.body : null,
    })),
    ...invoices.map((invoice) => ({
      id: invoice.id,
      date: invoice.createdAt,
      type: "INVOICE_GENERATED",
      status: invoice.status,
      title: invoice.invoiceNumber,
      detail: `${invoice.sellerCompany.name} -> ${invoice.buyerCompany.name} | AED ${invoice.total.toFixed(2)}`,
      failureReason: null,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return { events };
}

export async function getAllReports(input: ReportInput = {}) {
  const [purchase, sales, profit, stock, targetAchievement, audit] = await Promise.all([
    getPurchaseReport(input),
    getSalesReport(input),
    getProfitReport(input),
    getStockReport(input),
    getTargetAchievementReport(input),
    getAuditReport(input),
  ]);
  return { purchase, sales, profit, stock, targetAchievement, audit };
}
