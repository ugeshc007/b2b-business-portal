import { Prisma } from "@prisma/client";
import { prisma } from "../db";

type LedgerClient = typeof prisma | Prisma.TransactionClient;

type LedgerItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  expectedPrice: Prisma.Decimal;
  minPrice: Prisma.Decimal | null;
  buyingPrice: Prisma.Decimal | null;
  denominationAed: Prisma.Decimal | null;
};

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal.Value) {
  return decimal(value).toDecimalPlaces(2);
}

export function itemBuyingPrice(item: LedgerItem) {
  return money(item.buyingPrice ?? item.minPrice ?? item.denominationAed ?? item.expectedPrice);
}

export function itemSellingPrice(item: Pick<LedgerItem, "expectedPrice">) {
  return money(item.expectedPrice);
}

export async function createStockMovement(client: LedgerClient, input: {
  companyId: string;
  itemId: string;
  type: "PURCHASE" | "SALE" | "ADJUSTMENT";
  quantity: number;
  unitCost?: Prisma.Decimal.Value;
  unitPrice?: Prisma.Decimal.Value;
  source?: string;
  reference?: string;
  notes?: string;
}) {
  const quantity = Math.abs(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Stock movement quantity must be a positive whole number");
  const unitCost = input.unitCost === undefined ? undefined : money(input.unitCost);
  const unitPrice = input.unitPrice === undefined ? undefined : money(input.unitPrice);
  return client.stockMovement.create({
    data: {
      companyId: input.companyId,
      itemId: input.itemId,
      type: input.type,
      quantity,
      unitCost,
      unitPrice,
      purchaseValue: input.type === "PURCHASE" && unitCost ? money(unitCost.mul(quantity)) : new Prisma.Decimal(0),
      salesValue: input.type === "SALE" && unitPrice ? money(unitPrice.mul(quantity)) : new Prisma.Decimal(0),
      source: input.source,
      reference: input.reference,
      notes: input.notes,
    },
  });
}

export async function generateStockFromBusinessPlan(input: {
  companyId: string;
  month: string;
}) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company || company.active === false) throw new Error("Active company not found");
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error("Month must be YYYY-MM");

  const target = await prisma.turnoverTarget.findUnique({
    where: { companyId_type_month: { companyId: input.companyId, type: "PURCHASE", month: input.month } },
  });
  if (!target) throw new Error("Purchase turnover target not found for selected company and month");

  const items = await prisma.item.findMany({
    where: { active: true },
    orderBy: [{ sku: "asc" }],
  });
  const pricedItems = items
    .map((item) => ({ item, unitCost: itemBuyingPrice(item) }))
    .filter((row) => row.unitCost.gt(0));
  if (!pricedItems.length) throw new Error("No active product master rows with buying price found");

  const reference = `BUSINESS_PLAN_STOCK:${input.companyId}:${input.month}:PURCHASE`;
  const existing = await prisma.stockMovement.findMany({
    where: { source: "BUSINESS_PLAN", reference },
    include: { item: true },
  });
  if (existing.length) {
    throw new Error("Business plan stock already generated for this company and month. Flush stock movements or choose another month.");
  }

  const targetAmount = money(target.amount);
  const equalAllocation = targetAmount.div(pricedItems.length);
  const rows: Array<{
    item: typeof pricedItems[number]["item"];
    quantity: number;
    unitCost: Prisma.Decimal;
    purchaseValue: Prisma.Decimal;
  }> = [];
  let generatedPurchaseValue = new Prisma.Decimal(0);
  for (const { item, unitCost } of pricedItems) {
    const quantity = Math.floor(equalAllocation.div(unitCost).toNumber());
    if (quantity <= 0) continue;
    const purchaseValue = money(unitCost.mul(quantity));
    generatedPurchaseValue = generatedPurchaseValue.plus(purchaseValue);
    rows.push({ item, quantity, unitCost, purchaseValue });
  }
  if (!rows.length) throw new Error("Purchase target is too small for available product buying prices");

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.stock.upsert({
        where: { companyId_itemId: { companyId: input.companyId, itemId: row.item.id } },
        update: { quantity: { increment: row.quantity } },
        create: { companyId: input.companyId, itemId: row.item.id, quantity: row.quantity },
      });
      await createStockMovement(tx, {
        companyId: input.companyId,
        itemId: row.item.id,
        type: "PURCHASE",
        quantity: row.quantity,
        unitCost: row.unitCost,
        source: "BUSINESS_PLAN",
        reference,
        notes: `Generated from ${company.name} ${input.month} purchase target`,
      });
    }
  });

  return {
    generated: true,
    companyId: input.companyId,
    month: input.month,
    targetAmount,
    generatedPurchaseValue: money(generatedPurchaseValue),
    productCount: rows.length,
    totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    rows: rows.map((row) => ({
      itemId: row.item.id,
      sku: row.item.sku,
      name: row.item.name,
      quantity: row.quantity,
      unitCost: row.unitCost,
      purchaseValue: row.purchaseValue,
    })),
  };
}

export async function getStockMovementReport() {
  const [movements, stocks] = await Promise.all([
    prisma.stockMovement.findMany({
      include: { company: true, item: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.stock.findMany({ include: { company: true, item: true } }),
  ]);

  const rows = new Map<string, {
    companyId: string;
    companyName: string;
    itemId: string;
    sku: string;
    itemName: string;
    unit: string;
    buyingPrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    purchasedQuantity: number;
    soldQuantity: number;
    balanceQuantity: number;
    purchaseValue: Prisma.Decimal;
    salesValue: Prisma.Decimal;
    balanceBuyingValue: Prisma.Decimal;
    balanceSellingValue: Prisma.Decimal;
  }>();

  function ensure(company: { id: string; name: string }, item: LedgerItem) {
    const key = `${company.id}:${item.id}`;
    if (!rows.has(key)) {
      rows.set(key, {
        companyId: company.id,
        companyName: company.name,
        itemId: item.id,
        sku: item.sku,
        itemName: item.name,
        unit: item.unit,
        buyingPrice: itemBuyingPrice(item),
        sellingPrice: itemSellingPrice(item),
        purchasedQuantity: 0,
        soldQuantity: 0,
        balanceQuantity: 0,
        purchaseValue: new Prisma.Decimal(0),
        salesValue: new Prisma.Decimal(0),
        balanceBuyingValue: new Prisma.Decimal(0),
        balanceSellingValue: new Prisma.Decimal(0),
      });
    }
    return rows.get(key)!;
  }

  for (const movement of movements) {
    const row = ensure(movement.company, movement.item);
    if (movement.type === "PURCHASE") {
      row.purchasedQuantity += movement.quantity;
      row.purchaseValue = row.purchaseValue.plus(movement.purchaseValue);
    }
    if (movement.type === "SALE") {
      row.soldQuantity += movement.quantity;
      row.salesValue = row.salesValue.plus(movement.salesValue);
    }
  }

  for (const stock of stocks) {
    const row = ensure(stock.company, stock.item);
    row.balanceQuantity = stock.quantity;
  }

  return [...rows.values()].map((row) => ({
    ...row,
    purchaseValue: money(row.purchaseValue),
    salesValue: money(row.salesValue),
    balanceBuyingValue: money(row.buyingPrice.mul(row.balanceQuantity)),
    balanceSellingValue: money(row.sellingPrice.mul(row.balanceQuantity)),
  })).sort((a, b) => a.companyName.localeCompare(b.companyName) || a.sku.localeCompare(b.sku));
}
