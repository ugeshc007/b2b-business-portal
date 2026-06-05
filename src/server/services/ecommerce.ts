import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { createStockMovement, itemSellingPrice } from "./stockLedger";

function money(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value).toDecimalPlaces(2);
}

export async function createEcommerceOrder(input: {
  buyerCompanyId: string;
  sellerCompanyId: string;
  itemId: string;
  quantity: number;
}) {
  if (input.buyerCompanyId === input.sellerCompanyId) throw new Error("Buyer and seller must be different companies");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be a positive whole number");

  const [buyer, seller, item, stock] = await Promise.all([
    prisma.company.findUnique({ where: { id: input.buyerCompanyId } }),
    prisma.company.findUnique({ where: { id: input.sellerCompanyId } }),
    prisma.item.findUnique({ where: { id: input.itemId } }),
    prisma.stock.findUnique({
      where: { companyId_itemId: { companyId: input.sellerCompanyId, itemId: input.itemId } },
    }),
  ]);

  if (!buyer || buyer.active === false) throw new Error("Active buyer company not found");
  if (!seller || seller.active === false) throw new Error("Active seller company not found");
  if (!item || item.active === false) throw new Error("Active product not found");
  if (!stock || stock.quantity - stock.reserved < input.quantity) throw new Error("Insufficient product stock");

  const unitPrice = itemSellingPrice(item);
  const vatRate = buyer.vatEnabled ? item.vatRate : new Prisma.Decimal(0);
  const subtotal = money(unitPrice.mul(input.quantity));
  const vatAmount = money(subtotal.mul(vatRate));
  const total = money(subtotal.plus(vatAmount));

  return prisma.$transaction(async (tx) => {
    await tx.stock.update({
      where: { companyId_itemId: { companyId: input.sellerCompanyId, itemId: input.itemId } },
      data: { quantity: { decrement: input.quantity } },
    });

    const order = await tx.ecommerceOrder.create({
      data: {
        buyerCompanyId: input.buyerCompanyId,
        sellerCompanyId: input.sellerCompanyId,
        itemId: input.itemId,
        quantity: input.quantity,
        unitPrice,
        vatRate,
        subtotal,
        vatAmount,
        total,
      },
      include: { buyerCompany: true, sellerCompany: true, item: true },
    });
    await createStockMovement(tx, {
      companyId: input.sellerCompanyId,
      itemId: input.itemId,
      type: "SALE",
      quantity: input.quantity,
      unitPrice,
      source: "ECOMMERCE_ORDER",
      reference: order.id,
      notes: `Sold to ${buyer.name}`,
    });
    return order;
  });
}

export async function markEcommerceOrderDelivered(orderId: string) {
  const order = await prisma.ecommerceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("Ecommerce order not found");
  if (order.status === "DELIVERED") {
    return prisma.ecommerceOrder.findUniqueOrThrow({
      where: { id: orderId },
      include: { buyerCompany: true, sellerCompany: true, item: true },
    });
  }

  return prisma.ecommerceOrder.update({
    where: { id: orderId },
    data: { status: "DELIVERED", deliveredAt: new Date() },
    include: { buyerCompany: true, sellerCompany: true, item: true },
  });
}
