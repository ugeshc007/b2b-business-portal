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
    raw?: string;
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
  transactionPercent?: number;
  transactionAmountMin?: number;
  transactionAmountMax?: number;
  invoiceRuleText?: string;
  invoiceCountMin?: number;
  invoiceCountMax?: number;
  invoiceValueHint?: string;
};

export type BusinessPlanPartnerPreview = {
  name: string;
  role: "BUYER" | "SELLER" | "BOTH";
  allocationPercent?: number;
  address?: string;
  email?: string;
  bank?: BusinessPlanCompanyPreview["bank"];
};

export type BusinessPlanProductPreview = {
  sku: string;
  title: string;
  currency?: string;
  denomination?: number;
  conversionRate?: number;
  denominationAed?: number;
  buyingPrice?: number;
  sellingPrice?: number;
  profit?: number;
  marginPercent?: number;
};

export type BusinessPlanMissingDataItem = {
  section: "COMPANY" | "VENDOR" | "CUSTOMER" | "PRODUCT" | "PLAN";
  name: string;
  missing: string[];
  severity: "INFO" | "WARNING";
};

export type BusinessPlanFieldMapping = {
  source: "BUSINESS_PLAN" | "PRODUCT_PRICE";
  sheetName?: string;
  detected: boolean;
  columns: Array<{
    field: string;
    header?: string;
    status: "FOUND" | "MISSING" | "OPTIONAL";
  }>;
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
    purchaseVendors: number;
    salesCustomers: number;
    products: number;
    bankStatusRows: number;
    warnings: number;
    checklistItems: number;
  };
  scenario?: {
    mainCompany?: BusinessPlanCompanyPreview;
    purchasePlan?: BusinessPlanCompanyPreview;
    salesPlan?: BusinessPlanCompanyPreview;
    purchaseVendors: BusinessPlanPartnerPreview[];
    salesCustomers: BusinessPlanPartnerPreview[];
    salesAllocations: BusinessPlanPartnerPreview[];
    partnerBanks: Array<{ companyName: string; bank: BusinessPlanCompanyPreview["bank"] }>;
  };
  companies: BusinessPlanCompanyPreview[];
  products: BusinessPlanProductPreview[];
  fieldMappings: BusinessPlanFieldMapping[];
  missingDataChecklist: BusinessPlanMissingDataItem[];
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
    currency?: string;
    denomination?: number;
    conversionRate?: number;
    denominationAed?: number;
    buyingPrice?: number;
    profit?: number;
    marginPercent?: number;
    sellingPrice: number;
    status: "CREATED" | "UPDATED" | "SKIPPED";
    reason?: string;
  }>;
};

export type BusinessPlanScenarioImportResult = {
  company: "CREATED" | "UPDATED" | "SKIPPED";
  partnersCreated: number;
  partnersUpdated: number;
  turnoverTargetsCreated: number;
  turnoverTargetsUpdated: number;
  rulesSaved: number;
  rows: Array<{
    type: "COMPANY" | "VENDOR" | "CUSTOMER" | "TURNOVER_TARGET" | "BUSINESS_RULE";
    name: string;
    status: "CREATED" | "UPDATED" | "SAVED" | "SKIPPED";
    detail?: string;
  }>;
};

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanMultilineText(value: unknown) {
  return String(value ?? "").replace(/\r/g, "").trim();
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

function rowHeader(row: WorksheetRow, header: string) {
  return Object.keys(row).find((key) => key.trim().toLowerCase() === header.trim().toLowerCase());
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

function buildFieldMapping(source: BusinessPlanFieldMapping["source"], sheetName: string | undefined, sheet: XLSX.WorkSheet | undefined, fields: Array<{ field: string; headers: string[]; required?: boolean }>): BusinessPlanFieldMapping {
  const rows = sheet ? XLSX.utils.sheet_to_json<WorksheetRow>(sheet, { defval: "", raw: false }) : [];
  const firstRow = rows[0] ?? {};
  return {
    source,
    sheetName,
    detected: Boolean(sheetName && sheet),
    columns: fields.map((field) => {
      const header = field.headers.map((candidate) => rowHeader(firstRow, candidate)).find(Boolean);
      return {
        field: field.field,
        header,
        status: header ? "FOUND" : field.required ? "MISSING" : "OPTIONAL",
      };
    }),
  };
}

function addMissingData(checklist: BusinessPlanMissingDataItem[], item: BusinessPlanMissingDataItem) {
  if (item.missing.length) checklist.push(item);
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

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48) || "business-partner";
}

function normalizeIdentity(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(l\.?l\.?c|llc|w\.?l\.?l|s\.?p\.?s|fze|branch|trading|electronic|electronics)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fallbackEmail(name: string) {
  return `${slug(name)}@business-plan.local`;
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

function parseNamedContact(value: unknown) {
  const raw = cleanMultilineText(value).replace(/^\s*\d+\s*,\s*/i, "").trim();
  if (!raw) return undefined;
  const emailMatch = raw.match(/([^\s;]+@[^\s;]+)/);
  const addressMatch = raw.match(/address\s*:?\s*([\s\S]*?)(?=$|;|\n\s*\d+\s*,)/i);
  const name = cleanText(raw
    .replace(/address\s*:?\s*[\s\S]*$/i, "")
    .replace(emailMatch?.[1] ?? "", "")
    .replace(/[;,\s]+$/g, ""));
  return {
    name,
    email: emailMatch?.[1],
    address: addressMatch ? cleanText(addressMatch[1]) : undefined,
  };
}

function splitNumberedList(value: unknown) {
  const raw = cleanMultilineText(value);
  if (!raw) return [];
  return raw
    .split(/\n\s*\n+|(?=\s+\d{1,2}\s*,)|(?=\n\s*\d{1,2}\s*,)/g)
    .map((entry) => cleanMultilineText(entry))
    .filter(Boolean);
}

function parsePartnerList(value: unknown, role: "BUYER" | "SELLER") {
  const partners: BusinessPlanPartnerPreview[] = [];
  for (const entry of splitNumberedList(value)) {
    const parsed = parseNamedContact(entry);
    if (parsed?.name) partners.push({ name: parsed.name, email: parsed.email, address: parsed.address, role });
  }
  return partners;
}

function parseAllocationList(value: unknown, role: "BUYER" | "SELLER") {
  const raw = cleanMultilineText(value);
  if (!raw) return [];
  const entries: BusinessPlanPartnerPreview[] = [];

  if (/^\s*\d+\s*,/i.test(raw)) {
    for (const line of splitNumberedList(raw)) {
      const normalizedLine = line.replace(/^\s*\d+\s*,\s*/i, "");
      const match = normalizedLine.match(/^(.*?)(?:purchase|sales)?\s*(\d+(?:\.\d+)?)\s*%/i);
      const name = cleanText(match?.[1] ?? "").replace(/\s+(purchase|sales)$/i, "").replace(/[;,\s]+$/g, "");
      if (match && name) entries.push({ name, role, allocationPercent: Number(match[2]) });
    }
    return entries;
  }

  for (const match of raw.matchAll(/(\d+(?:\.\d+)?)\s*%\s*(?:purchase|sales)?\s*(?:on)?\s*([^,\n]+)/gi)) {
    const name = cleanText(match[2]);
    if (name) entries.push({ name, role, allocationPercent: Number(match[1]) });
  }

  if (entries.length) return entries;
  for (const line of splitNumberedList(raw)) {
    const normalizedLine = line.replace(/^\s*\d+\s*,\s*/i, "");
    const match = normalizedLine.match(/^(.*?)(?:purchase|sales)?\s*(\d+(?:\.\d+)?)\s*%/i);
    const name = cleanText(match?.[1] ?? "").replace(/[;,\s]+$/g, "");
    if (match && name) entries.push({ name, role, allocationPercent: Number(match[2]) });
  }
  return entries;
}

async function upsertCompanyFromPlan(input: {
  name: string;
  email?: string;
  address?: string;
  role: "BUYER" | "SELLER" | "BOTH";
  managedByCompanyId?: string;
  bank?: BusinessPlanCompanyPreview["bank"];
}) {
  const email = input.email || fallbackEmail(input.name);
  const exactExisting = await prisma.company.findUnique({ where: { email } })
    ?? await prisma.company.findFirst({ where: { OR: [{ name: input.name }, { legalName: input.name }] } });
  const existing = exactExisting ?? (await prisma.company.findMany({
    select: { id: true, name: true, legalName: true },
  })).find((company) => {
    const inputIdentity = normalizeIdentity(input.name);
    return inputIdentity
      && (normalizeIdentity(company.name) === inputIdentity || normalizeIdentity(company.legalName) === inputIdentity);
  });
  const data = {
    name: input.name,
    legalName: input.name,
    role: input.role,
    managedByCompanyId: input.managedByCompanyId,
    location: input.address || "Address pending",
    email,
    active: true,
    bankName: input.bank?.bankName ?? null,
    bankBeneficiaryName: input.bank?.beneficiaryName ?? null,
    bankAccountNumber: input.bank?.accountNumber ?? null,
    bankIban: input.bank?.iban ?? null,
    bankBranch: input.bank?.branch ?? null,
  };
  if (existing) {
    return {
      status: "UPDATED" as const,
      company: await prisma.company.update({
        where: { id: existing.id },
        data,
      }),
    };
  }
  return {
    status: "CREATED" as const,
    company: await prisma.company.create({ data }),
  };
}

async function updateExistingCompanyFromPlan(companyId: string, plan: BusinessPlanCompanyPreview) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Selected company was not found. Choose an active company and try again.");

  return prisma.company.update({
    where: { id: companyId },
    data: {
      legalName: plan.name || company.legalName,
      role: "BOTH",
      location: plan.address || company.location,
      email: plan.email || company.email,
      active: true,
      bankName: plan.bank.bankName ?? company.bankName,
      bankBeneficiaryName: plan.bank.beneficiaryName ?? company.bankBeneficiaryName,
      bankAccountNumber: plan.bank.accountNumber ?? company.bankAccountNumber,
      bankIban: plan.bank.iban ?? company.bankIban,
      bankBranch: plan.bank.branch ?? company.bankBranch,
    },
  });
}

function mergePartnerRole(current: "BUYER" | "SELLER" | "BOTH" | null | undefined, next: "BUYER" | "SELLER" | "BOTH") {
  if (next === "BOTH") return "BOTH";
  if (!current || current === next) return next;
  return "BOTH";
}

function parseBankDetails(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return {};
  if (!/company name|bank name|iban|account number|beneficiary/i.test(raw)) {
    return { raw, status: cleanText(raw) };
  }

  const field = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = raw.match(new RegExp(`${escaped}\\s*:?\\s*([\\s\\S]*?)(?=\\n|\\r|\\s+Bank Name\\s*:|\\s+Beneficiary Account Name\\s*:|\\s+Account Number\\s*:|\\s+IBAN Number\\s*:|\\s+Branch\\s*:|$)`, "i"));
    return match ? cleanText(match[1]) : undefined;
  };

  return {
    raw,
    companyName: field("Company Name"),
    bankName: field("Bank Name"),
    beneficiaryName: field("Beneficiary Account Name"),
    accountNumber: field("Account Number"),
    iban: field("IBAN Number"),
    branch: field("Branch"),
  };
}

function parseBankDetailBlocks(value: unknown) {
  const raw = cleanMultilineText(value);
  if (!raw) return [];
  const blocks: Array<{ companyName: string; bank: BusinessPlanCompanyPreview["bank"] }> = [];
  for (const block of raw
    .split(/(?=Company Name\s*:)/gi)
    .map((block) => block.trim())
    .filter((block) => /company name\s*:/i.test(block))) {
    const bank = parseBankDetails(block);
    if (bank.companyName) blocks.push({ companyName: bank.companyName, bank });
  }
  return blocks;
}

function normalizeCompanyMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(l\.?l\.?c|w\.?l\.?l|s\.?p\.?s|fze|llc|branch|dubai|auh|abu dhabi|bahrain|uae)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findBankForPartner(name: string, partnerBanks: Array<{ companyName: string; bank: BusinessPlanCompanyPreview["bank"] }>) {
  const normalizedName = normalizeCompanyMatch(name);
  return partnerBanks.find((entry) => {
    const normalizedBankName = normalizeCompanyMatch(entry.companyName);
    return normalizedName === normalizedBankName
      || normalizedName.includes(normalizedBankName)
      || normalizedBankName.includes(normalizedName);
  })?.bank;
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

function parseTransactionPercent(value: unknown) {
  const text = cleanText(value);
  const match = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?\(?\s*revenue\s+target/i);
  if (!match) return undefined;
  const percent = Number(match[1]);
  return Number.isFinite(percent) ? percent / 100 : undefined;
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
  const companySheetName = workbook.SheetNames.find((name) => {
    const normalized = name.toLowerCase().replace(/\s+/g, "");
    if (normalized === "sheet1" || normalized === "businessplan") return true;
    const headers = worksheetHeaders(workbook.Sheets[name]);
    return headers.includes("plan")
      && headers.includes("company name")
      && headers.includes("vendor (b2b)");
  });
  const productSheetName = findProductSheetName(workbook);
  const bankStatusSheetName = workbook.SheetNames.find((name) => name.toLowerCase() === "sheet2");
  const fieldMappings = [
    buildFieldMapping("BUSINESS_PLAN", companySheetName, companySheetName ? workbook.Sheets[companySheetName] : undefined, [
      { field: "Plan Type", headers: ["Plan"], required: false },
      { field: "Company Name / Email / Address", headers: ["Company Name"], required: true },
      { field: "Product Specification", headers: ["Product specification"], required: false },
      { field: "Price Rule", headers: ["Price for Buying and Selling"], required: false },
      { field: "Customer List", headers: ["Customer (B2B)"], required: false },
      { field: "Vendor List", headers: ["Vendor (B2B)"], required: false },
      { field: "Bank Account", headers: ["Bank Account", "Bank Account of Company"], required: false },
      { field: "Revenue Target", headers: ["Revenue Target Details in AED/Month"], required: false },
      { field: "Invoice Rule", headers: ["Targeted Number of Invoice /Week"], required: false },
    ]),
    buildFieldMapping("PRODUCT_PRICE", productSheetName, productSheetName ? workbook.Sheets[productSheetName] : undefined, [
      { field: "Product Name", headers: ["DenominationTitle"], required: true },
      { field: "Currency", headers: ["Currency"], required: false },
      { field: "Denomination", headers: ["DENOMINATION"], required: false },
      { field: "Conversion", headers: ["Conversion", "Coversion"], required: false },
      { field: "Denomination AED", headers: ["Denomination in AED"], required: false },
      { field: "Buying Price", headers: ["BUYING PRICE"], required: true },
      { field: "Profit", headers: ["PROFIT"], required: false },
      { field: "Margin %", headers: ["%"], required: false },
      { field: "Selling Price", headers: ["SELLING PRICE"], required: true },
    ]),
  ];

  if (!companySheetName) warnings.push("Company/activity sheet named Sheet1 or Business Plan was not found.");

  const companies: BusinessPlanCompanyPreview[] = [];
  if (companySheetName) {
    const rows = XLSX.utils.sheet_to_json<WorksheetRow>(workbook.Sheets[companySheetName], { defval: "" });
    for (const row of rows) {
      const index = cleanText(rowValue(row, "Index"));
      const planType = cleanText(rowValue(row, "Plan"));
      const companyCell = rowValue(row, "Company Name");
      const parsedCompany = parseCompanyNameCell(companyCell);
      if (!index && !parsedCompany.name) continue;
      const revenueText = cleanText(rowValue(row, "Revenue Target Details in AED/Month"));
      const revenue = parseAmountRange(revenueText);
      const invoiceText = cleanText(rowValue(row, "Targeted Number of Invoice /Week"));
      const invoice = parseInvoiceRule(invoiceText);
      const bank = parseBankDetails(rowValue(row, "Bank Account") || rowValue(row, "Bank Account of Company"));
      const productSpecification = cleanText(rowValue(row, "Product specification")) || undefined;
      const customerRule = cleanText(rowValue(row, "Customer (B2B)")) || undefined;
      const vendorRule = cleanText(rowValue(row, "Vendor (B2B)")) || undefined;
      const transactionPercent = parseTransactionPercent(productSpecification);
      const transactionAmountMin = transactionPercent && revenue.min ? revenue.min * transactionPercent : revenue.min;
      const transactionAmountMax = transactionPercent && revenue.max ? revenue.max * transactionPercent : revenue.max;
      const needsRevenueTarget = /purchase/i.test(planType)
        || (!planType && !customerRule && /purchase/i.test(productSpecification ?? ""));

      if (!parsedCompany.email) warnings.push(`Company row ${index || companies.length + 1}: email not detected.`);
      if (!parsedCompany.address) warnings.push(`Company row ${index || companies.length + 1}: address not detected.`);
      if (needsRevenueTarget && !revenue.min) warnings.push(`Company row ${index || companies.length + 1}: purchase revenue target needs manual review.`);

      companies.push({
        index,
        name: parsedCompany.name,
        email: parsedCompany.email,
        address: parsedCompany.address,
        productSpecification,
        priceRule: cleanText(rowValue(row, "Price for Buying and Selling")) || undefined,
        customerRule,
        vendorRule,
        bank,
        revenueTargetText: revenueText || undefined,
        revenueTargetMin: revenue.min,
        revenueTargetMax: revenue.max,
        transactionPercent,
        transactionAmountMin,
        transactionAmountMax,
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
        sku: productSku(title),
        title,
        currency: cleanText(rowValue(row, "Currency")) || undefined,
        denomination: numericValue(rowValue(row, "DENOMINATION")),
        conversionRate: numericValue(rowValue(row, "Conversion")) ?? numericValue(rowValue(row, "Coversion")),
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

  const purchasePlan = companies.find((company) => company.index || /purchase/i.test(company.productSpecification ?? ""));
  const salesPlan = companies.find((company) => /sales/i.test(company.productSpecification ?? "") || Boolean(company.customerRule && !company.revenueTargetMin));
  const mainCompany = purchasePlan ?? salesPlan ?? companies[0];
  const partnerBanks = [
    ...parseBankDetailBlocks(purchasePlan?.bank.raw),
    ...parseBankDetailBlocks(salesPlan?.bank.raw),
  ];
  const purchaseVendors = parseAllocationList(purchasePlan?.vendorRule, "SELLER");
  const salesCustomers = parsePartnerList(salesPlan?.customerRule, "BUYER").map((partner) => ({
    ...partner,
    bank: findBankForPartner(partner.name, partnerBanks),
  }));
  const salesAllocations = parseAllocationList(salesPlan?.vendorRule, "BUYER");
  const scenario = mainCompany ? {
    mainCompany,
    purchasePlan,
    salesPlan,
    purchaseVendors,
    salesCustomers,
    salesAllocations,
    partnerBanks,
  } : undefined;
  const missingDataChecklist: BusinessPlanMissingDataItem[] = [];
  if (scenario?.mainCompany) {
    addMissingData(missingDataChecklist, {
      section: "COMPANY",
      name: scenario.mainCompany.name,
      missing: [
        !scenario.mainCompany.email ? "email" : "",
        !scenario.mainCompany.address ? "address" : "",
        !(scenario.mainCompany.bank.bankName || scenario.mainCompany.bank.iban || scenario.mainCompany.bank.accountNumber) ? "bank details" : "",
      ].filter(Boolean),
      severity: "WARNING",
    });
  }
  for (const vendor of scenario?.purchaseVendors ?? []) {
    addMissingData(missingDataChecklist, {
      section: "VENDOR",
      name: vendor.name,
      missing: [
        !vendor.email ? "email" : "",
        !vendor.address ? "address" : "",
        !(vendor.bank?.bankName || vendor.bank?.iban || vendor.bank?.accountNumber) ? "bank details" : "",
      ].filter(Boolean),
      severity: "INFO",
    });
  }
  for (const customer of scenario?.salesCustomers ?? []) {
    addMissingData(missingDataChecklist, {
      section: "CUSTOMER",
      name: customer.name,
      missing: [
        !customer.email ? "email" : "",
        !customer.address ? "address" : "",
        !(customer.bank?.bankName || customer.bank?.iban || customer.bank?.accountNumber) ? "bank details" : "",
      ].filter(Boolean),
      severity: "INFO",
    });
  }
  for (const product of products) {
    addMissingData(missingDataChecklist, {
      section: "PRODUCT",
      name: product.title,
      missing: [
        !product.buyingPrice ? "buying price" : "",
        !product.sellingPrice ? "selling price" : "",
      ].filter(Boolean),
      severity: "WARNING",
    });
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
      purchaseVendors: purchaseVendors.length,
      salesCustomers: salesCustomers.length,
      products: products.length,
      bankStatusRows: bankStatusRows.length,
      warnings: warnings.length,
      checklistItems: missingDataChecklist.length,
    },
    scenario,
    companies,
    products,
    fieldMappings,
    missingDataChecklist,
    bankStatusRows,
    warnings,
    nextStep: productSheetName
      ? "Review this preview. Import Scenario will load companies, partners, targets, and allocation rules. Import Products will load product prices from this workbook."
      : "Review this preview. Import Scenario will load companies, partners, targets, and allocation rules using existing products already in the system.",
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
        currency: product.currency,
        denomination: product.denomination,
        conversionRate: product.conversionRate,
        denominationAed: product.denominationAed,
        buyingPrice: product.buyingPrice,
        profit: product.profit,
        marginPercent: product.marginPercent,
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
        currency: product.currency,
        denomination: product.denomination,
        conversionRate: product.conversionRate,
        denominationAed: product.denominationAed,
        buyingPrice: product.buyingPrice,
        profit: product.profit,
        marginPercent: product.marginPercent,
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
        currency: product.currency ?? null,
        denomination: product.denomination === undefined ? null : new Prisma.Decimal(product.denomination),
        conversionRate: product.conversionRate === undefined ? null : new Prisma.Decimal(product.conversionRate),
        denominationAed: product.denominationAed === undefined ? null : new Prisma.Decimal(product.denominationAed),
        buyingPrice: product.buyingPrice === undefined ? null : new Prisma.Decimal(product.buyingPrice),
        profit: product.profit === undefined ? null : new Prisma.Decimal(product.profit),
        marginPercent: product.marginPercent === undefined ? null : new Prisma.Decimal(product.marginPercent),
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
        currency: product.currency,
        denomination: product.denomination === undefined ? undefined : new Prisma.Decimal(product.denomination),
        conversionRate: product.conversionRate === undefined ? undefined : new Prisma.Decimal(product.conversionRate),
        denominationAed: product.denominationAed === undefined ? undefined : new Prisma.Decimal(product.denominationAed),
        buyingPrice: product.buyingPrice === undefined ? undefined : new Prisma.Decimal(product.buyingPrice),
        profit: product.profit === undefined ? undefined : new Prisma.Decimal(product.profit),
        marginPercent: product.marginPercent === undefined ? undefined : new Prisma.Decimal(product.marginPercent),
        vatRate: new Prisma.Decimal(0.05),
        active: true,
      },
    });

    if (existing) {
      result.updated += 1;
      result.rows.push({ sku, name: product.title, currency: product.currency, denomination: product.denomination, conversionRate: product.conversionRate, denominationAed: product.denominationAed, buyingPrice: product.buyingPrice, profit: product.profit, marginPercent: product.marginPercent, sellingPrice, status: "UPDATED" });
    } else {
      result.created += 1;
      result.rows.push({ sku, name: product.title, currency: product.currency, denomination: product.denomination, conversionRate: product.conversionRate, denominationAed: product.denominationAed, buyingPrice: product.buyingPrice, profit: product.profit, marginPercent: product.marginPercent, sellingPrice, status: "CREATED" });
    }
  }

  return result;
}

export async function importBusinessPlanScenario(buffer: Buffer, options: { companyId?: string } = {}): Promise<BusinessPlanScenarioImportResult> {
  const preview = parseBusinessPlanWorkbook(buffer);
  if (!preview.scenario?.mainCompany?.name) throw new Error("Business plan main company was not detected. Preview the file and check the Company Name column.");

  const result: BusinessPlanScenarioImportResult = {
    company: "SKIPPED",
    partnersCreated: 0,
    partnersUpdated: 0,
    turnoverTargetsCreated: 0,
    turnoverTargetsUpdated: 0,
    rulesSaved: 0,
    rows: [],
  };

  const main = preview.scenario.mainCompany;
  const mainUpsert = options.companyId
    ? { status: "UPDATED" as const, company: await updateExistingCompanyFromPlan(options.companyId, main) }
    : await upsertCompanyFromPlan({
        name: main.name,
        email: main.email,
        address: main.address,
        role: "BOTH",
        bank: main.bank,
      });
  const mainCompany = mainUpsert.company;
  result.company = mainUpsert.status;
  result.rows.push({
    type: "COMPANY",
    name: mainCompany.name,
    status: result.company,
    detail: options.companyId
      ? `Selected existing company. Excel company: ${main.name}`
      : main.email || mainCompany.email,
  });

  const partnerByName = new Map<string, BusinessPlanPartnerPreview>();
  for (const partner of [...preview.scenario.purchaseVendors, ...preview.scenario.salesCustomers, ...preview.scenario.salesAllocations]) {
    const key = partner.name.toLowerCase();
    const existing = partnerByName.get(key);
    partnerByName.set(key, existing ? { ...existing, ...partner, role: mergePartnerRole(existing.role, partner.role) } : partner);
  }

  for (const partner of partnerByName.values()) {
    const partnerIdentity = normalizeIdentity(partner.name);
    const mainIdentities = [
      normalizeIdentity(main.name),
      normalizeIdentity(mainCompany.name),
      normalizeIdentity(mainCompany.legalName),
    ].filter(Boolean);
    if (!partner.name || mainIdentities.includes(partnerIdentity)) continue;
    const upserted = await upsertCompanyFromPlan({
      name: partner.name,
      email: partner.email,
      address: partner.address,
      role: partner.role,
      managedByCompanyId: mainCompany.id,
      bank: partner.bank,
    });
    if (upserted.status === "CREATED") result.partnersCreated += 1;
    if (upserted.status === "UPDATED") result.partnersUpdated += 1;
    result.rows.push({
      type: partner.role === "SELLER" ? "VENDOR" : "CUSTOMER",
      name: partner.name,
      status: upserted.status,
      detail: partner.allocationPercent === undefined ? upserted.company.email : `${partner.allocationPercent}% allocation`,
    });
  }

  const month = new Date().toISOString().slice(0, 7);
  const targets = [
    { type: "PURCHASE", plan: preview.scenario.purchasePlan },
    { type: "SALES", plan: preview.scenario.salesPlan },
  ].filter((entry): entry is { type: string; plan: BusinessPlanCompanyPreview } => Boolean(entry.plan?.revenueTargetMin));

  for (const target of targets) {
    const targetAmount = target.plan.transactionAmountMin ?? target.plan.revenueTargetMin ?? 0;
    const targetNotes = [
      target.plan.invoiceRuleText,
      target.plan.productSpecification,
      target.plan.transactionPercent ? `Transaction amount uses ${(target.plan.transactionPercent * 100).toFixed(0)}% of revenue target.` : undefined,
    ].filter(Boolean).join(" | ");
    const existing = await prisma.turnoverTarget.findUnique({
      where: { companyId_type_month: { companyId: mainCompany.id, type: target.type, month } },
    });
    await prisma.turnoverTarget.upsert({
      where: { companyId_type_month: { companyId: mainCompany.id, type: target.type, month } },
      update: {
        amount: new Prisma.Decimal(targetAmount),
        notes: targetNotes || null,
      },
      create: {
        companyId: mainCompany.id,
        type: target.type,
        month,
        amount: new Prisma.Decimal(targetAmount),
        notes: targetNotes || undefined,
      },
    });
    if (existing) result.turnoverTargetsUpdated += 1;
    else result.turnoverTargetsCreated += 1;
    result.rows.push({
      type: "TURNOVER_TARGET",
      name: `${target.type} ${month}`,
      status: existing ? "UPDATED" : "CREATED",
      detail: target.plan.transactionPercent
        ? `AED ${targetAmount} (${(target.plan.transactionPercent * 100).toFixed(0)}% of AED ${target.plan.revenueTargetMin})`
        : `AED ${targetAmount}`,
    });
  }

  const importedAt = new Date().toISOString();
  const savedPlan = {
    importedAt,
    mainCompanyId: mainCompany.id,
    excelMainCompanyName: main.name,
    purchaseVendors: preview.scenario.purchaseVendors,
    salesCustomers: preview.scenario.salesCustomers,
    salesAllocations: preview.scenario.salesAllocations,
    purchasePlan: preview.scenario.purchasePlan,
    salesPlan: preview.scenario.salesPlan,
  };
  const planKey = `businessPlan:${mainCompany.id}:${Date.now()}`;

  await prisma.appSetting.create({
    data: {
      key: planKey,
      value: JSON.stringify({ ...savedPlan, planKey }),
      isSecret: false,
    },
  });

  await prisma.appSetting.upsert({
    where: { key: `businessPlan:${mainCompany.id}` },
    update: {
      value: JSON.stringify({ ...savedPlan, planKey: `businessPlan:${mainCompany.id}` }),
      isSecret: false,
    },
    create: {
      key: `businessPlan:${mainCompany.id}`,
      value: JSON.stringify({ ...savedPlan, planKey: `businessPlan:${mainCompany.id}` }),
      isSecret: false,
    },
  });
  result.rulesSaved = 1;
  result.rows.push({ type: "BUSINESS_RULE", name: "Allocation and invoice rules", status: "SAVED", detail: "Saved under app settings for agent planning." });

  return result;
}
