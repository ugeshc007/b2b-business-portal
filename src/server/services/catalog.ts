import { Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db";

export async function createCompany(data: {
  name: string;
  legalName: string;
  role?: "BUYER" | "SELLER" | "BOTH";
  managedByCompanyId?: string;
  trn?: string;
  location: string;
  email: string;
  active?: boolean;
  vatEnabled?: boolean;
  logoPath?: string;
  bankName?: string;
  bankBeneficiaryName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankCid?: string;
  bankBranch?: string;
}) {
  if (data.managedByCompanyId) {
    const owner = await prisma.company.findUnique({ where: { id: data.managedByCompanyId } });
    if (!owner) throw new Error("Managed under company not found");
  }
  const exactExisting = await prisma.company.findUnique({ where: { email: data.email } })
    ?? await prisma.company.findFirst({ where: { OR: [{ name: data.name }, { legalName: data.legalName }] } });
  if (exactExisting) {
    return updateCompany(exactExisting.id, data);
  }
  return prisma.company.create({
    data: { ...data, managedByCompanyId: data.managedByCompanyId || null, active: data.active ?? true, vatEnabled: data.vatEnabled ?? true, role: data.role ?? "BOTH" },
  });
}

export async function updateCompany(companyId: string, data: {
  name: string;
  legalName: string;
  role?: "BUYER" | "SELLER" | "BOTH";
  managedByCompanyId?: string;
  trn?: string;
  location: string;
  email: string;
  active?: boolean;
  vatEnabled?: boolean;
  logoPath?: string;
  bankName?: string;
  bankBeneficiaryName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankCid?: string;
  bankBranch?: string;
}) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");
  if (data.managedByCompanyId === companyId) throw new Error("A company cannot be managed under itself");
  if (data.managedByCompanyId) {
    const owner = await prisma.company.findUnique({ where: { id: data.managedByCompanyId } });
    if (!owner) throw new Error("Managed under company not found");
  }

  return prisma.company.update({
    where: { id: companyId },
    data: {
      name: data.name,
      legalName: data.legalName,
      role: data.role ?? company.role,
      managedByCompanyId: data.managedByCompanyId || null,
      trn: data.trn || null,
      location: data.location,
      email: data.email,
      active: data.active,
      vatEnabled: data.vatEnabled,
      logoPath: data.logoPath,
      bankName: data.bankName || null,
      bankBeneficiaryName: data.bankBeneficiaryName || null,
      bankAccountNumber: data.bankAccountNumber || null,
      bankIban: data.bankIban || null,
      bankCid: data.bankCid || null,
      bankBranch: data.bankBranch || null,
    },
  });
}

export async function saveCompanyLogo(companyId: string, input: { mimeType: string; buffer: Buffer }) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");
  if (!input.buffer.length) throw new Error("Logo file is required");

  const extensionByMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const extension = extensionByMime[input.mimeType];
  if (!extension) throw new Error("Logo must be PNG, JPG, or WEBP");
  const isPng = input.buffer.length > 8 && input.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = input.buffer.length > 3 && input.buffer[0] === 0xff && input.buffer[1] === 0xd8 && input.buffer[2] === 0xff;
  const isWebp = input.buffer.length > 12 && input.buffer.toString("ascii", 0, 4) === "RIFF" && input.buffer.toString("ascii", 8, 12) === "WEBP";
  const signatureMatches = (extension === "png" && isPng) || (extension === "jpg" && isJpeg) || (extension === "webp" && isWebp);
  if (!signatureMatches) throw new Error("Logo file content does not match PNG, JPG, or WEBP format");

  const storageDir = path.resolve(process.cwd(), "storage", "company-logos");
  fs.mkdirSync(storageDir, { recursive: true });

  const safeCompanyId = companyId.replace(/[^a-zA-Z0-9_-]/g, "");
  const fileName = `${safeCompanyId}-${Date.now()}.${extension}`;
  const filePath = path.join(storageDir, fileName);
  fs.writeFileSync(filePath, input.buffer);

  if (company.logoPath?.startsWith("/uploads/company-logos/")) {
    const previousPath = path.join(storageDir, path.basename(company.logoPath));
    if (previousPath !== filePath && fs.existsSync(previousPath)) fs.unlinkSync(previousPath);
  }

  return prisma.company.update({
    where: { id: companyId },
    data: { logoPath: `/uploads/company-logos/${fileName}` },
  });
}

export async function deleteCompany(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");

  const [
    targetCount,
    requirementCount,
    quotationCount,
    orderCount,
    invoiceCount,
    emailLogCount,
    stockMovementCount,
  ] = await Promise.all([
    prisma.monthlyTarget.count({ where: { OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }] } }),
    prisma.requirement.count({ where: { OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }] } }),
    prisma.quotation.count({ where: { OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }] } }),
    prisma.purchaseOrder.count({ where: { OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }] } }),
    prisma.invoice.count({ where: { OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }] } }),
    prisma.emailLog.count({ where: { OR: [{ fromEmail: company.email }, { toEmail: company.email }] } }),
    prisma.stockMovement.count({ where: { companyId } }),
  ]);

  const historyCount = targetCount + requirementCount + quotationCount + orderCount + invoiceCount + emailLogCount + stockMovementCount;
  if (historyCount > 0) {
    throw new Error("Company has transaction history. Deactivate it instead.");
  }

  await prisma.$transaction([
    prisma.stockMovement.deleteMany({ where: { companyId } }),
    prisma.stock.deleteMany({ where: { companyId } }),
    prisma.emailIntegration.deleteMany({ where: { companyId } }),
    prisma.turnoverTarget.deleteMany({ where: { companyId } }),
    prisma.company.delete({ where: { id: companyId } }),
  ]);

  return { deleted: true };
}

export async function createItem(data: {
  sku: string;
  name: string;
  unit: string;
  expectedPrice: number;
  minPrice?: number;
  maxPrice?: number;
  vatRate?: number;
}) {
  return prisma.item.create({
    data: {
      ...data,
      expectedPrice: new Prisma.Decimal(data.expectedPrice),
      minPrice: data.minPrice === undefined ? undefined : new Prisma.Decimal(data.minPrice),
      maxPrice: data.maxPrice === undefined ? undefined : new Prisma.Decimal(data.maxPrice),
      vatRate: new Prisma.Decimal(data.vatRate ?? 0.05),
    },
  });
}

export async function setStock(companyId: string, itemId: string, quantity: number) {
  return prisma.stock.upsert({
    where: { companyId_itemId: { companyId, itemId } },
    update: { quantity },
    create: { companyId, itemId, quantity },
    include: { company: true, item: true },
  });
}

export async function deleteStock(stockId: string) {
  const stock = await prisma.stock.findUnique({ where: { id: stockId } });
  if (!stock) throw new Error("Stock row not found");
  await prisma.stock.delete({ where: { id: stockId } });
  return { deleted: true };
}

export async function bulkUpsertStock(input: {
  companyId: string;
  mode: "SET" | "ADD";
  rows: Array<{
    sku: string;
    name: string;
    unit?: string;
    quantity: number;
    expectedPrice?: number;
    maxPrice?: number;
  }>;
}) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company) throw new Error("Company not found");
  if (!input.rows.length) throw new Error("Bulk upload needs at least one row");

  const results = [];
  for (const row of input.rows) {
    const item = await prisma.item.upsert({
      where: { sku: row.sku },
      update: {
        name: row.name,
        unit: row.unit ?? "pcs",
        expectedPrice: row.expectedPrice === undefined ? undefined : new Prisma.Decimal(row.expectedPrice),
        maxPrice: row.maxPrice === undefined ? undefined : new Prisma.Decimal(row.maxPrice),
      },
      create: {
        sku: row.sku,
        name: row.name,
        unit: row.unit ?? "pcs",
        expectedPrice: new Prisma.Decimal(row.expectedPrice ?? 0.01),
        maxPrice: row.maxPrice === undefined ? undefined : new Prisma.Decimal(row.maxPrice),
        vatRate: new Prisma.Decimal(0.05),
      },
    });

    const stock = await prisma.stock.upsert({
      where: { companyId_itemId: { companyId: input.companyId, itemId: item.id } },
      update: input.mode === "ADD" ? { quantity: { increment: row.quantity } } : { quantity: row.quantity },
      create: { companyId: input.companyId, itemId: item.id, quantity: row.quantity },
      include: { company: true, item: true },
    });
    results.push(stock);
  }

  return { imported: results.length, rows: results };
}

export function parseStockCsv(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("sku,"))
    .map((line, index) => {
      const [sku, name, quantity, unit = "pcs", expectedPrice, maxPrice] = line.split(",").map((part) => part.trim());
      if (!sku || !name || !quantity) throw new Error(`Invalid stock row ${index + 1}`);
      const parsedQuantity = Number(quantity);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) throw new Error(`Invalid quantity on row ${index + 1}`);
      return {
        sku,
        name,
        quantity: parsedQuantity,
        unit,
        expectedPrice: expectedPrice ? Number(expectedPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
      };
    });
}

export function parsePurchaseInvoiceText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("sku,"))
    .map((line, index) => {
      const [sku, name, quantity, unitPrice] = line.split(",").map((part) => part.trim());
      if (!sku || !name || !quantity || !unitPrice) throw new Error(`Invalid invoice line ${index + 1}`);
      const parsedQuantity = Number(quantity);
      const parsedPrice = Number(unitPrice);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) throw new Error(`Invalid invoice quantity on line ${index + 1}`);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) throw new Error(`Invalid invoice price on line ${index + 1}`);
      return {
        sku,
        name,
        quantity: parsedQuantity,
        unit: "pcs",
        expectedPrice: parsedPrice,
        maxPrice: parsedPrice,
      };
    });
}

export async function listCatalog() {
  const [companies, items, stock] = await Promise.all([
    prisma.company.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.item.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.stock.findMany({ include: { company: true, item: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return { companies, items, stock };
}
