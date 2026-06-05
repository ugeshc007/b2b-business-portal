import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";

type WorksheetRow = Record<string, unknown>;

export type BusinessPlanCompanyPreview = {
  index: string;
  name: string;
  email?: string;
  address?: string;
  productSpecification?: string;
  priceRule?: string;
  customerRule?: string;
  vendorRule?: string;
  bank: {
    status?: string;
    companyName?: string;
    bankName?: string;
    beneficiaryName?: string;
    accountNumber?: string;
    iban?: string;
    branch?: string;
  };
  revenueTargetText?: string;
  revenueTargetMin?: number;
  revenueTargetMax?: number;
  invoiceRuleText?: string;
  invoiceCountMin?: number;
  invoiceCountMax?: number;
  invoiceValueHint?: string;
};

export type BusinessPlanProductPreview = {
  title: string;
  currency?: string;
  denomination?: number;
  denominationAed?: number;
  buyingPrice?: number;
  sellingPrice?: number;
  profit?: number;
  marginPercent?: number;
};

export type BusinessPlanImportPreview = {
  workbook: {
    sheetNames: string[];
    companySheetFound: boolean;
    productSheetFound: boolean;
    bankStatusSheetFound: boolean;
  };
  counts: {
    companies: number;
    products: number;
    bankStatusRows: number;
    warnings: number;
  };
  companies: BusinessPlanCompanyPreview[];
  products: BusinessPlanProductPreview[];
  bankStatusRows: Array<{ companyName: string; owner?: string; bankStatus?: string }>;
  warnings: string[];
  nextStep: string;
};

export type BusinessPlanProductImportResult = {
  created: number;
  updated: number;
  skipped: number;
  rows: Array<{
    sku: string;
    name: string;
    buyingPrice?: number;
    sellingPrice: number;
    status: "CREATED" | "UPDATED" | "SKIPPED";
    reason?: string;
  }>;
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanText(value).replace(/,/g, "");
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rowValue(row: WorksheetRow, header: string) {
  const headerKey = Object.keys(row).find((key) => key.trim().toLowerCase() === header.trim().toLowerCase());
  return headerKey ? row[headerKey] : undefined;
}

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function worksheetHeaders(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<WorksheetRow>(sheet, { defval: "", raw: false });
  if (!rows.length) return [];
  return Object.keys(rows[0]).map(normalizedHeader);
}

function findProductSheetName(workbook: XLSX.WorkBook) {
  const namedSheet = workbook.SheetNames.find((name) => name.toLowerCase().replace(/\s+/g, "") === "e.card");
  if (namedSheet) return namedSheet;
  return workbook.SheetNames.find((name) => {
    const headers = worksheetHeaders(workbook.Sheets[name]);
    return headers.includes("denominationtitle")
      && headers.includes("buying price")
      && headers.includes("selling price");
  });
}

function productSku(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

function parseCompanyNameCell(value: unknown) {
  const raw = String(value ?? "").trim();
  const emailMatch = raw.match(/email\s*:?\s*([^;\s]+@[^;\s]+)/i);
  const addressMatch = raw.match(/address\s*:?\s*([^;]+)/i);
  const beforeEmail = raw.split(/;\s*email\s*:?/i)[0] ?? raw;
  const beforeAddress = beforeEmail.split(/;\s*address\s*:?/i)[0] ?? beforeEmail;
  return {
    name: cleanText(beforeAddress.replace(/;$/g, "")),
    email: emailMatch?.[1]?.trim(),
    address: addressMatch ? cleanText(addressMatch[1]) : undefined,
  };
}

function parseBankDetails(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return {};
  if (!/company name|bank name|iban|account number|beneficiary/i.test(raw)) {
    return { status: cleanText(raw) };
  }

  const field = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = raw.match(new RegExp(`${escaped}\\s*:?\\s*([\\s\\S]*?)(?=\\n|\\r|\\s+Bank Name\\s*:|\\s+Beneficiary Account Name\\s*:|\\s+Account Number\\s*:|\\s+IBAN Number\\s*:|\\s+Branch\\s*:|$)`, "i"));
    return match ? cleanText(match[1]) : undefined;
  };

  return {
    companyName: field("Company Name"),
    bankName: field("Bank Name"),
    beneficiaryName: field("Beneficiary Account Name"),
    accountNumber: field("Account Number"),
    iban: field("IBAN Number"),
    branch: field("Branch"),
  };
}

function parseAmountRange(value: unknown) {
  const text = cleanText(value).toLowerCase();
  if (!text) return {};
  const normalized = text.replace(/million/g, "m").replace(/thousand/g, "k").replace(/,/g, "");
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(m|k)?/g)];
  const values = matches.map((match) => {
    const base = Number(match[1]);
    const suffix = match[2];
    if (suffix === "m") return base * 1_000_000;
    if (suffix === "k") return base * 1_000;
    return base;
  }).filter((item) => Number.isFinite(item));
  return {
    min: values[0],
    max: values.length > 1 ? values[1] : values[0],
  };
}

function parseInvoiceRule(value: unknown) {
  const text = cleanText(value);
  const countRange = text.match(/(\d+)\s*-\s*(\d+)\s*invoice/i);
  const singleCount = text.match(/(\d+)\s*invoice/i);
  const belowMatch = text.match(/below\s*([0-9,.]+)\s*k?/i);
  const totalMatch = text.match(/total[^0-9]*(?:should\s*be)?\s*([0-9,.]+\s*(?:k|m)?(?:\s*-\s*[0-9,.]+\s*(?:k|m)?)?)/i);
  return {
    countMin: countRange ? Number(countRange[1]) : singleCount ? Number(singleCount[1]) : undefined,
    countMax: countRange ? Number(countRange[2]) : singleCount ? Number(singleCount[1]) : undefined,
    valueHint: belowMatch ? `Per invoice below ${belowMatch[1]}${/k/i.test(belowMatch[0]) ? "K" : ""}` : totalMatch ? `Total ${totalMatch[1]}` : undefined,
  };
}

export function parseBusinessPlanWorkbook(buffer: Buffer): BusinessPlanImportPreview {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const warnings: string[] = [];
  const companySheetName = workbook.SheetNames.find((name) => name.toLowerCase() === "sheet1");
  const productSheetName = findProductSheetName(workbook);
  const bankStatusSheetName = workbook.SheetNames.find((name) => name.toLowerCase() === "sheet2");

  if (!companySheetName) warnings.push("Company/activity sheet named Sheet1 was not found.");
  if (!productSheetName) warnings.push("Product price sheet was not found. Expected E.CARD or headers DenominationTitle, BUYING PRICE, SELLING PRICE.");

  const companies: BusinessPlanCompanyPreview[] = [];
  if (companySheetName) {
    const rows = XLSX.utils.sheet_to_json<WorksheetRow>(workbook.Sheets[companySheetName], { defval: "" });
    for (const row of rows) {
      const index = cleanText(rowValue(row, "Index"));
      const companyCell = rowValue(row, "Company Name");
      const parsedCompany = parseCompanyNameCell(companyCell);
      if (!index && !parsedCompany.name) continue;
      const revenueText = cleanText(rowValue(row, "Revenue Target Details in AED/Month"));
      const revenue = parseAmountRange(revenueText);
      const invoiceText = cleanText(rowValue(row, "Targeted Number of Invoice /Week"));
      const invoice = parseInvoiceRule(invoiceText);
      const bank = parseBankDetails(rowValue(row, "Bank Account"));

      if (!parsedCompany.email) warnings.push(`Company row ${index || companies.length + 1}: email not detected.`);
      if (!parsedCompany.address) warnings.push(`Company row ${index || companies.length + 1}: address not detected.`);
      if (!revenue.min) warnings.push(`Company row ${index || companies.length + 1}: revenue target needs manual review.`);

      companies.push({
        index,
        name: parsedCompany.name,
        email: parsedCompany.email,
        address: parsedCompany.address,
        productSpecification: cleanText(rowValue(row, "Product specification")) || undefined,
        priceRule: cleanText(rowValue(row, "Price for Buying and Selling")) || undefined,
        customerRule: cleanText(rowValue(row, "Customer (B2B)")) || undefined,
        vendorRule: cleanText(rowValue(row, "Vendor (B2B)")) || undefined,
        bank,
        revenueTargetText: revenueText || undefined,
        revenueTargetMin: revenue.min,
        revenueTargetMax: revenue.max,
        invoiceRuleText: invoiceText || undefined,
        invoiceCountMin: invoice.countMin,
        invoiceCountMax: invoice.countMax,
        invoiceValueHint: invoice.valueHint,
      });
    }
  }

  const products: BusinessPlanProductPreview[] = [];
  if (productSheetName) {
    const rows = XLSX.utils.sheet_to_json<WorksheetRow>(workbook.Sheets[productSheetName], { defval: "" });
    for (const row of rows) {
      const title = cleanText(rowValue(row, "DenominationTitle"));
      if (!title) continue;
      products.push({
        title,
        currency: cleanText(rowValue(row, "Currency")) || undefined,
        denomination: numericValue(rowValue(row, "DENOMINATION")),
        denominationAed: numericValue(rowValue(row, "Denomination in AED")),
        buyingPrice: numericValue(rowValue(row, "BUYING PRICE")),
        sellingPrice: numericValue(rowValue(row, "SELLING PRICE")),
        profit: numericValue(rowValue(row, "PROFIT")),
        marginPercent: numericValue(rowValue(row, "%")),
      });
    }
  }

  const bankStatusRows: BusinessPlanImportPreview["bankStatusRows"] = [];
  if (bankStatusSheetName) {
    const rows = XLSX.utils.sheet_to_json<WorksheetRow>(workbook.Sheets[bankStatusSheetName], { defval: "" });
    for (const row of rows) {
      const companyName = cleanText(rowValue(row, "Company Name"));
      if (!companyName) continue;
      bankStatusRows.push({
        companyName,
        owner: cleanText(rowValue(row, "Owner")) || undefined,
        bankStatus: cleanText(rowValue(row, "Bank Account")) || undefined,
      });
    }
  }

  return {
    workbook: {
      sheetNames: workbook.SheetNames,
      companySheetFound: Boolean(companySheetName),
      productSheetFound: Boolean(productSheetName),
      bankStatusSheetFound: Boolean(bankStatusSheetName),
    },
    counts: {
      companies: companies.length,
      products: products.length,
      bankStatusRows: bankStatusRows.length,
      warnings: warnings.length,
    },
    companies,
    products,
    bankStatusRows,
    warnings,
    nextStep: "Review this preview. After approval, the next module can import companies, products, targets, and workflow rules into the database.",
  };
}

export async function importBusinessPlanProducts(buffer: Buffer): Promise<BusinessPlanProductImportResult> {
  const preview = parseBusinessPlanWorkbook(buffer);
  if (!preview.workbook.productSheetFound) throw new Error("Product price sheet was not found. Upload a product file with DenominationTitle, BUYING PRICE, and SELLING PRICE columns.");

  const result: BusinessPlanProductImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    rows: [],
  };
  const seenSkus = new Set<string>();

  for (const product of preview.products) {
    const sku = productSku(product.title);
    const sellingPrice = product.sellingPrice ?? product.denominationAed ?? product.buyingPrice;
    if (!sku || !sellingPrice || sellingPrice <= 0) {
      result.skipped += 1;
      result.rows.push({
        sku: sku || "-",
        name: product.title,
        buyingPrice: product.buyingPrice,
        sellingPrice: sellingPrice ?? 0,
        status: "SKIPPED",
        reason: "Missing valid selling price",
      });
      continue;
    }
    if (seenSkus.has(sku)) {
      result.skipped += 1;
      result.rows.push({
        sku,
        name: product.title,
        buyingPrice: product.buyingPrice,
        sellingPrice,
        status: "SKIPPED",
        reason: "Duplicate SKU in workbook",
      });
      continue;
    }
    seenSkus.add(sku);

    const existing = await prisma.item.findUnique({ where: { sku } });
    await prisma.item.upsert({
      where: { sku },
      update: {
        name: product.title,
        unit: "code",
        expectedPrice: new Prisma.Decimal(sellingPrice),
        minPrice: product.buyingPrice === undefined ? null : new Prisma.Decimal(product.buyingPrice),
        maxPrice: new Prisma.Decimal(sellingPrice),
        vatRate: new Prisma.Decimal(0.05),
        active: true,
      },
      create: {
        sku,
        name: product.title,
        unit: "code",
        expectedPrice: new Prisma.Decimal(sellingPrice),
        minPrice: product.buyingPrice === undefined ? undefined : new Prisma.Decimal(product.buyingPrice),
        maxPrice: new Prisma.Decimal(sellingPrice),
        vatRate: new Prisma.Decimal(0.05),
        active: true,
      },
    });

    if (existing) {
      result.updated += 1;
      result.rows.push({ sku, name: product.title, buyingPrice: product.buyingPrice, sellingPrice, status: "UPDATED" });
    } else {
      result.created += 1;
      result.rows.push({ sku, name: product.title, buyingPrice: product.buyingPrice, sellingPrice, status: "CREATED" });
    }
  }

  return result;
}
