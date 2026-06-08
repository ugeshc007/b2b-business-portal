import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Building2, ChevronDown, ChevronUp, Download, Edit, FileText, LogIn, Mail, Package, Play, Plus, RefreshCcw, Save, Send, Settings, ShieldCheck, ShoppingCart, Square, Trash2, Truck, X } from "lucide-react";
import { appDate, appDateTime, appMonthEnd, appMonthStart } from "../shared/timezone";
import "./styles.css";

const defaultApiUrl = window.location.port === "5321" ? "http://127.0.0.1:4321" : window.location.origin;
const apiUrl = import.meta.env.VITE_API_URL || defaultApiUrl;
const portalSlug = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
const portalCompanyName = ["dealz", "dealzarabia"].includes(portalSlug) ? "Dealzarabia" : portalSlug === "buy2day" ? "Buy2day" : "";
const isCompanyPortal = Boolean(portalCompanyName);
const workflowPageSize = 25;

type Company = {
  id: string;
  name: string;
  legalName: string;
  role?: "BUYER" | "SELLER" | "BOTH";
  managedByCompanyId?: string | null;
  managedByCompany?: { id: string; name: string; legalName: string } | null;
  email: string;
  location: string;
  trn?: string;
  active?: boolean;
  vatEnabled?: boolean;
  bankName?: string;
  bankBeneficiaryName?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankCid?: string;
  bankBranch?: string;
  logoPath?: string;
};
type Item = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  expectedPrice: string;
  minPrice?: string;
  maxPrice?: string;
  currency?: string;
  denomination?: string;
  conversionRate?: string;
  denominationAed?: string;
  buyingPrice?: string;
  profit?: string;
  marginPercent?: string;
};
type Stock = { id: string; quantity: number; company: Company; item: Item };
type StockMovementReportRow = {
  companyId: string;
  companyName: string;
  itemId: string;
  sku: string;
  itemName: string;
  unit: string;
  buyingPrice: string;
  sellingPrice: string;
  purchasedQuantity: number;
  soldQuantity: number;
  balanceQuantity: number;
  purchaseValue: string;
  salesValue: string;
  balanceBuyingValue: string;
  balanceSellingValue: string;
};
type Target = {
  id: string;
  month: string;
  targetDate?: string;
  periodType?: "MONTHLY" | "DAILY";
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: string;
  hourTo?: string;
  direction?: "PURCHASE" | "SALES";
  productMode?: "RANDOM" | "SELECTED";
  amountVolume?: string;
  documentValue?: string;
  invoiceNumber?: string | null;
  status: string;
  notes?: string;
  buyerCompany: Company;
  sellerCompany: Company;
  lines: Array<{ itemId: string; quantity: number; maxPrice?: string; item: Item }>;
};
type Invoice = { id: string; invoiceNumber: string; total: string; vatAmount: string; createdAt: string; buyerCompany: Company; sellerCompany: Company };
type InvoiceDetail = Invoice & {
  subtotal: string;
  createdAt: string;
  purchaseOrder: { poNumber: string };
  lines: Array<{ id: string; quantity: number; unitPrice: string; vatRate: string; lineTotal: string; item: Item }>;
};
type EmailLog = { id: string; fromEmail: string; toEmail: string; subject: string; status: string };
type EcommerceOrder = {
  id: string;
  quantity: number;
  unitPrice: string;
  vatAmount: string;
  total: string;
  status: string;
  createdAt: string;
  deliveredAt?: string;
  buyerCompany: Company;
  sellerCompany: Company;
  item: Item;
};
type AgentAuditLog = { id: string; targetId?: string; step: string; status: string; message: string; metadata?: string; createdAt: string };
type EmailIntegration = {
  id: string;
  companyId: string;
  provider: string;
  email: string;
  mode: "SIMULATION" | "DRAFT" | "LIVE";
  status: "DISCONNECTED" | "READY_TO_CONNECT" | "CONNECTED";
  lastTestAt?: string;
  company: Company;
};
type EmailConfigStatus = {
  provider: string;
  oauthConfigured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  tokenEncryptionConfigured: boolean;
  smtpConfigured: boolean;
  imapConfigured: boolean;
  redirectUri: string | null;
  source?: Record<string, string>;
  modeNote: string;
};
type Overview = {
  invoiceTotal: string;
  vatTotal: string;
  stockByCompany: Array<{ companyId: string; companyName: string; itemCount: number; totalQuantity: number }>;
  workflowByStatus: Record<string, number>;
  emailByStatus: Record<string, number>;
  gmailConnected: number;
  gmailConfigured: number;
  recentActivity: Array<{ id: string; type: string; title: string; status: string; date: string }>;
  lastUpdatedAt: string;
};
type TurnoverTarget = {
  id: string;
  companyId: string;
  type: string;
  month: string;
  amount: string;
  notes?: string;
  company: Company;
};
type ConfirmationToast = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  typedPhrase?: string;
  onConfirm: () => Promise<void>;
};
type SavedBusinessPlan = {
  planId: string;
  companyId: string;
  companyName: string;
  importedAt?: string;
  updatedAt?: string;
  parseError?: string | null;
  excelMainCompanyName?: string;
  mainCompanyId?: string;
  planPeriodDateFrom?: string;
  planPeriodDateTo?: string;
  purchaseVendors?: Array<{ name: string; role?: string; allocationPercent?: number; address?: string; email?: string }>;
  salesCustomers?: Array<{ name: string; role?: string; allocationPercent?: number; address?: string; email?: string; bank?: { bankName?: string; iban?: string; accountNumber?: string } }>;
  salesAllocations?: Array<{ name: string; role?: string; allocationPercent?: number; address?: string; email?: string }>;
  purchasePlan?: {
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
    productSpecification?: string;
    priceRule?: string;
  };
  salesPlan?: {
    revenueTargetText?: string;
    priceRule?: string;
    productSpecification?: string;
    invoiceRuleText?: string;
    invoiceCountMin?: number;
    invoiceCountMax?: number;
  };
};
type Summary = {
  counts: Record<string, number>;
  overview: Overview;
  companies: Company[];
  items: Item[];
  stock: Stock[];
  stockMovementReport: StockMovementReportRow[];
  targets: Target[];
  invoices: Invoice[];
  emails: EmailLog[];
  agentAuditLogs: AgentAuditLog[];
  emailIntegrations: EmailIntegration[];
  turnoverTargets: TurnoverTarget[];
  businessPlans: SavedBusinessPlan[];
  ecommerceOrders: EcommerceOrder[];
};

type ReportsData = {
  purchase: {
    vendorWise: Array<{ vendorId: string; vendorName: string; invoiceCount: number; quantity: number; subtotal: string; vatAmount: string; total: string }>;
    productWise: Array<{ itemId: string; sku: string; itemName: string; quantity: number; buyingValue: string; vatAmount: string }>;
    invoiceWise: Array<{ invoiceId: string; invoiceNumber: string; poNumber: string; date: string; buyerName: string; vendorName: string; subtotal: string; vatAmount: string; total: string }>;
  };
  sales: {
    customerWise: Array<{ customerId: string; customerName: string; invoiceCount: number; quantity: number; subtotal: string; vatAmount: string; total: string }>;
    productWise: Array<{ itemId: string; sku: string; itemName: string; quantity: number; sellingValue: string; vatAmount: string }>;
    invoiceWise: Array<{ invoiceId: string; invoiceNumber: string; poNumber: string; date: string; sellerName: string; customerName: string; subtotal: string; vatAmount: string; total: string }>;
  };
  profit: {
    rows: Array<{ companyId: string; companyName: string; sku: string; itemName: string; purchasedQuantity: number; soldQuantity: number; buyingValue: string; sellingValue: string; margin: string; marginPercent: number }>;
    vat: { inputVat: string; outputVat: string; netVat: string };
  };
  stock: {
    rows: Array<{ companyId: string; companyName: string; sku: string; itemName: string; opening: number; purchased: number; sold: number; closing: number; closingBuyingValue: string; closingSellingValue: string }>;
  };
  targetAchievement: {
    rows: Array<{ companyId: string; companyName: string; month: string; type: string; plannedValue: string; actualValue: string; variance: string; achievementPercent: number; invoiceCount: number }>;
  };
  audit: {
    events: Array<{ id: string; date: string; type: string; status: string; title: string; detail: string; failureReason?: string | null }>;
  };
};

type BusinessPlanPreview = {
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
    mainCompany?: BusinessPlanPreview["companies"][number];
    purchasePlan?: BusinessPlanPreview["companies"][number];
    salesPlan?: BusinessPlanPreview["companies"][number];
    purchaseVendors: Array<{ name: string; role: "BUYER" | "SELLER" | "BOTH"; allocationPercent?: number; address?: string; email?: string }>;
    salesCustomers: Array<{ name: string; role: "BUYER" | "SELLER" | "BOTH"; allocationPercent?: number; address?: string; email?: string; bank?: { bankName?: string; iban?: string; accountNumber?: string } }>;
    salesAllocations: Array<{ name: string; role: "BUYER" | "SELLER" | "BOTH"; allocationPercent?: number; address?: string; email?: string }>;
    partnerBanks: Array<{ companyName: string; bank: { bankName?: string; iban?: string; accountNumber?: string } }>;
  };
  companies: Array<{
    index: string;
    name: string;
    email?: string;
    address?: string;
    productSpecification?: string;
    priceRule?: string;
    customerRule?: string;
    vendorRule?: string;
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
    bank: {
      status?: string;
      bankName?: string;
      beneficiaryName?: string;
      accountNumber?: string;
      iban?: string;
      branch?: string;
    };
  }>;
  products: Array<{
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
  }>;
  fieldMappings: Array<{
    source: "BUSINESS_PLAN" | "PRODUCT_PRICE";
    sheetName?: string;
    detected: boolean;
    columns: Array<{ field: string; header?: string; status: "FOUND" | "MISSING" | "OPTIONAL" }>;
  }>;
  missingDataChecklist: Array<{
    section: "COMPANY" | "VENDOR" | "CUSTOMER" | "PRODUCT" | "PLAN";
    name: string;
    missing: string[];
    severity: "INFO" | "WARNING";
  }>;
  bankStatusRows: Array<{ companyName: string; owner?: string; bankStatus?: string }>;
  warnings: string[];
  nextStep: string;
};

type BusinessPlanProductImportResult = {
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

type BusinessPlanScenarioImportResult = {
  company: "CREATED" | "UPDATED" | "SKIPPED";
  companyId?: string;
  companyName?: string;
  planId?: string;
  planPeriodDateFrom?: string;
  planPeriodDateTo?: string;
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

type SystemLogEntry = {
  timestamp?: string;
  level?: string;
  event?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  message?: string;
};

type SystemLogResponse = {
  status: {
    logsDir: string;
    retentionDays: number;
    files: number;
    totalBytes: number;
  };
  logs: SystemLogEntry[];
  rawLogs: string[];
};

type FlushResult = {
  flushed: boolean;
  selectedCategories: string[];
  preserved: string[];
  deletedRecords: Record<string, number>;
  deletedFiles: Record<string, number>;
};

type FlushCategory = {
  key: string;
  title: string;
  description: string;
  dangerous?: boolean;
};

const flushCategoryOptions: FlushCategory[] = [
  {
    key: "transactions",
    title: "Transactions",
    description: "Workflow targets, requirements, quotations, purchase orders, invoices, and ecommerce/recharge orders.",
  },
  {
    key: "communicationLogs",
    title: "Communication Logs",
    description: "Email logs and agent audit logs.",
  },
  {
    key: "generatedFiles",
    title: "Generated Files",
    description: "Generated purchase order PDFs and invoice PDFs.",
  },
  {
    key: "applicationLogs",
    title: "Application Logs",
    description: "Daily request/response log files.",
  },
  {
    key: "businessTargets",
    title: "Business Targets",
    description: "Monthly turnover and business plan target entries.",
  },
  {
    key: "stock",
    title: "Stock Data",
    description: "All company stock balances and stock links.",
    dangerous: true,
  },
  {
    key: "productMaster",
    title: "Product Master",
    description: "Imported and manually created products/items.",
    dangerous: true,
  },
  {
    key: "companyData",
    title: "Company Data",
    description: "Company profiles, addresses, VAT settings, bank details, and uploaded company logos.",
    dangerous: true,
  },
  {
    key: "emailConfiguration",
    title: "Email Configuration",
    description: "SMTP/IMAP/OAuth settings and company email integration rows.",
    dangerous: true,
  },
  {
    key: "users",
    title: "Users",
    description: "Deletes extra users and keeps the first admin user for login safety.",
    dangerous: true,
  },
];

const defaultFlushCategoryKeys = ["transactions", "communicationLogs", "generatedFiles", "applicationLogs"];

type View = "overview" | "stock" | "ecommerce" | "workflow" | "invoices" | "reports" | "settings";

function money(value: string | number) {
  return `AED ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  const normalized = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  return `${normalized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function businessPlanPartnerLines(
  partners: Array<{ name: string; allocationPercent?: number; email?: string; address?: string }> = [],
  allocations?: Array<{ name: string; allocationPercent?: number }>
) {
  return partners.map((partner) => {
    const allocation = allocations?.find((entry) => entry.name.toLowerCase() === partner.name.toLowerCase());
    return [
      partner.name,
      allocation?.allocationPercent ?? partner.allocationPercent ?? "",
      partner.email ?? "",
      partner.address ?? "",
    ].join(" | ");
  }).join("\n");
}

function roleLabel(role?: Company["role"]) {
  if (role === "BUYER") return "Customer";
  if (role === "SELLER") return "Vendor";
  return "Customer & Vendor";
}

function canBeCustomer(company: Company) {
  return company.role === "BUYER" || company.role === "BOTH" || !company.role;
}

function canBeVendor(company: Company) {
  return company.role === "SELLER" || company.role === "BOTH" || !company.role;
}

function isManagedCustomer(company: Company) {
  return Boolean(company.managedByCompanyId) && canBeCustomer(company);
}

function isManagedVendor(company: Company) {
  return Boolean(company.managedByCompanyId) && canBeVendor(company);
}

function isPartnerForCompany(company: Company, ownerCompanyId: string) {
  return company.id === ownerCompanyId || company.managedByCompanyId === ownerCompanyId;
}

function normalizedBusinessName(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function businessPlanBelongsToCompany(plan: SavedBusinessPlan, company?: Company) {
  if (!company) return false;
  if (plan.companyId === company.id || plan.mainCompanyId === company.id) return true;
  const planNames = [plan.companyName, plan.excelMainCompanyName]
    .map(normalizedBusinessName)
    .filter(Boolean);
  const companyNames = [company.name, company.legalName]
    .map(normalizedBusinessName)
    .filter(Boolean);
  return planNames.some((planName) => companyNames.some((companyName) => planName === companyName || planName.includes(companyName) || companyName.includes(planName)));
}

function parseBusinessPlanInvoiceLimit(value?: string) {
  const match = (value ?? "").match(/(?:below|under|less\s+than|limit|max(?:imum)?)\s*(?:aed\s*)?([0-9][0-9,]*(?:\.\d+)?)\s*(k|m|million|thousand)?/i);
  if (!match) return undefined;
  const amount = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const suffix = match[2]?.toLowerCase();
  if (suffix === "m" || suffix === "million") return amount * 1_000_000;
  if (suffix === "k" || suffix === "thousand") return amount * 1_000;
  return amount;
}

function preferredInvoiceCount(min?: number, max?: number) {
  if (min === undefined && max === undefined) return "-";
  if (min !== undefined && max !== undefined && min !== max) return `${min}-${max}`;
  return String(min ?? max);
}

function businessPlanSalesSummary(plan: SavedBusinessPlan, targets: Target[], turnoverTargets: TurnoverTarget[], stockRows: Stock[]) {
  const ownerCompanyId = plan.mainCompanyId || plan.companyId;
  const planMonth = plan.planPeriodDateFrom?.slice(0, 7);
  const planSalesTarget = turnoverTargets.find((target) =>
    target.companyId === ownerCompanyId && target.type === "SALES" && (!planMonth || target.month === planMonth)
  );
  const planPurchaseTarget = turnoverTargets.find((target) =>
    target.companyId === ownerCompanyId && target.type === "PURCHASE" && (!planMonth || target.month === planMonth)
  );
  const plannedSalesValue = Number(planSalesTarget?.amount ?? plan.purchasePlan?.transactionAmountMin ?? 0);
  const invoiceLimit = parseBusinessPlanInvoiceLimit(plan.salesPlan?.invoiceRuleText || plan.purchasePlan?.invoiceRuleText);
  const plannedInvoiceCount = preferredInvoiceCount(plan.salesPlan?.invoiceCountMin, plan.salesPlan?.invoiceCountMax);
  const estimatedInvoiceCount = plannedInvoiceCount === "-"
    ? invoiceLimit && plannedSalesValue > 0 ? String(Math.max(1, Math.ceil(plannedSalesValue / invoiceLimit))) : "-"
    : plannedInvoiceCount;

  const planTargets = targets.filter((target) => {
    const targetDate = target.targetDate || target.dateFrom || "";
    const inPeriod = (!plan.planPeriodDateFrom || !targetDate || targetDate >= plan.planPeriodDateFrom)
      && (!plan.planPeriodDateTo || !targetDate || targetDate <= plan.planPeriodDateTo);
    const belongsToOwner = target.buyerCompany.id === ownerCompanyId || target.sellerCompany.id === ownerCompanyId;
    const businessPlanGenerated = /business plan|ai scheduled/i.test(target.notes || "");
    return belongsToOwner && inPeriod && businessPlanGenerated;
  });
  const salesTargets = planTargets.filter((target) => target.direction === "SALES" && target.sellerCompany.id === ownerCompanyId);
  const purchaseTargets = planTargets.filter((target) => target.direction === "PURCHASE" && target.buyerCompany.id === ownerCompanyId);
  const completedSalesTargets = salesTargets.filter((target) => target.invoiceNumber || ["COMPLETED", "INVOICED"].includes(target.status));
  const completedPurchaseTargets = purchaseTargets.filter((target) => target.invoiceNumber || ["COMPLETED", "INVOICED"].includes(target.status));
  const salesInvoiceValue = completedSalesTargets.reduce((sum, target) => sum + Number(target.documentValue ?? target.amountVolume ?? 0), 0);
  const purchaseInvoiceValue = completedPurchaseTargets.reduce((sum, target) => sum + Number(target.documentValue ?? target.amountVolume ?? 0), 0);
  const estimatedSalesMargin = completedSalesTargets.reduce((sum, target) => {
    const lineMargin = target.lines.reduce((lineSum, line) => {
      const sellingPrice = Number(line.maxPrice ?? line.item.maxPrice ?? line.item.expectedPrice ?? 0);
      const buyingPrice = Number(line.item.buyingPrice ?? line.item.expectedPrice ?? 0);
      return lineSum + ((sellingPrice - buyingPrice) * line.quantity);
    }, 0);
    return sum + lineMargin;
  }, 0);
  const stockForOwner = stockRows.filter((stock) => stock.company.id === ownerCompanyId && stock.quantity > 0);
  const stockProjectedSalesValue = stockForOwner.reduce((sum, stock) => {
    const sellingPrice = Number(stock.item.maxPrice ?? stock.item.expectedPrice ?? 0);
    return sum + (stock.quantity * sellingPrice);
  }, 0);
  const stockProjectedMargin = stockForOwner.reduce((sum, stock) => {
    const sellingPrice = Number(stock.item.maxPrice ?? stock.item.expectedPrice ?? 0);
    const buyingPrice = Number(stock.item.buyingPrice ?? stock.item.expectedPrice ?? 0);
    return sum + ((sellingPrice - buyingPrice) * stock.quantity);
  }, 0);
  const stockQuantity = stockForOwner.reduce((sum, stock) => sum + stock.quantity, 0);
  const projectedOrActualSalesValue = salesInvoiceValue || stockProjectedSalesValue;
  const projectedOrActualMargin = salesInvoiceValue ? estimatedSalesMargin : stockProjectedMargin;
  const marginBase = salesInvoiceValue || plannedSalesValue;

  return {
    plannedSalesValue,
    plannedPurchaseValue: Number(planPurchaseTarget?.amount ?? plan.purchasePlan?.transactionAmountMin ?? 0),
    estimatedInvoiceCount,
    invoiceLimit,
    salesInvoiceCount: completedSalesTargets.length,
    salesInvoiceValue,
    purchaseInvoiceCount: completedPurchaseTargets.length,
    purchaseInvoiceValue,
    estimatedSalesMargin,
    marginPercent: marginBase > 0 ? (estimatedSalesMargin / marginBase) * 100 : undefined,
    stockProjectedSalesValue,
    stockProjectedMargin,
    stockMarginPercent: stockProjectedSalesValue > 0 ? (stockProjectedMargin / stockProjectedSalesValue) * 100 : undefined,
    stockQuantity,
    projectedOrActualSalesValue,
    projectedOrActualMargin,
    projectedSalesGap: Math.max(0, plannedSalesValue - projectedOrActualSalesValue),
    projectedCoveragePercent: plannedSalesValue > 0 ? (projectedOrActualSalesValue / plannedSalesValue) * 100 : undefined,
    scheduledSalesCount: salesTargets.length - completedSalesTargets.length,
    totalSalesTargets: salesTargets.length,
  };
}

function dateInputValue(date = new Date()) {
  return appDate(date);
}

function monthStartInputValue(date = new Date()) {
  return appMonthStart(date);
}

function monthEndInputValue(date = new Date()) {
  return appMonthEnd(date);
}

function mediaUrl(path?: string | null, cacheKey?: string | number | null) {
  if (!path) return "";
  const separator = path.includes("?") ? "&" : "?";
  const cacheSuffix = cacheKey ? `${separator}v=${encodeURIComponent(String(cacheKey))}` : "";
  if (/^https?:\/\//i.test(path)) return `${path}${cacheSuffix}`;
  if (path.startsWith("/uploads/")) return `${path}${cacheSuffix}`;
  return `${apiUrl}${path}${cacheSuffix}`;
}

function CompanyLogoPreview({ company }: { company: Company }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const logoSrc = mediaUrl(company.logoPath, `${company.logoPath}-${attempt}`);
  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [company.logoPath]);
  useEffect(() => {
    if (!failed || !company.logoPath) return undefined;
    const retry = window.setTimeout(() => {
      setFailed(false);
      setAttempt((current) => current + 1);
    }, 1200);
    return () => window.clearTimeout(retry);
  }, [company.logoPath, failed]);

  if (!company.logoPath || failed) return <Building2 size={24} />;
  return (
    <img
      src={logoSrc}
      alt={`${company.name} logo`}
      onError={() => {
        if (attempt < 3) {
          window.setTimeout(() => setAttempt((current) => current + 1), 350);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

function parseAgentInstructionDraft(instruction: string) {
  const poMatch = instruction.match(/([0-9]+)\s*(?:separate\s+|different\s+|multiple\s+)?(?:po|purchase\s+orders?|orders?)\b/i);
  const amountMatch = instruction.match(/\baed\s*([0-9][0-9,]*(?:\.\d+)?)/i);
  const productMatch = instruction.match(/([0-9]+)\s*(?:random\s+)?(?:product|item|sku|card)/i);
  const today = dateInputValue();
  const weekEnd = dateInputValue(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
  return {
    poCount: poMatch ? Number(poMatch[1]) : undefined,
    amount: amountMatch ? amountMatch[1].replaceAll(",", "") : undefined,
    lineCount: productMatch ? Number(productMatch[1]) : undefined,
    isToday: /\btoday|now|immediate|immediately\b/i.test(instruction),
    isWeek: /\bthis week|weekly|week\b/i.test(instruction),
    wantsInvoice: /\binvoice|bill\b/i.test(instruction),
    amountMode: /\btotal\s+split|split\s+amount|total\b/i.test(instruction) ? "TOTAL_SPLIT" as const : /\beach|per\s+po|separate\b/i.test(instruction) ? "PER_PO" as const : undefined,
    direction: /\bsale|sales|sell|customer\b/i.test(instruction) ? "SALES" as const : /\bbuy|purchase|vendor\b/i.test(instruction) ? "PURCHASE" as const : undefined,
    today,
    weekEnd,
  };
}

function messageSeverity(message: string): "info" | "warning" | "error" {
  if (/\b(error|failed|missing|invalid|cannot|could not|not found|blocked|held)\b/i.test(message)) return "error";
  if (/\b(warning|review|check|already|manual|waiting)\b/i.test(message)) return "warning";
  return "info";
}

function messageTitle(message: string) {
  const severity = messageSeverity(message);
  return severity === "error" ? "Error" : severity === "warning" ? "Warning" : "Info";
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("b2b-token") ?? "");
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [reportMonth, setReportMonth] = useState(() => appDate().slice(0, 7));
  const [reportCompanyId, setReportCompanyId] = useState("ALL");
  const [reportCustomerId, setReportCustomerId] = useState("ALL");
  const [reportVendorId, setReportVendorId] = useState("ALL");
  const [reportProductId, setReportProductId] = useState("ALL");
  const [message, setMessage] = useState("");
  const [confirmationToast, setConfirmationToast] = useState<ConfirmationToast | null>(null);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [activeView, setActiveView] = useState<View>("overview");
  const [settingsTab, setSettingsTab] = useState<"company" | "businessImport" | "email" | "log" | "audit" | "systemLogs" | "maintenance">("company");
  const [companyPartnerTab, setCompanyPartnerTab] = useState<"companies" | "customers" | "vendors">("companies");
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [businessPlanFile, setBusinessPlanFile] = useState<File | null>(null);
  const [businessPlanCompanyId, setBusinessPlanCompanyId] = useState("AUTO");
  const [businessPlanPeriodFrom, setBusinessPlanPeriodFrom] = useState(() => monthStartInputValue());
  const [businessPlanPeriodTo, setBusinessPlanPeriodTo] = useState(() => monthEndInputValue());
  const [businessPlanPreview, setBusinessPlanPreview] = useState<BusinessPlanPreview | null>(null);
  const [businessProductImportResult, setBusinessProductImportResult] = useState<BusinessPlanProductImportResult | null>(null);
  const [businessScenarioImportResult, setBusinessScenarioImportResult] = useState<BusinessPlanScenarioImportResult | null>(null);
  const [pendingImportedBusinessPlan, setPendingImportedBusinessPlan] = useState<SavedBusinessPlan | null>(null);
  const [businessImportStatus, setBusinessImportStatus] = useState("Waiting for business plan file");
  const [businessImportProgress, setBusinessImportProgress] = useState(0);
  const [showBusinessImportProgress, setShowBusinessImportProgress] = useState(false);
  const [productPriceFile, setProductPriceFile] = useState<File | null>(null);
  const [productPricePreview, setProductPricePreview] = useState<BusinessPlanPreview | null>(null);
  const [productPriceImportResult, setProductPriceImportResult] = useState<BusinessPlanProductImportResult | null>(null);
  const [productImportStatus, setProductImportStatus] = useState("Waiting for product file");
  const [productImportProgress, setProductImportProgress] = useState(0);
  const [showProductImportProgress, setShowProductImportProgress] = useState(false);
  const [stockLocalMessage, setStockLocalMessage] = useState("");
  const [expandedCompanyIds, setExpandedCompanyIds] = useState<string[]>([]);
  const [companyScopeId, setCompanyScopeId] = useState("ALL");
  const [profileCompanyId, setProfileCompanyId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileLegalName, setProfileLegalName] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileTrn, setProfileTrn] = useState("");
  const [profileActive, setProfileActive] = useState(true);
  const [stockCompanyId, setStockCompanyId] = useState("");
  const [stockItemId, setStockItemId] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [planStockCompanyId, setPlanStockCompanyId] = useState("");
  const [planStockMonth, setPlanStockMonth] = useState(() => appDate().slice(0, 7));
  const [planStockStatus, setPlanStockStatus] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [bulkCompanyId, setBulkCompanyId] = useState("");
  const [bulkMode, setBulkMode] = useState<"SET" | "ADD">("SET");
  const [bulkCsvText, setBulkCsvText] = useState("sku,name,quantity,unit,expectedPrice,maxPrice\n");
  const [invoiceCompanyId, setInvoiceCompanyId] = useState("");
  const [purchaseInvoiceText, setPurchaseInvoiceText] = useState("SKU-001,Item Name,10,100\n");
  const [targetMonth, setTargetMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [targetBuyerId, setTargetBuyerId] = useState("");
  const [targetSellerId, setTargetSellerId] = useState("");
  const [targetItemId, setTargetItemId] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("10");
  const [targetMaxPrice, setTargetMaxPrice] = useState("");
  const [targetNotes, setTargetNotes] = useState("");
  const [randomAmount, setRandomAmount] = useState("1000");
  const [randomLineCount, setRandomLineCount] = useState("3");
  const [dailyCompanyId, setDailyCompanyId] = useState("");
  const [dailyCounterpartyId, setDailyCounterpartyId] = useState("");
  const [dailyDirection, setDailyDirection] = useState<"PURCHASE" | "SALES">("PURCHASE");
  const [dailyDate, setDailyDate] = useState(() => dateInputValue());
  const [dailyAmount, setDailyAmount] = useState("10000");
  const [dailyLineCount, setDailyLineCount] = useState("3");
  const [workflowCompanyId, setWorkflowCompanyId] = useState("");
  const [workflowCounterpartyId, setWorkflowCounterpartyId] = useState("");
  const [workflowPeriodType, setWorkflowPeriodType] = useState<"MONTHLY" | "DAILY">("MONTHLY");
  const [workflowDirection, setWorkflowDirection] = useState<"PURCHASE" | "SALES">("PURCHASE");
  const [workflowDateFrom, setWorkflowDateFrom] = useState(() => dateInputValue());
  const [workflowDateTo, setWorkflowDateTo] = useState(() => dateInputValue());
  const [workflowHourFrom, setWorkflowHourFrom] = useState("09:00");
  const [workflowHourTo, setWorkflowHourTo] = useState("18:00");
  const [workflowAmount, setWorkflowAmount] = useState("10000");
  const [workflowLineCount, setWorkflowLineCount] = useState("3");
  const [workflowProductMode, setWorkflowProductMode] = useState<"RANDOM" | "SELECTED">("RANDOM");
  const [workflowItemIds, setWorkflowItemIds] = useState<string[]>([]);
  const [agentInstruction, setAgentInstruction] = useState("Create purchase order today for AED 10000 with 3 random products and send vendor invoice.");
  const [agentPoCount, setAgentPoCount] = useState("1");
  const [agentDateFrom, setAgentDateFrom] = useState(() => dateInputValue());
  const [agentDateTo, setAgentDateTo] = useState(() => dateInputValue());
  const [agentInvoiceDelayMode, setAgentInvoiceDelayMode] = useState<"FIXED" | "RANDOM">("RANDOM");
  const [agentInvoiceDelay, setAgentInvoiceDelay] = useState("2");
  const [agentInvoiceDelayMin, setAgentInvoiceDelayMin] = useState("1");
  const [agentInvoiceDelayMax, setAgentInvoiceDelayMax] = useState("5");
  const [agentAmountMode, setAgentAmountMode] = useState<"PER_PO" | "TOTAL_SPLIT">("PER_PO");
  const [agentAmount, setAgentAmount] = useState("10000");
  const [agentLineCount, setAgentLineCount] = useState("3");
  const [agentProductMode, setAgentProductMode] = useState<"RANDOM" | "SELECTED">("RANDOM");
  const [agentAutoStart, setAgentAutoStart] = useState(true);
  const [agentAutoInvoice, setAgentAutoInvoice] = useState(true);
  const [planAgentCompanyId, setPlanAgentCompanyId] = useState("");
  const [planAgentMonth] = useState(() => appDate().slice(0, 7));
  const [planAgentStatus, setPlanAgentStatus] = useState("");
  const [showBusinessPlanEditor, setShowBusinessPlanEditor] = useState(false);
  const [editingBusinessPlanId, setEditingBusinessPlanId] = useState("");
  const [businessPlanRunStatus, setBusinessPlanRunStatus] = useState<Record<string, "IDLE" | "RUNNING" | "STOPPED" | "COMPLETED" | "FAILED">>({});
  const [expandedWorkflowPlanIds, setExpandedWorkflowPlanIds] = useState<string[]>([]);
  const businessPlanAbortControllers = useRef<Record<string, AbortController>>({});
  const [workflowTab, setWorkflowTab] = useState<"uploaded" | "manual">("uploaded");
  const [workflowTodayPage, setWorkflowTodayPage] = useState(1);
  const [workflowOtherPage, setWorkflowOtherPage] = useState(1);
  const [showAdvancedWorkflow, setShowAdvancedWorkflow] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
  const [emailCompanyId, setEmailCompanyId] = useState("");
  const [integrationEmail, setIntegrationEmail] = useState("");
  const [integrationMode, setIntegrationMode] = useState<EmailIntegration["mode"]>("SIMULATION");
  const [emailConfigStatus, setEmailConfigStatus] = useState<EmailConfigStatus | null>(null);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleRedirectUri, setGoogleRedirectUri] = useState("http://127.0.0.1:4321/api/email-integrations/oauth/callback");
  const [gmailTokenEncryptionKey, setGmailTokenEncryptionKey] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpEncryption, setSmtpEncryption] = useState<"TLS" | "SSL" | "NONE">("TLS");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState("993");
  const [imapEncryption, setImapEncryption] = useState<"TLS" | "SSL" | "NONE">("SSL");
  const [imapUsername, setImapUsername] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [systemLogLevel, setSystemLogLevel] = useState("ERROR");
  const [systemLogs, setSystemLogs] = useState<SystemLogResponse | null>(null);
  const [flushResult, setFlushResult] = useState<FlushResult | null>(null);
  const [databaseBackups, setDatabaseBackups] = useState<Array<{ fileName: string; bytes: number; createdAt: string }>>([]);
  const [restoreBackupFile, setRestoreBackupFile] = useState("");
  const [selectedFlushCategories, setSelectedFlushCategories] = useState<string[]>(defaultFlushCategoryKeys);
  const [flushStatus, setFlushStatus] = useState("Waiting for category selection");
  const [flushProgress, setFlushProgress] = useState(0);

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const responseText = await response.text();
    let data: { error?: string } & Record<string, unknown> = {};
    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        const htmlResponse = responseText.trimStart().startsWith("<!DOCTYPE") || responseText.trimStart().startsWith("<html");
        data = {
          error: htmlResponse
            ? `API route ${path} returned HTML instead of JSON. Check that the backend is running on ${apiUrl}.`
            : `API route ${path} returned an invalid response.`,
        };
      }
    }
    if (response.status === 401) {
      localStorage.removeItem("b2b-token");
      setToken("");
    }
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data as T;
  }

  async function loadSummary() {
    if (!token) return null;
    setLoading(true);
    try {
      const nextSummary = await request<Summary>("/api/dashboard/summary");
      setSummary({
        ...nextSummary,
        companies: nextSummary.companies ?? [],
        items: nextSummary.items ?? [],
        stock: nextSummary.stock ?? [],
        stockMovementReport: nextSummary.stockMovementReport ?? [],
        targets: nextSummary.targets ?? [],
        invoices: nextSummary.invoices ?? [],
        emails: nextSummary.emails ?? [],
        agentAuditLogs: nextSummary.agentAuditLogs ?? [],
        emailIntegrations: nextSummary.emailIntegrations ?? [],
        turnoverTargets: nextSummary.turnoverTargets ?? [],
        businessPlans: nextSummary.businessPlans ?? [],
        ecommerceOrders: nextSummary.ecommerceOrders ?? [],
      });
      return nextSummary;
    } finally {
      setLoading(false);
    }
  }

  async function loadReports() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportMonth) params.set("month", reportMonth);
      if (reportCompanyId !== "ALL") params.set("companyId", reportCompanyId);
      setReports(await request<ReportsData>(`/api/reports?${params.toString()}`));
    } finally {
      setLoading(false);
    }
  }

  async function loadSystemLogs(level = systemLogLevel, options: { silent?: boolean } = {}) {
    if (!token) return;
    if (!options.silent) setLoading(true);
    try {
      const query = level === "ALL" ? "?limit=150" : `?level=${encodeURIComponent(level)}&limit=150`;
      setSystemLogs(await request<SystemLogResponse>(`/api/system-logs${query}`));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load system logs");
    } finally {
      if (!options.silent) setLoading(false);
    }
  }

  async function downloadSystemLogs() {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/system-logs/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Could not download logs" }));
        throw new Error(data.error ?? "Could not download logs");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename=\"?([^"]+)\"?/)?.[1] ?? "b2b-logs.log";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("System logs downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not download logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary().catch((error) => setMessage(error.message));
  }, [token]);

  useEffect(() => {
    if (settingsTab === "systemLogs") {
      loadSystemLogs().catch((error) => setMessage(error.message));
    }
  }, [settingsTab, systemLogLevel, token]);

  useEffect(() => {
    if (settingsTab !== "systemLogs" || !token) return;
    const timer = window.setInterval(() => {
      loadSystemLogs(systemLogLevel, { silent: true }).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [settingsTab, systemLogLevel, token]);

  useEffect(() => {
    if (!token) return;
    request<EmailConfigStatus>("/api/email-integrations/config/status")
      .then((status) => {
        setEmailConfigStatus(status);
        if (status.redirectUri) setGoogleRedirectUri(status.redirectUri);
      })
      .catch((error) => setMessage(error.message));
  }, [token]);

  useEffect(() => {
    if (!summary) return;
    const portalCompany = portalCompanyName
      ? summary.companies.find((company) => company.name.toLowerCase() === portalCompanyName.toLowerCase())
      : undefined;
    const defaultCompanyId = portalCompany?.id || summary.companies[0]?.id || "";
    const defaultOwnerCompanyId = portalCompany?.id || summary.companies.find((company) => !company.managedByCompanyId)?.id || defaultCompanyId;
    if (portalCompany) {
      setCompanyScopeId(portalCompany.id);
      setReportCompanyId(portalCompany.id);
      setBusinessPlanCompanyId(portalCompany.id);
    }
    setProfileCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setStockCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setPlanStockCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setStockItemId((current) => current || summary.items[0]?.id || "");
    setBulkCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setInvoiceCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setTargetBuyerId((current) => portalCompany?.id || current || defaultCompanyId);
    setTargetSellerId((current) => current || summary.companies.find((company) => company.id !== (portalCompany?.id || defaultCompanyId))?.id || "");
    setDailyCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setDailyCounterpartyId((current) => current || summary.companies.find((company) => company.id !== (portalCompany?.id || defaultCompanyId))?.id || "");
    setWorkflowCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setPlanAgentCompanyId((current) => portalCompany?.id || current || defaultOwnerCompanyId);
    setWorkflowCounterpartyId((current) => current || summary.companies.find((company) => company.id !== (portalCompany?.id || defaultCompanyId))?.id || "");
    setTargetItemId((current) => current || summary.items[0]?.id || "");
    setSelectedInvoiceId((current) => current || summary.invoices[0]?.id || "");
    setEmailCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
  }, [summary]);

  useEffect(() => {
    if (!summary || !profileCompanyId) return;
    const company = summary.companies.find((entry) => entry.id === profileCompanyId);
    if (!company) return;
    setProfileName(company.name);
    setProfileLegalName(company.legalName);
    setProfileLocation(company.location);
    setProfileEmail(company.email);
    setProfileTrn(company.trn ?? "");
    setProfileActive(company.active !== false);
  }, [summary, profileCompanyId]);

  useEffect(() => {
    if (!summary || !emailCompanyId) return;
    const company = summary.companies.find((item) => item.id === emailCompanyId);
    const integration = summary.emailIntegrations.find((item) => item.companyId === emailCompanyId);
    setIntegrationEmail(integration?.email ?? company?.email ?? "");
    setIntegrationMode(integration?.mode ?? "SIMULATION");
  }, [summary, emailCompanyId]);

  useEffect(() => {
    if (!summary || !targetBuyerId || !targetMonth) return;
    const turnover = summary.turnoverTargets.find((target) =>
      target.companyId === targetBuyerId && target.type === "PURCHASE" && target.month === targetMonth
    );
    if (turnover && randomAmount === "1000") {
      setRandomAmount(String(Math.round(Number(turnover.amount))));
    }
  }, [summary, targetBuyerId, targetMonth]);

  useEffect(() => {
    if (activeView !== "invoices" || !selectedInvoiceId) return;
    loadInvoice(selectedInvoiceId).catch((error) => setMessage(error.message));
  }, [activeView, selectedInvoiceId]);

  useEffect(() => {
    if (activeView !== "reports") return;
    loadReports().catch((error) => setMessage(error.message));
  }, [activeView, reportMonth, reportCompanyId, token]);

  useEffect(() => {
    setShowBusinessPlanEditor(false);
    setEditingBusinessPlanId("");
    setWorkflowTodayPage(1);
    setWorkflowOtherPage(1);
  }, [planAgentCompanyId]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const session = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Login failed");
        return data as { token: string };
      });
      localStorage.setItem("b2b-token", session.token);
      setToken(session.token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    }
  }

  async function saveCompanyProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!profileCompanyId) {
      setMessage("Select a company first.");
      return;
    }
    if (!profileName || !profileLegalName || !profileLocation || !profileEmail) {
      setMessage("Company name, legal name, address, and email are required.");
      return;
    }

    setLoading(true);
    try {
      const currentCompany = summary?.companies.find((company) => company.id === profileCompanyId);
      await request(`/api/catalog/companies/${profileCompanyId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: profileName,
          legalName: profileLegalName,
          role: currentCompany?.role ?? "BOTH",
          managedByCompanyId: currentCompany?.managedByCompanyId ?? undefined,
          location: profileLocation,
          email: profileEmail,
          trn: profileTrn || undefined,
          active: profileActive,
        }),
      });
      setMessage("Company profile saved. New PO and invoice PDFs will use these details.");
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save company profile");
    } finally {
      setLoading(false);
    }
  }

  async function saveCompanyCard(event: React.FormEvent<HTMLFormElement>, company: Company) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const legalName = String(form.get("legalName") ?? "").trim();
    const role = String(form.get("role") ?? "BOTH") as "BUYER" | "SELLER" | "BOTH";
    const managedByCompanyId = String(form.get("managedByCompanyId") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    const emailValue = String(form.get("email") ?? "").trim();
    const trn = String(form.get("trn") ?? "").trim();
    const bankName = String(form.get("bankName") ?? "").trim();
    const bankBeneficiaryName = String(form.get("bankBeneficiaryName") ?? "").trim();
    const bankAccountNumber = String(form.get("bankAccountNumber") ?? "").trim();
    const bankIban = String(form.get("bankIban") ?? "").trim();
    const bankCid = String(form.get("bankCid") ?? "").trim();
    const bankBranch = String(form.get("bankBranch") ?? "").trim();
    const active = form.get("active") === "on";
    const vatEnabled = form.get("vatEnabled") === "on";
    if (!name || !legalName || !location || !emailValue) {
      setMessage("Company name, legal name, address, and email are required.");
      return;
    }
    setLoading(true);
    setAgentRunning(true);
    try {
      await request(`/api/catalog/companies/${company.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          legalName,
          role,
          managedByCompanyId,
          location,
          email: emailValue,
          trn: trn || undefined,
          active,
          vatEnabled,
          bankName,
          bankBeneficiaryName,
          bankAccountNumber,
          bankIban,
          bankCid,
          bankBranch,
        }),
      });
      setMessage(`${name} profile saved.`);
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update company profile");
    } finally {
      setAgentRunning(false);
      setLoading(false);
    }
  }

  async function createCompanyCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") ?? "").trim();
    const legalName = String(form.get("legalName") ?? "").trim();
    const role = String(form.get("role") ?? "BOTH") as "BUYER" | "SELLER" | "BOTH";
    const managedByCompanyId = String(form.get("managedByCompanyId") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    const emailValue = String(form.get("email") ?? "").trim();
    const trn = String(form.get("trn") ?? "").trim();
    const bankName = String(form.get("bankName") ?? "").trim();
    const bankBeneficiaryName = String(form.get("bankBeneficiaryName") ?? "").trim();
    const bankAccountNumber = String(form.get("bankAccountNumber") ?? "").trim();
    const bankIban = String(form.get("bankIban") ?? "").trim();
    const bankCid = String(form.get("bankCid") ?? "").trim();
    const bankBranch = String(form.get("bankBranch") ?? "").trim();
    const active = form.get("active") === "on";
    const vatEnabled = form.get("vatEnabled") === "on";
    if (!name || !legalName || !location || !emailValue) {
      setMessage("Company name, legal name, address, and email are required.");
      return;
    }

    setLoading(true);
    try {
      const created = await request<Company>("/api/catalog/companies", {
        method: "POST",
        body: JSON.stringify({
          name,
          legalName,
          role,
          managedByCompanyId,
          location,
          email: emailValue,
          trn: trn || undefined,
          active,
          vatEnabled,
          bankName,
          bankBeneficiaryName,
          bankAccountNumber,
          bankIban,
          bankCid,
          bankBranch,
        }),
      });
      formElement.reset();
      setShowCreateCompany(false);
      setExpandedCompanyIds((current) => [...current, created.id]);
      setMessage(`${created.name} company created.`);
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create company");
    } finally {
      setLoading(false);
    }
  }

  async function uploadCompanyLogo(company: Company, file: File | null) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Company logo must be PNG, JPG, or WEBP.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/catalog/companies/${company.id}/logo`, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not upload company logo");
      setMessage(`${company.name} logo uploaded.`);
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload company logo");
    } finally {
      setLoading(false);
    }
  }

  async function previewBusinessPlanImport(event: React.FormEvent) {
    event.preventDefault();
    if (!businessPlanFile) {
      setMessage("Select an Excel file first.");
      return;
    }
    setShowBusinessImportProgress(true);
    setBusinessImportStatus("Reading business plan workbook...");
    setBusinessImportProgress(30);
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/business-plan-import/preview`, {
        method: "POST",
        headers: {
          "Content-Type": businessPlanFile.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: businessPlanFile,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not preview business plan");
      setBusinessPlanPreview(data);
      setBusinessProductImportResult(null);
      setBusinessScenarioImportResult(null);
      setPendingImportedBusinessPlan(null);
      setBusinessImportProgress(100);
      setBusinessImportStatus(`Preview ready: ${data.counts.companies} companies, ${data.counts.purchaseVendors} vendors, ${data.counts.salesCustomers} customers.`);
      setMessage(`Business plan preview ready: ${data.counts.companies} companies and ${data.counts.products} products detected.`);
    } catch (error) {
      setBusinessImportProgress(0);
      setBusinessImportStatus("Preview failed.");
      setMessage(error instanceof Error ? error.message : "Could not preview business plan");
    } finally {
      setLoading(false);
    }
  }

  async function previewProductPriceFile(file: File | null, onPreview: (preview: BusinessPlanPreview) => void) {
    if (!file) {
      setMessage("Select a product price Excel file first.");
      return;
    }
    setShowProductImportProgress(true);
    setProductImportStatus("Reading Excel file and preparing preview...");
    setProductImportProgress(35);
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/business-plan-import/preview`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not preview product prices");
      onPreview(data);
      setProductImportProgress(100);
      setProductImportStatus(`Preview ready: ${data.counts.products} product rows detected.`);
      setMessage(`Product preview ready: ${data.counts.products} rows detected.`);
    } catch (error) {
      setProductImportProgress(0);
      setProductImportStatus("Preview failed.");
      setMessage(error instanceof Error ? error.message : "Could not preview product prices");
    } finally {
      setLoading(false);
    }
  }

  async function importProductPriceFile(file: File | null, onResult: (result: BusinessPlanProductImportResult) => void) {
    if (!file) {
      setMessage("Select a product price Excel file first.");
      return;
    }
    setShowProductImportProgress(true);
    setProductImportStatus("Importing products into database...");
    setProductImportProgress(65);
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/business-plan-import/import-products`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not import product prices");
      onResult(data);
      setProductImportProgress(100);
      setProductImportStatus(`Import complete: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped.`);
      setMessage(`Product import complete: ${data.created} created, ${data.updated} updated, ${data.skipped} skipped.`);
      await loadSummary();
    } catch (error) {
      setProductImportProgress(0);
      setProductImportStatus("Import failed.");
      setMessage(error instanceof Error ? error.message : "Could not import product prices");
    } finally {
      setLoading(false);
    }
  }

  async function importBusinessPlanProducts() {
    if (!businessPlanPreview) {
      setMessage("Preview the Excel file before importing products.");
      return;
    }
    setConfirmationToast({
      title: "Import previewed products?",
      message: `Import ${businessPlanPreview.counts.products} product rows from this Excel workbook. Existing matching SKUs will be updated.`,
      confirmLabel: "Import Products",
      onConfirm: async () => {
        await importProductPriceFile(businessPlanFile, setBusinessProductImportResult);
      },
    });
  }

  async function importBusinessPlanScenario() {
    if (!businessPlanPreview) {
      setMessage("Preview the Excel file before importing the business plan.");
      return;
    }
    setConfirmationToast({
      title: "Import business plan scenario?",
      message: `${selectedBusinessPlanCompany ? `This will import the plan under ${selectedBusinessPlanCompany.name}` : "This will use the main company detected from Excel"}. It will create/update ${businessPlanPreview.counts.purchaseVendors} purchase vendors, ${businessPlanPreview.counts.salesCustomers} sales customers, turnover targets, and allocation rules.`,
      confirmLabel: "Import Scenario",
      onConfirm: async () => {
        if (!businessPlanFile) return;
        setShowBusinessImportProgress(true);
        setBusinessImportStatus("Importing companies, partners, turnover targets, and allocation rules...");
        setBusinessImportProgress(65);
        setLoading(true);
        try {
          if (businessPlanPeriodFrom && businessPlanPeriodTo && businessPlanPeriodFrom > businessPlanPeriodTo) throw new Error("Business plan period Date From cannot be after Date To.");
          const importUrl = new URL(`${apiUrl}/api/business-plan-import/import-scenario`);
          if (businessPlanCompanyId !== "AUTO") importUrl.searchParams.set("companyId", businessPlanCompanyId);
          if (businessPlanPeriodFrom) importUrl.searchParams.set("planPeriodDateFrom", businessPlanPeriodFrom);
          if (businessPlanPeriodTo) importUrl.searchParams.set("planPeriodDateTo", businessPlanPeriodTo);
          const response = await fetch(importUrl.toString(), {
            method: "POST",
            headers: {
              "Content-Type": businessPlanFile.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: businessPlanFile,
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not import business plan scenario");
          setBusinessScenarioImportResult(data);
          setBusinessImportProgress(100);
          setBusinessImportStatus(`Import complete: ${data.partnersCreated} partners created, ${data.partnersUpdated} partners updated, ${data.rulesSaved} rule set saved.`);
          setMessage(`Business plan imported: ${data.partnersCreated} partners created, ${data.partnersUpdated} partners updated.`);
          const nextSummary = await loadSummary().catch(() => null);
          const importedCompanyName = data.rows?.find((row: BusinessPlanScenarioImportResult["rows"][number]) => row.type === "COMPANY")?.name;
          const importedCompany = (nextSummary?.companies ?? []).find((company) =>
            company.id === data.companyId
            || (businessPlanCompanyId !== "AUTO" && company.id === businessPlanCompanyId)
            || company.name === data.companyName
            || company.legalName === data.companyName
            || company.name === importedCompanyName
            || company.legalName === importedCompanyName
          );
          const fallbackCompanyId = data.companyId || importedCompany?.id || (businessPlanCompanyId !== "AUTO" ? businessPlanCompanyId : "");
          if (data.planId && fallbackCompanyId && businessPlanPreview.scenario) {
            setPendingImportedBusinessPlan({
              planId: data.planId,
              companyId: fallbackCompanyId,
              companyName: data.companyName || importedCompany?.name || businessPlanPreview.scenario.mainCompany?.name || importedCompanyName || "Imported company",
              importedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              excelMainCompanyName: businessPlanPreview.scenario.mainCompany?.name,
              mainCompanyId: fallbackCompanyId,
              planPeriodDateFrom: data.planPeriodDateFrom || businessPlanPeriodFrom || undefined,
              planPeriodDateTo: data.planPeriodDateTo || businessPlanPeriodTo || undefined,
              purchaseVendors: businessPlanPreview.scenario.purchaseVendors,
              salesCustomers: businessPlanPreview.scenario.salesCustomers,
              salesAllocations: businessPlanPreview.scenario.salesAllocations,
              purchasePlan: businessPlanPreview.scenario.purchasePlan,
              salesPlan: businessPlanPreview.scenario.salesPlan,
            });
          }
          const importedPlan = data.planId
            ? (nextSummary?.businessPlans ?? []).find((plan) => plan.planId === data.planId || (importedCompany && businessPlanBelongsToCompany(plan, importedCompany)))
            : undefined;
          if (importedCompany) {
            setPlanAgentCompanyId(importedCompany.id);
            setCompanyScopeId(isCompanyPortal ? importedCompany.id : "ALL");
          }
          if (importedPlan) setEditingBusinessPlanId(importedPlan.planId);
          setWorkflowTab("uploaded");
          setActiveView("workflow");
          setBusinessPlanPreview(null);
          setBusinessScenarioImportResult(null);
          setBusinessImportStatus("Import complete. Opening uploaded workflow...");
        } catch (error) {
          setBusinessImportProgress(0);
          setBusinessImportStatus("Import failed.");
          setMessage(error instanceof Error ? error.message : "Could not import business plan scenario");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function previewStockProductPrices(event: React.FormEvent) {
    event.preventDefault();
    setProductPriceImportResult(null);
    await previewProductPriceFile(productPriceFile, setProductPricePreview);
  }

  async function importStockProductPrices() {
    if (!productPricePreview) {
      setMessage("Preview the product file before importing.");
      return;
    }
    setConfirmationToast({
      title: "Import previewed products?",
      message: `Import ${productPricePreview.counts.products} product rows. Existing matching SKUs will be updated. Stock quantity will not change.`,
      confirmLabel: "Import Products",
      onConfirm: async () => {
        await importProductPriceFile(productPriceFile, setProductPriceImportResult);
      },
    });
  }

  async function deleteStockRow(stock: Stock) {
    setConfirmationToast({
      title: "Delete stock?",
      message: `Delete ${stock.item.sku} stock from ${stock.company.name}?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/catalog/stock/${stock.id}`, { method: "DELETE" });
          setStockLocalMessage(`${stock.item.sku} stock deleted from ${stock.company.name}.`);
          await loadSummary();
        } catch (error) {
          setStockLocalMessage(error instanceof Error ? error.message : "Could not delete stock");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  function toggleFlushCategory(categoryKey: string) {
    setSelectedFlushCategories((current) =>
      current.includes(categoryKey) ? current.filter((key) => key !== categoryKey) : [...current, categoryKey]
    );
  }

  function flushTotals(result: FlushResult | null) {
    if (!result) return { records: 0, files: 0 };
    return {
      records: Object.values(result.deletedRecords).reduce((sum, value) => sum + value, 0),
      files: Object.values(result.deletedFiles).reduce((sum, value) => sum + value, 0),
    };
  }

  function flushSelectedData() {
    const selectedOptions = flushCategoryOptions.filter((option) => selectedFlushCategories.includes(option.key));
    if (selectedOptions.length === 0) {
      setMessage("Select at least one data category to flush.");
      return;
    }
    setConfirmationToast({
      title: "Flush selected data?",
      message: `This will clear: ${selectedOptions.map((option) => option.title).join(", ")}. Unselected categories will remain.`,
      confirmLabel: "Flush Selected",
      danger: selectedOptions.some((option) => option.dangerous),
      typedPhrase: "FLUSH DATA",
      onConfirm: async () => {
        setFlushResult(null);
        setFlushStatus(`Deleting ${selectedOptions.length} selected categories...`);
        setFlushProgress(30);
        setLoading(true);
        try {
          setFlushProgress(60);
          const result = await request<FlushResult>("/api/maintenance/flush-transactional-data", {
            method: "POST",
            body: JSON.stringify({ categories: selectedFlushCategories }),
          });
          setFlushResult(result);
          setSystemLogs(null);
          const totals = flushTotals(result);
          setFlushProgress(100);
          setFlushStatus(`Successfully deleted ${totals.records} records and ${totals.files} files.`);
          setMessage(`Selected data flushed successfully: ${totals.records} records and ${totals.files} files deleted.`);
          if (result.selectedCategories.includes("transactions")) {
            setPendingImportedBusinessPlan(null);
            setPlanAgentStatus("");
            setBusinessPlanRunStatus({});
            setWorkflowTodayPage(1);
            setWorkflowOtherPage(1);
            Object.values(businessPlanAbortControllers.current).forEach((controller) => controller.abort());
            businessPlanAbortControllers.current = {};
            setActiveView("workflow");
            setSettingsTab("company");
          } else if (result.selectedCategories.includes("stock") || result.selectedCategories.includes("productMaster")) {
            setActiveView("stock");
            setSettingsTab("company");
          } else if (result.selectedCategories.includes("communicationLogs") || result.selectedCategories.includes("applicationLogs")) {
            setSettingsTab(result.selectedCategories.includes("applicationLogs") ? "systemLogs" : "log");
          }
          await loadSummary();
        } catch (error) {
          setFlushProgress(0);
          setFlushStatus("Flush failed. Check selected category and logs.");
          setMessage(error instanceof Error ? error.message : "Could not flush selected data");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function loadDatabaseBackups() {
    setLoading(true);
    try {
      const result = await request<{ backups: Array<{ fileName: string; bytes: number; createdAt: string }> }>("/api/maintenance/backups");
      setDatabaseBackups(result.backups);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load backups");
    } finally {
      setLoading(false);
    }
  }

  async function createDatabaseBackup() {
    setLoading(true);
    try {
      const result = await request<{ fileName: string }>("/api/maintenance/backups", { method: "POST" });
      setMessage(`Database backup created: ${result.fileName}`);
      await loadDatabaseBackups();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create database backup");
    } finally {
      setLoading(false);
    }
  }

  async function restoreDatabaseBackup() {
    if (!restoreBackupFile) {
      setMessage("Select a backup before restore.");
      return;
    }
    setConfirmationToast({
      title: "Restore database?",
      message: `Restore from ${restoreBackupFile}? Current database will be backed up first, then replaced.`,
      confirmLabel: "Restore",
      danger: true,
      typedPhrase: "RESTORE DATABASE",
      onConfirm: async () => {
        setLoading(true);
        try {
          await request("/api/maintenance/restore", {
            method: "POST",
            body: JSON.stringify({ fileName: restoreBackupFile, typedConfirmation: "RESTORE DATABASE" }),
          });
          setMessage("Database restored. Restart the app service to reload all connections.");
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not restore database");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function deleteCompany(company: Company) {
    setConfirmationToast({
      title: "Delete company?",
      message: `Delete ${company.name}? This is only allowed when the company has no transaction history.`,
      confirmLabel: "Delete",
      danger: true,
      typedPhrase: company.name,
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/catalog/companies/${company.id}`, { method: "DELETE" });
          setMessage(`${company.name} deleted.`);
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not delete company");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function confirmToastAction() {
    if (!confirmationToast) return;
    if (confirmationToast.typedPhrase && typedConfirmation !== confirmationToast.typedPhrase) {
      setMessage(`Type ${confirmationToast.typedPhrase} to confirm this action.`);
      return;
    }
    const action = confirmationToast.onConfirm;
    setConfirmationToast(null);
    setTypedConfirmation("");
    await action();
  }

  function cancelToastAction() {
    if (confirmationToast) {
      setMessage("Action cancelled.");
      setConfirmationToast(null);
      setTypedConfirmation("");
    }
  }

  function toggleCompanyExpanded(companyId: string) {
    setExpandedCompanyIds((current) =>
      current.includes(companyId) ? current.filter((id) => id !== companyId) : [...current, companyId],
    );
  }

  async function createMonthlyTarget(event: React.FormEvent) {
    event.preventDefault();
    if (!summary || summary.companies.length < 2 || summary.items.length < 1) {
      setMessage("Add or seed two companies and one item first.");
      return;
    }
    const quantity = Number(targetQuantity);
    const maxPrice = targetMaxPrice ? Number(targetMaxPrice) : undefined;
    if (!targetBuyerId || !targetSellerId || !targetItemId || targetBuyerId === targetSellerId) {
      setMessage("Select buyer, seller, and item. Buyer and seller must be different.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage("Target quantity must be a positive whole number.");
      return;
    }
    if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice <= 0)) {
      setMessage("Max approval price must be a valid positive number.");
      return;
    }

    setLoading(true);
    try {
      const existingTarget = editingTargetId ? summary.targets.find((target) => target.id === editingTargetId) : undefined;
      const payload = {
        buyerCompanyId: targetBuyerId,
        sellerCompanyId: targetSellerId,
        month: targetMonth,
        targetDate: existingTarget?.targetDate,
        notes: targetNotes || undefined,
        lines: [{ itemId: targetItemId, quantity, maxPrice }],
      };
      await request(editingTargetId ? `/api/workflow/targets/${editingTargetId}` : "/api/workflow/targets", {
        method: editingTargetId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setMessage(editingTargetId ? "Monthly target updated." : "Monthly target created.");
      setEditingTargetId("");
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save target");
    } finally {
      setLoading(false);
    }
  }

  function editTarget(target: Target) {
    const firstLine = target.lines[0];
    setEditingTargetId(target.id);
    setTargetMonth(target.month);
    setTargetBuyerId(target.buyerCompany.id);
    setTargetSellerId(target.sellerCompany.id);
    setTargetItemId(firstLine?.itemId || firstLine?.item.id || "");
    setTargetQuantity(String(firstLine?.quantity ?? 1));
    setTargetMaxPrice(firstLine?.maxPrice ? String(firstLine.maxPrice) : "");
    setTargetNotes(target.notes ?? "");
    setWorkflowPeriodType(target.periodType ?? (target.targetDate ? "DAILY" : "MONTHLY"));
    setWorkflowDirection(target.direction ?? "PURCHASE");
    const companyId = isCompanyPortal
      ? scopedCompanies[0]?.id ?? target.buyerCompany.id
      : target.direction === "SALES" ? target.sellerCompany.id : target.buyerCompany.id;
    setWorkflowCompanyId(companyId);
    setWorkflowCounterpartyId(companyId === target.buyerCompany.id ? target.sellerCompany.id : target.buyerCompany.id);
    setWorkflowDateFrom(target.dateFrom ?? target.targetDate ?? dateInputValue());
    setWorkflowDateTo(target.dateTo ?? target.dateFrom ?? target.targetDate ?? dateInputValue());
    setWorkflowHourFrom(target.hourFrom ?? "09:00");
    setWorkflowHourTo(target.hourTo ?? "18:00");
    setWorkflowAmount(target.amountVolume ? String(Math.round(Number(target.amountVolume))) : String(firstLine?.quantity ?? 1));
    setWorkflowLineCount(String(target.lines.length || 1));
    setWorkflowProductMode(target.productMode ?? "SELECTED");
    setWorkflowItemIds(target.lines.map((line) => line.itemId || line.item.id));
    setWorkflowTab("manual");
    setShowAdvancedWorkflow(true);
    setMessage("Editing target.");
  }

  function cancelEditTarget() {
    setEditingTargetId("");
    setTargetNotes("");
    setMessage("Edit cancelled.");
  }

  async function deleteTarget(targetId: string) {
    setConfirmationToast({
      title: "Delete target?",
      message: "Delete this open monthly target?",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/workflow/targets/${targetId}`, {
            method: "DELETE",
          });
          if (editingTargetId === targetId) setEditingTargetId("");
          setMessage("Monthly target deleted.");
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not delete target");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function createRandomTarget(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(randomAmount);
    const lineCount = Number(randomLineCount);
    if (!targetBuyerId || !targetSellerId || targetBuyerId === targetSellerId) {
      setMessage("Select buyer and seller before random generation.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Random target amount must be greater than zero.");
      return;
    }
    if (!Number.isInteger(lineCount) || lineCount <= 0) {
      setMessage("Product volume must be a positive whole number.");
      return;
    }

    setLoading(true);
    try {
      await request("/api/workflow/targets/random", {
        method: "POST",
        body: JSON.stringify({
          buyerCompanyId: targetBuyerId,
          sellerCompanyId: targetSellerId,
          month: targetMonth,
          amount,
          lineCount,
          notes: targetNotes || undefined,
        }),
      });
      setMessage("Random monthly target created from seller stock.");
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create random target");
    } finally {
      setLoading(false);
    }
  }

  async function createDailyTarget(event: React.FormEvent) {
    event.preventDefault();
    const amount = Number(dailyAmount);
    const lineCount = Number(dailyLineCount);
    if (!dailyCompanyId || !dailyCounterpartyId || dailyCompanyId === dailyCounterpartyId) {
      setMessage("Select company and vendor/customer. They must be different.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Daily amount must be greater than zero.");
      return;
    }
    if (!Number.isInteger(lineCount) || lineCount <= 0) {
      setMessage("Product volume must be a positive whole number.");
      return;
    }

    setLoading(true);
    try {
      await request("/api/workflow/targets/daily", {
        method: "POST",
        body: JSON.stringify({
          companyId: dailyCompanyId,
          counterpartyId: dailyCounterpartyId,
          direction: dailyDirection,
          date: dailyDate,
          amount,
          lineCount,
        }),
      });
      setMessage(`Daily ${dailyDirection.toLowerCase()} target created.`);
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create daily target");
    } finally {
      setLoading(false);
    }
  }

  async function saveWorkflowTarget(runNow: boolean) {
    if (!summary || summary.companies.length < 2 || summary.items.length < 1) {
      setMessage("Add or seed two companies and one item first.");
      return;
    }
    const amount = Number(workflowAmount);
    const lineCount = Number(workflowLineCount);
    if (!workflowCompanyId || !workflowCounterpartyId || workflowCompanyId === workflowCounterpartyId) {
      setMessage("Select company and vendor/customer. They must be different.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Volume amount must be greater than zero.");
      return;
    }
    if (!Number.isInteger(lineCount) || lineCount <= 0) {
      setMessage("Product volume must be a positive whole number.");
      return;
    }
    if (workflowPeriodType === "MONTHLY" && (!workflowDateFrom || !workflowDateTo || workflowDateFrom > workflowDateTo)) {
      setMessage("Select a valid monthly date from and date to range.");
      return;
    }
    if (workflowPeriodType === "DAILY" && (!workflowDateFrom || !workflowHourFrom || !workflowHourTo || workflowHourFrom >= workflowHourTo)) {
      setMessage("Select a valid daily date and hour range.");
      return;
    }
    if (workflowProductMode === "SELECTED" && !workflowItemIds.length) {
      setMessage("Select at least one product or choose random products.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        companyId: workflowCompanyId,
        counterpartyId: workflowCounterpartyId,
        direction: workflowDirection,
        periodType: workflowPeriodType,
        month: workflowPeriodType === "MONTHLY" ? targetMonth : workflowDateFrom.slice(0, 7),
        dateFrom: workflowDateFrom,
        dateTo: workflowPeriodType === "MONTHLY" ? workflowDateTo : workflowDateFrom,
        hourFrom: workflowPeriodType === "DAILY" ? workflowHourFrom : undefined,
        hourTo: workflowPeriodType === "DAILY" ? workflowHourTo : undefined,
        amount,
        lineCount,
        productMode: workflowProductMode,
        itemIds: workflowProductMode === "SELECTED" ? workflowItemIds : undefined,
        notes: targetNotes || undefined,
        runNow,
      };

      if (editingTargetId) {
        const buyerCompanyId = workflowDirection === "PURCHASE" ? workflowCompanyId : workflowCounterpartyId;
        const sellerCompanyId = workflowDirection === "PURCHASE" ? workflowCounterpartyId : workflowCompanyId;
        const selectedItems = workflowProductMode === "SELECTED"
          ? workflowItemIds
          : summary.items.slice(0, lineCount).map((item) => item.id);
        const amountPerLine = amount / Math.max(selectedItems.length, 1);
        await request(`/api/workflow/targets/${editingTargetId}`, {
          method: "PATCH",
          body: JSON.stringify({
            buyerCompanyId,
            sellerCompanyId,
            month: payload.month,
            targetDate: workflowPeriodType === "DAILY" ? workflowDateFrom : undefined,
            periodType: workflowPeriodType,
            dateFrom: workflowDateFrom,
            dateTo: payload.dateTo,
            hourFrom: payload.hourFrom,
            hourTo: payload.hourTo,
            direction: workflowDirection,
            productMode: workflowProductMode,
            amountVolume: amount,
            notes: targetNotes || undefined,
            lines: selectedItems.map((itemId) => {
              const item = summary.items.find((entry) => entry.id === itemId);
              const expectedPrice = Math.max(Number(item?.expectedPrice ?? 1), 0.01);
              return {
                itemId,
                quantity: Math.max(1, Math.round(amountPerLine / expectedPrice)),
                maxPrice: item?.maxPrice ? Number(item.maxPrice) : undefined,
              };
            }),
          }),
        });
        if (runNow) await request(`/api/workflow/targets/${editingTargetId}/run`, { method: "POST" });
      } else {
        await request("/api/workflow/targets/transaction", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setMessage(runNow ? "Target created and agent workflow completed." : editingTargetId ? "Target updated." : "Target created.");
      setEditingTargetId("");
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save workflow target");
    } finally {
      setLoading(false);
    }
  }

  async function startAgentTask(event: React.FormEvent) {
    event.preventDefault();
    if (!agentInstruction.trim()) {
      setMessage("Tell the agent what job to do.");
      return;
    }
    setLoading(true);
    try {
      const result = await request<{ targets?: Target[]; workflows?: Array<{ order?: unknown } | null> }>("/api/workflow/targets/agent", {
        method: "POST",
        body: JSON.stringify({
          companyId: workflowCompanyId || undefined,
          counterpartyId: workflowCounterpartyId || undefined,
          direction: workflowDirection,
          instruction: agentInstruction,
          autoStart: agentAutoStart,
          autoInvoice: agentAutoInvoice,
          poCount: Number(agentPoCount),
          dateFrom: agentDateFrom,
          dateTo: agentDateTo,
          invoiceDelayMode: agentInvoiceDelayMode,
          invoiceDelayMinutes: Number(agentInvoiceDelay),
          invoiceDelayMinMinutes: Number(agentInvoiceDelayMin),
          invoiceDelayMaxMinutes: Number(agentInvoiceDelayMax),
          amount: Number(agentAmount),
          amountMode: agentAmountMode,
          lineCount: Number(agentLineCount),
          productMode: agentProductMode,
          itemIds: agentProductMode === "SELECTED" ? workflowItemIds : undefined,
        }),
      });
      const targetCount = result.targets?.length ?? 1;
      const sentPoCount = result.workflows?.filter((workflow) => workflow?.order).length ?? 0;
      const wantsInvoice = /\binvoice|bill\b/i.test(agentInstruction);
      const invoiceDelayText = agentInvoiceDelayMode === "RANDOM"
        ? `randomly between ${agentInvoiceDelayMin} and ${agentInvoiceDelayMax} minutes`
        : `after ${agentInvoiceDelay} minute${Number(agentInvoiceDelay) === 1 ? "" : "s"}`;
      if (targetCount > 1 && sentPoCount > 0 && wantsInvoice) {
        setMessage(`AI agent sent ${targetCount} POs. Vendor invoices will send ${invoiceDelayText}.`);
      } else if (targetCount > 1 && sentPoCount > 0) {
        setMessage(`AI agent sent ${targetCount} separate POs.`);
      } else if (targetCount > 1) {
        setMessage(`AI agent scheduled ${targetCount} separate PO jobs.`);
      } else if (agentAutoStart && wantsInvoice) {
        setMessage(`AI agent sent the PO to the vendor. Vendor invoice will send ${invoiceDelayText}.`);
      } else {
        setMessage(agentAutoStart ? "AI agent sent the PO to the vendor. Vendor can now create invoice." : "AI agent task created and waiting to run.");
      }
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agent could not complete the job");
    } finally {
      setLoading(false);
    }
  }

  async function runImportedBusinessPlanAgent(event: React.FormEvent) {
    event.preventDefault();
    const runMonth = selectedWorkflowBusinessPlan?.planPeriodDateFrom?.slice(0, 7) || planAgentMonth;
    if (!planAgentCompanyId || !runMonth) {
      setMessage("Select company before running business plan agent.");
      return;
    }
    const company = summary?.companies.find((entry) => entry.id === planAgentCompanyId);
    setConfirmationToast({
      title: "Run business plan agent?",
      message: `Execute imported plan rules for ${company?.name ?? "selected company"}: vendor purchases, received invoices, stock update, and customer sales invoices?`,
      confirmLabel: "Run Plan Agent",
      onConfirm: async () => {
        setLoading(true);
        setAgentRunning(true);
        setPlanAgentStatus("Running imported business plan rules...");
        try {
          const result = await request<{
            purchase: { invoices: number; targets: number; scheduled?: number; sentNow?: number };
            sales: { invoices: number; targets: number; scheduled?: number; sentNow?: number };
          }>("/api/workflow/business-plan-agent/run", {
            method: "POST",
            body: JSON.stringify({
              companyId: planAgentCompanyId,
              month: runMonth,
              dateFrom: selectedWorkflowBusinessPlan?.planPeriodDateFrom || undefined,
              dateTo: selectedWorkflowBusinessPlan?.planPeriodDateTo || undefined,
            }),
          });
          const scheduled = (result.purchase.scheduled ?? 0) + (result.sales.scheduled ?? 0);
          const sentNow = (result.purchase.sentNow ?? result.purchase.invoices) + (result.sales.sentNow ?? result.sales.invoices);
          const status = `Business plan scheduled ${scheduled} future target${scheduled === 1 ? "" : "s"} and sent ${sentNow} due PO${sentNow === 1 ? "" : "s"} now.`;
          setPlanAgentStatus(status);
          setMessage(status);
          await loadSummary();
        } catch (error) {
          const text = error instanceof Error ? error.message : "Business plan agent failed";
          setPlanAgentStatus(text);
          setMessage(text);
        } finally {
          setAgentRunning(false);
          setLoading(false);
        }
      },
    });
  }

  function updateAgentInstruction(value: string) {
    setAgentInstruction(value);
    const parsed = parseAgentInstructionDraft(value);
    if (parsed.poCount && parsed.poCount > 0) setAgentPoCount(String(Math.min(parsed.poCount, 10)));
    if (parsed.amount) setAgentAmount(parsed.amount);
    if (parsed.lineCount && parsed.lineCount > 0) setAgentLineCount(String(Math.min(parsed.lineCount, 20)));
    if (parsed.amountMode) setAgentAmountMode(parsed.amountMode);
    if (parsed.direction) setWorkflowDirection(parsed.direction);
    if (parsed.wantsInvoice) setAgentAutoInvoice(true);
    if (parsed.isToday) {
      setAgentDateFrom(parsed.today);
      setAgentDateTo(parsed.today);
      setAgentAutoStart(true);
    } else if (parsed.isWeek) {
      setAgentDateFrom(parsed.today);
      setAgentDateTo(parsed.weekEnd);
    }
  }

  async function runBusinessPlanById(plan: SavedBusinessPlan) {
    const runMonth = plan.planPeriodDateFrom?.slice(0, 7) || planAgentMonth;
    if (!runMonth) {
      setMessage("Set a plan period before starting the business plan agent.");
      return;
    }
    const controller = new AbortController();
    businessPlanAbortControllers.current[plan.planId] = controller;
    setBusinessPlanRunStatus((current) => ({ ...current, [plan.planId]: "RUNNING" }));
    setAgentRunning(true);
    try {
      const response = await fetch(`${apiUrl}/api/workflow/business-plan-agent/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          companyId: plan.companyId,
          planId: plan.planId,
          month: runMonth,
          dateFrom: plan.planPeriodDateFrom || undefined,
          dateTo: plan.planPeriodDateTo || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not run business plan agent");
      setBusinessPlanRunStatus((current) => ({ ...current, [plan.planId]: "COMPLETED" }));
      const scheduled = (data.purchase?.scheduled ?? 0) + (data.sales?.scheduled ?? 0);
      const sentNow = (data.purchase?.sentNow ?? data.purchase?.invoices ?? 0) + (data.sales?.sentNow ?? data.sales?.invoices ?? 0);
      setPlanAgentStatus(`Business plan scheduled ${scheduled} future target${scheduled === 1 ? "" : "s"} and sent ${sentNow} due PO${sentNow === 1 ? "" : "s"} now.`);
      await loadSummary();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setBusinessPlanRunStatus((current) => ({ ...current, [plan.planId]: "STOPPED" }));
        setPlanAgentStatus("Business plan agent stopped from the UI.");
      } else {
        setBusinessPlanRunStatus((current) => ({ ...current, [plan.planId]: "FAILED" }));
        setMessage(error instanceof Error ? error.message : "Could not run business plan agent");
      }
    } finally {
      delete businessPlanAbortControllers.current[plan.planId];
      setAgentRunning(false);
    }
  }

  function stopBusinessPlanRun(planId: string) {
    businessPlanAbortControllers.current[planId]?.abort();
    setBusinessPlanRunStatus((current) => ({ ...current, [planId]: "STOPPED" }));
  }

  function selectSidebarCompany(companyId: string) {
    setCompanyScopeId(companyId);
    setReportCompanyId(companyId);
    setBusinessPlanCompanyId(companyId);
    setPlanAgentCompanyId(companyId);
    setWorkflowCompanyId(companyId);
    setStockCompanyId(companyId);
    setPlanStockCompanyId(companyId);
    setInvoiceCompanyId(companyId);
    setEmailCompanyId(companyId);
  }

  function openWorkflowBusinessPlanImport() {
    if (workflowSelectedCompanyId) setBusinessPlanCompanyId(workflowSelectedCompanyId);
    setSettingsTab("businessImport");
    setActiveView("settings");
  }

  function parseBusinessPlanPartnerText(text: string, role: "BUYER" | "SELLER") {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = "", percentText = "", email = "", address = ""] = line.split("|").map((part) => part.trim());
        const allocationPercent = percentText ? Number(percentText.replace("%", "")) : undefined;
        return {
          name,
          role,
          allocationPercent: Number.isFinite(allocationPercent) ? allocationPercent : undefined,
          email: email || undefined,
          address: address || undefined,
        };
      })
      .filter((partner) => partner.name);
  }

  async function saveBusinessPlanEdits(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkflowBusinessPlan || !workflowSelectedCompanyId) {
      setMessage("Select an uploaded business plan first.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const purchaseTargetAmount = Number(form.get("purchaseTargetAmount") || 0);
    const salesTargetAmount = Number(form.get("salesTargetAmount") || 0);
    const transactionPercent = Number(form.get("transactionPercent") || 0);
    const purchaseInvoiceRuleText = String(form.get("purchaseInvoiceRuleText") ?? "").trim();
    const salesInvoiceRuleText = String(form.get("salesInvoiceRuleText") ?? "").trim();
    const planPeriodDateFrom = String(form.get("planPeriodDateFrom") ?? "").trim();
    const planPeriodDateTo = String(form.get("planPeriodDateTo") ?? "").trim();
    const purchaseVendors = parseBusinessPlanPartnerText(String(form.get("purchaseVendors") ?? ""), "SELLER");
    const salesCustomers = parseBusinessPlanPartnerText(String(form.get("salesCustomers") ?? ""), "BUYER");
    const salesAllocations = salesCustomers.map(({ name, allocationPercent, email, address }) => ({
      name,
      role: "BUYER",
      allocationPercent,
      email,
      address,
    }));
    if (!purchaseVendors.length && !salesCustomers.length) {
      setMessage("Add at least one vendor or customer allocation before saving the business plan.");
      return;
    }

    setLoading(true);
    try {
      const targetMonth = planPeriodDateFrom.slice(0, 7) || selectedWorkflowBusinessPlan.planPeriodDateFrom?.slice(0, 7) || planAgentMonth;
      await request(`/api/workflow/business-plan/${workflowSelectedCompanyId}/${encodeURIComponent(selectedWorkflowBusinessPlan.planId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          month: targetMonth,
          purchaseTargetAmount: Number.isFinite(purchaseTargetAmount) ? purchaseTargetAmount : undefined,
          salesTargetAmount: Number.isFinite(salesTargetAmount) ? salesTargetAmount : undefined,
          plan: {
            ...selectedWorkflowBusinessPlan,
            planPeriodDateFrom: planPeriodDateFrom || undefined,
            planPeriodDateTo: planPeriodDateTo || undefined,
            purchasePlan: {
              ...selectedWorkflowBusinessPlan.purchasePlan,
              revenueTargetText: purchaseTargetAmount ? `AED ${purchaseTargetAmount}` : selectedWorkflowBusinessPlan.purchasePlan?.revenueTargetText,
              transactionAmountMin: Number.isFinite(purchaseTargetAmount) ? purchaseTargetAmount : selectedWorkflowBusinessPlan.purchasePlan?.transactionAmountMin,
              transactionAmountMax: Number.isFinite(purchaseTargetAmount) ? purchaseTargetAmount : selectedWorkflowBusinessPlan.purchasePlan?.transactionAmountMax,
              transactionPercent: Number.isFinite(transactionPercent) && transactionPercent > 0 ? transactionPercent / 100 : selectedWorkflowBusinessPlan.purchasePlan?.transactionPercent,
              invoiceRuleText: purchaseInvoiceRuleText || selectedWorkflowBusinessPlan.purchasePlan?.invoiceRuleText,
            },
            salesPlan: {
              ...selectedWorkflowBusinessPlan.salesPlan,
              invoiceRuleText: salesInvoiceRuleText || selectedWorkflowBusinessPlan.salesPlan?.invoiceRuleText,
            },
            purchaseVendors,
            salesCustomers,
            salesAllocations,
          },
        }),
      });
      setShowBusinessPlanEditor(false);
      setMessage("Uploaded business plan modified and saved.");
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save business plan changes");
    } finally {
      setLoading(false);
    }
  }

  function applyAgentTemplate(template: "today" | "multipleToday" | "weekly" | "monthly" | "buy" | "sell") {
    const today = dateInputValue();
    const weekEnd = dateInputValue(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
    const monthStart = monthStartInputValue();
    const monthEnd = monthEndInputValue();
    if (template === "today") {
      setWorkflowDirection("PURCHASE");
      setAgentInstruction("Create purchase order today for AED 10000 with 3 random products and send vendor invoice.");
      setAgentPoCount("1");
      setAgentDateFrom(today);
      setAgentDateTo(today);
      setAgentAmountMode("PER_PO");
      setAgentAmount("10000");
      setAgentLineCount("3");
      setAgentProductMode("RANDOM");
      setAgentAutoStart(true);
      setAgentAutoInvoice(true);
    }
    if (template === "multipleToday") {
      setWorkflowDirection("PURCHASE");
      setAgentInstruction("Create 5 separate purchase orders today for AED 10000 each with 3 random products and send vendor invoice.");
      setAgentPoCount("5");
      setAgentDateFrom(today);
      setAgentDateTo(today);
      setAgentAmountMode("PER_PO");
      setAgentAmount("10000");
      setAgentLineCount("3");
      setAgentProductMode("RANDOM");
      setAgentAutoStart(true);
      setAgentAutoInvoice(true);
    }
    if (template === "weekly") {
      setWorkflowDirection("PURCHASE");
      setAgentInstruction("Create weekly scheduled purchase orders for AED 50000 total split amount with 3 random products.");
      setAgentPoCount("5");
      setAgentDateFrom(today);
      setAgentDateTo(weekEnd);
      setAgentAmountMode("TOTAL_SPLIT");
      setAgentAmount("50000");
      setAgentLineCount("3");
      setAgentProductMode("RANDOM");
      setAgentAutoStart(false);
      setAgentAutoInvoice(true);
    }
    if (template === "monthly") {
      setWorkflowDirection("PURCHASE");
      setAgentInstruction("Create monthly scheduled purchase orders for AED 2000000 total split amount with 3 random products.");
      setAgentPoCount("20");
      setAgentDateFrom(monthStart);
      setAgentDateTo(monthEnd);
      setAgentAmountMode("TOTAL_SPLIT");
      setAgentAmount("2000000");
      setAgentLineCount("3");
      setAgentProductMode("RANDOM");
      setAgentAutoStart(false);
      setAgentAutoInvoice(true);
    }
    if (template === "buy") {
      setWorkflowDirection("PURCHASE");
      setAgentInstruction("Buy from vendor: create purchase order today for AED 10000 with 3 random products and send vendor invoice.");
      setAgentPoCount("1");
      setAgentDateFrom(today);
      setAgentDateTo(today);
      setAgentAmountMode("PER_PO");
      setAgentAmount("10000");
      setAgentLineCount("3");
      setAgentProductMode("RANDOM");
      setAgentAutoStart(true);
      setAgentAutoInvoice(true);
    }
    if (template === "sell") {
      setWorkflowDirection("SALES");
      setAgentInstruction("Sell to customer: create sales PO today for AED 10000 with 3 random products and send vendor invoice.");
      setAgentPoCount("1");
      setAgentDateFrom(today);
      setAgentDateTo(today);
      setAgentAmountMode("PER_PO");
      setAgentAmount("10000");
      setAgentLineCount("3");
      setAgentProductMode("RANDOM");
      setAgentAutoStart(true);
      setAgentAutoInvoice(true);
    }
  }

  function toggleWorkflowItem(itemId: string) {
    setWorkflowItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  }

  async function runWorkflow(targetId: string) {
    const target = summary?.targets.find((entry) => entry.id === targetId);
    setConfirmationToast({
      title: "Send purchase order?",
      message: target ? `Send PO from ${target.buyerCompany.name} to ${target.sellerCompany.name}?` : "Send this purchase order to the vendor?",
      confirmLabel: "Send PO",
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/workflow/targets/${targetId}/run`, { method: "POST" });
          setMessage("Buyer PO sent to vendor. Vendor can now create invoice from their portal.");
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Workflow failed");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function createVendorInvoice(targetId: string) {
    const target = summary?.targets.find((entry) => entry.id === targetId);
    setConfirmationToast({
      title: "Create vendor invoice?",
      message: target ? `Create invoice from ${target.sellerCompany.name} back to ${target.buyerCompany.name}?` : "Create and email the vendor invoice?",
      confirmLabel: "Create Invoice",
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/workflow/targets/${targetId}/vendor-invoice`, { method: "POST" });
          setMessage("Vendor invoice created and emailed back to buyer.");
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not create vendor invoice");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function stopWorkflow(targetId: string) {
    setConfirmationToast({
      title: "Stop workflow?",
      message: "Stop this open target before the agent sends the PO?",
      confirmLabel: "Stop",
      danger: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/workflow/targets/${targetId}/stop`, { method: "POST" });
          setMessage("Target stopped before workflow started.");
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not stop target");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function saveStock(event: React.FormEvent) {
    event.preventDefault();
    const quantity = Number(stockQuantity);
    if (!stockCompanyId || !stockItemId) {
      setMessage("Select company and item before saving stock.");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      setMessage("Stock quantity must be a positive whole number or zero.");
      return;
    }

    setLoading(true);
    try {
      await request("/api/catalog/stock", {
        method: "POST",
        body: JSON.stringify({ companyId: stockCompanyId, itemId: stockItemId, quantity }),
      });
      setMessage("Stock updated.");
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update stock");
    } finally {
      setLoading(false);
    }
  }

  async function generatePlanStock(event: React.FormEvent) {
    event.preventDefault();
    const company = summary?.companies.find((entry) => entry.id === planStockCompanyId);
    const target = summary?.turnoverTargets.find((entry) =>
      entry.companyId === planStockCompanyId && entry.type === "PURCHASE" && entry.month === planStockMonth
    );
    if (!planStockCompanyId || !planStockMonth) {
      setMessage("Select company and month before generating plan stock.");
      return;
    }
    if (!target) {
      setMessage("No purchase turnover target found for this company and month.");
      return;
    }
    setConfirmationToast({
      title: "Generate plan stock?",
      message: `Create stock quantity for ${company?.name ?? "selected company"} from ${planStockMonth} purchase target ${money(target.amount)} using product buying prices?`,
      confirmLabel: "Generate Stock",
      onConfirm: async () => {
        setLoading(true);
        setPlanStockStatus("Generating stock quantity and purchase value from business plan...");
        try {
          const result = await request<{ productCount: number; totalQuantity: number; generatedPurchaseValue: string }>("/api/catalog/stock/from-business-plan", {
            method: "POST",
            body: JSON.stringify({ companyId: planStockCompanyId, month: planStockMonth }),
          });
          setPlanStockStatus(`Generated ${result.totalQuantity} quantity across ${result.productCount} products. Purchase value: ${money(result.generatedPurchaseValue)}.`);
          setMessage("Business plan stock generated.");
          await loadSummary();
        } catch (error) {
          const text = error instanceof Error ? error.message : "Could not generate plan stock";
          setPlanStockStatus(text);
          setMessage(text);
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function buyEcommerceProduct(stock: Stock) {
    const buyerCompanyId = companyScopeId !== "ALL"
      ? companyScopeId
      : activeCompanies.find((company) => company.id !== stock.company.id)?.id ?? "";
    if (!buyerCompanyId || buyerCompanyId === stock.company.id) {
      setMessage("Select a buyer company different from the product seller before buying.");
      return;
    }

    setConfirmationToast({
      title: "Buy product?",
      message: `Create one order for ${stock.item.sku} from ${stock.company.name}?`,
      confirmLabel: "Buy",
      onConfirm: async () => {
        setLoading(true);
        try {
          await request("/api/ecommerce/orders", {
            method: "POST",
            body: JSON.stringify({
              buyerCompanyId,
              sellerCompanyId: stock.company.id,
              itemId: stock.item.id,
              quantity: 1,
            }),
          });
          setMessage(`${stock.item.sku} bought and added to delivery tracking.`);
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not buy product");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function markEcommerceDelivered(orderId: string) {
    setConfirmationToast({
      title: "Mark delivered?",
      message: "Mark this ecommerce order as delivered?",
      confirmLabel: "Mark Delivered",
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/ecommerce/orders/${orderId}/deliver`, { method: "PATCH" });
          setMessage("Delivery marked complete.");
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not update delivery");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function createStockItem(event: React.FormEvent) {
    event.preventDefault();
    const expectedPrice = Number(newItemPrice);
    if (!newSku || !newItemName || !Number.isFinite(expectedPrice) || expectedPrice <= 0) {
      setMessage("Enter SKU, item name, and valid expected price.");
      return;
    }

    setLoading(true);
    try {
      const item = await request<Item>("/api/catalog/items", {
        method: "POST",
        body: JSON.stringify({
          sku: newSku,
          name: newItemName,
          unit: newItemUnit || "pcs",
          expectedPrice,
          vatRate: 0.05,
        }),
      });
      setMessage("Item created. You can now set stock quantity.");
      setStockItemId(item.id);
      setNewSku("");
      setNewItemName("");
      setNewItemPrice("");
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create item");
    } finally {
      setLoading(false);
    }
  }

  async function uploadBulkStock(event: React.FormEvent) {
    event.preventDefault();
    if (!bulkCompanyId || !bulkCsvText.trim()) {
      setMessage("Select company and paste stock CSV rows.");
      return;
    }

    const rowCount = bulkCsvText.trim().split(/\r?\n/).filter(Boolean).length;
    setConfirmationToast({
      title: "Upload stock rows?",
      message: `Import ${rowCount} stock rows using ${bulkMode.toLowerCase()} mode?`,
      confirmLabel: "Upload Stock",
      onConfirm: async () => {
        setLoading(true);
        try {
          const result = await request<{ imported: number }>("/api/catalog/stock/bulk", {
            method: "POST",
            body: JSON.stringify({ companyId: bulkCompanyId, mode: bulkMode, csvText: bulkCsvText }),
          });
          setMessage(`Bulk stock uploaded: ${result.imported} rows.`);
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not upload bulk stock");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function parsePurchaseInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!invoiceCompanyId || !purchaseInvoiceText.trim()) {
      setMessage("Select receiving company and paste purchase invoice lines.");
      return;
    }

    setConfirmationToast({
      title: "Insert stock from invoice?",
      message: "Parse this purchase invoice text and add the detected lines into stock?",
      confirmLabel: "Insert Stock",
      onConfirm: async () => {
        setLoading(true);
        try {
          const result = await request<{ imported: number }>("/api/catalog/stock/from-purchase-invoice", {
            method: "POST",
            body: JSON.stringify({ companyId: invoiceCompanyId, invoiceText: purchaseInvoiceText }),
          });
          setMessage(`Purchase invoice parsed: ${result.imported} stock lines added.`);
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not parse purchase invoice");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function loadInvoice(invoiceId: string) {
    setLoading(true);
    try {
      setInvoiceDetail(await request<InvoiceDetail>(`/api/invoices/${invoiceId}`));
    } finally {
      setLoading(false);
    }
  }

  async function sendInvoice(invoiceId: string) {
    setConfirmationToast({
      title: "Send invoice email?",
      message: "Send this invoice by email using the configured company email settings?",
      confirmLabel: "Send Invoice",
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/invoices/${invoiceId}/send`, { method: "POST" });
          setMessage("Invoice email logged as sent.");
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not send invoice");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  async function downloadInvoicePdf(invoiceId: string) {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/invoices/${invoiceId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Could not download PDF" }));
        throw new Error(data.error ?? "Could not download PDF");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const invoice = invoiceDetail?.id === invoiceId ? invoiceDetail : (summary?.invoices ?? []).find((item) => item.id === invoiceId);
      link.href = url;
      link.download = `${invoice?.invoiceNumber ?? "invoice"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Invoice PDF downloaded.");
      await loadInvoice(invoiceId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not download PDF");
    } finally {
      setLoading(false);
    }
  }

  async function downloadTargetPoPdf(target: Target) {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/workflow/targets/${target.id}/po-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Could not download PO PDF" }));
        throw new Error(data.error ?? "Could not download PO PDF");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `purchase-order-${target.month}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("PO PDF downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not download PO PDF");
    } finally {
      setLoading(false);
    }
  }

  async function saveEmailIntegration(event: React.FormEvent) {
    event.preventDefault();
    if (!emailCompanyId || !integrationEmail) {
      setMessage("Select company and enter Gmail address.");
      return;
    }

    setLoading(true);
    try {
      await request("/api/email-integrations", {
        method: "POST",
        body: JSON.stringify({
          companyId: emailCompanyId,
          email: integrationEmail,
          mode: integrationMode,
          status: integrationMode === "LIVE" ? "READY_TO_CONNECT" : "READY_TO_CONNECT",
        }),
      });
      setMessage("Email integration settings saved.");
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save email integration");
    } finally {
      setLoading(false);
    }
  }

  async function saveGmailConfig(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const status = await request<EmailConfigStatus>("/api/email-integrations/config", {
        method: "POST",
        body: JSON.stringify({
          googleClientId,
          googleClientSecret,
          googleRedirectUri,
          gmailTokenEncryptionKey,
        }),
      });
      setEmailConfigStatus(status);
      setGoogleClientSecret("");
      setGmailTokenEncryptionKey("");
      setMessage("Gmail OAuth configuration saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save Gmail config");
    } finally {
      setLoading(false);
    }
  }

  async function saveSmtpImapConfig(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const status = await request<EmailConfigStatus>("/api/email-integrations/config/smtp-imap", {
        method: "POST",
        body: JSON.stringify({
          smtpHost,
          smtpPort: Number(smtpPort),
          smtpEncryption,
          smtpUsername,
          smtpPassword,
          imapHost,
          imapPort: Number(imapPort),
          imapEncryption,
          imapUsername,
          imapPassword,
        }),
      });
      setEmailConfigStatus(status);
      setSmtpPassword("");
      setImapPassword("");
      setMessage("SMTP/IMAP configuration saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save SMTP/IMAP config");
    } finally {
      setLoading(false);
    }
  }

  async function testEmailIntegration(companyId: string) {
    setConfirmationToast({
      title: "Test email integration?",
      message: "Run a test against this company's email configuration and log the result?",
      confirmLabel: "Run Test",
      onConfirm: async () => {
        setLoading(true);
        try {
          await request(`/api/email-integrations/${companyId}/test`, { method: "POST" });
          setMessage("Email integration test logged.");
          await loadSummary();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not test email integration");
        } finally {
          setLoading(false);
        }
      },
    });
  }

  const activeCompanies = (summary?.companies ?? []).filter((company) => company.active !== false);
  const portalOwnerCompany = companyScopeId === "ALL" ? null : (summary?.companies ?? []).find((company) => company.id === companyScopeId) ?? null;
  const scopedCompanies = companyScopeId === "ALL"
    ? summary?.companies ?? []
    : (summary?.companies ?? []).filter((company) => isPartnerForCompany(company, companyScopeId));
  const scopedCompanyEmails = new Set(scopedCompanies.map((company) => company.email));
  const scopedStock = companyScopeId === "ALL"
    ? summary?.stock ?? []
    : (summary?.stock ?? []).filter((stock) => stock.company.id === companyScopeId);
  const scopedStockMovementReport = companyScopeId === "ALL"
    ? summary?.stockMovementReport ?? []
    : (summary?.stockMovementReport ?? []).filter((row) => row.companyId === companyScopeId);
  const productMasterRows = summary?.items ?? [];
  const stockItemIds = new Set(scopedStock.map((stock) => stock.item.id));
  const ecommerceProductRows = (summary?.stock ?? [])
    .filter((stock) => stock.quantity > 0)
    .filter((stock) => companyScopeId === "ALL" || stock.company.id !== companyScopeId);
  const scopedTargets = companyScopeId === "ALL"
    ? summary?.targets ?? []
    : (summary?.targets ?? []).filter((target) => target.buyerCompany.id === companyScopeId || target.sellerCompany.id === companyScopeId);
  const todayDate = dateInputValue();
  const todayTargets = scopedTargets.filter((target) => target.targetDate === todayDate);
  const otherWorkflowTargets = scopedTargets.filter((target) => target.targetDate !== todayDate);
  const scopedInvoices = companyScopeId === "ALL"
    ? summary?.invoices ?? []
    : (summary?.invoices ?? []).filter((invoice) => invoice.buyerCompany.id === companyScopeId || invoice.sellerCompany.id === companyScopeId);
  const scopedEmails = companyScopeId === "ALL"
    ? summary?.emails ?? []
    : (summary?.emails ?? []).filter((emailLog) => scopedCompanyEmails.has(emailLog.fromEmail) || scopedCompanyEmails.has(emailLog.toEmail));
  const scopedAgentAuditLogs = summary?.agentAuditLogs ?? [];
  const scopedEmailIntegrations = companyScopeId === "ALL"
    ? summary?.emailIntegrations ?? []
    : (summary?.emailIntegrations ?? []).filter((integration) => integration.companyId === companyScopeId);
  const scopedStockByCompany = companyScopeId === "ALL"
    ? summary?.overview.stockByCompany ?? []
    : (summary?.overview.stockByCompany ?? []).filter((row) => row.companyId === companyScopeId);
  const scopedInvoiceTotal = scopedInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const scopedVatTotal = scopedInvoices.reduce((sum, invoice) => sum + Number(invoice.vatAmount), 0);
  const scopedTurnoverTargets = companyScopeId === "ALL"
    ? summary?.turnoverTargets ?? []
    : (summary?.turnoverTargets ?? []).filter((target) => target.companyId === companyScopeId);
  const scopedEcommerceOrders = companyScopeId === "ALL"
    ? summary?.ecommerceOrders ?? []
    : (summary?.ecommerceOrders ?? []).filter((order) => order.buyerCompany.id === companyScopeId || order.sellerCompany.id === companyScopeId);
  const allBusinessPlans = [
    ...(summary?.businessPlans ?? []),
    ...(pendingImportedBusinessPlan && !(summary?.businessPlans ?? []).some((plan) => plan.planId === pendingImportedBusinessPlan.planId) ? [pendingImportedBusinessPlan] : []),
  ];
  const dashboardCompany = companyScopeId === "ALL" ? undefined : (summary?.companies ?? []).find((company) => company.id === companyScopeId);
  const dashboardBusinessPlans = allBusinessPlans.filter((plan) =>
    companyScopeId === "ALL" ? !plan.parseError : businessPlanBelongsToCompany(plan, dashboardCompany)
  );
  const dashboardBusinessPlan = dashboardBusinessPlans[0];
  const dashboardPlanMonth = dashboardBusinessPlan?.planPeriodDateFrom?.slice(0, 7);
  const dashboardPeriodFrom = dashboardBusinessPlan?.planPeriodDateFrom;
  const dashboardPeriodTo = dashboardBusinessPlan?.planPeriodDateTo;
  const dashboardPeriodInvoices = scopedInvoices.filter((invoice) => {
    if (!dashboardPeriodFrom && !dashboardPeriodTo) return true;
    const invoiceDate = appDate(invoice.createdAt);
    return (!dashboardPeriodFrom || invoiceDate >= dashboardPeriodFrom) && (!dashboardPeriodTo || invoiceDate <= dashboardPeriodTo);
  });
  const dashboardPlanTargets = scopedTurnoverTargets.filter((target) =>
    target.type === "PURCHASE"
    && (!dashboardPlanMonth || target.month === dashboardPlanMonth)
    && (!dashboardBusinessPlan || target.companyId === dashboardBusinessPlan.companyId || target.companyId === dashboardBusinessPlan.mainCompanyId || target.companyId === dashboardCompany?.id)
  );
  const dashboardPurchaseInvoices = companyScopeId === "ALL"
    ? dashboardPeriodInvoices
    : dashboardPeriodInvoices.filter((invoice) => invoice.buyerCompany.id === companyScopeId);
  const dashboardSalesInvoices = companyScopeId === "ALL"
    ? dashboardPeriodInvoices
    : dashboardPeriodInvoices.filter((invoice) => invoice.sellerCompany.id === companyScopeId);
  const dashboardTargetValue = dashboardPlanTargets.reduce((sum, target) => sum + Number(target.amount), 0);
  const dashboardPurchaseValue = dashboardPurchaseInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const dashboardSalesValue = dashboardSalesInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const dashboardProfitValue = dashboardSalesValue - dashboardPurchaseValue;
  const dashboardStockValue = scopedStockMovementReport.reduce((sum, row) => sum + Number(row.balanceSellingValue), 0);
  const filteredPurchaseVendorWise = (reports?.purchase.vendorWise ?? []).filter((row) => reportVendorId === "ALL" || row.vendorId === reportVendorId);
  const filteredPurchaseProductWise = (reports?.purchase.productWise ?? []).filter((row) => reportProductId === "ALL" || row.itemId === reportProductId);
  const filteredPurchaseInvoiceWise = (reports?.purchase.invoiceWise ?? []).filter((row) =>
    (reportVendorId === "ALL" || row.vendorName === (summary?.companies ?? []).find((company) => company.id === reportVendorId)?.name)
    && (reportProductId === "ALL" || filteredPurchaseProductWise.length > 0)
  );
  const filteredSalesCustomerWise = (reports?.sales.customerWise ?? []).filter((row) => reportCustomerId === "ALL" || row.customerId === reportCustomerId);
  const filteredSalesProductWise = (reports?.sales.productWise ?? []).filter((row) => reportProductId === "ALL" || row.itemId === reportProductId);
  const filteredSalesInvoiceWise = (reports?.sales.invoiceWise ?? []).filter((row) =>
    (reportCustomerId === "ALL" || row.customerName === (summary?.companies ?? []).find((company) => company.id === reportCustomerId)?.name)
    && (reportProductId === "ALL" || filteredSalesProductWise.length > 0)
  );
  const filteredProfitRows = (reports?.profit.rows ?? []).filter((row) =>
    reportProductId === "ALL" || (summary?.items ?? []).find((item) => item.id === reportProductId)?.sku === row.sku
  );
  const filteredStockRows = (reports?.stock.rows ?? []).filter((row) =>
    reportProductId === "ALL" || (summary?.items ?? []).find((item) => item.id === reportProductId)?.sku === row.sku
  );
  const visibleCompanyOptions = isCompanyPortal ? scopedCompanies : activeCompanies;
  const businessPlanOwnerOptions = visibleCompanyOptions.filter((company) => !company.managedByCompanyId);
  const businessPlanCompanyOptions = businessPlanOwnerOptions.length ? businessPlanOwnerOptions : visibleCompanyOptions;
  const sidebarCompanyLinks = summary
    ? activeCompanies.filter((company) => !company.managedByCompanyId)
    : [];
  const workflowSelectedCompanyId = planAgentCompanyId || businessPlanCompanyOptions[0]?.id || "";
  const workflowSelectedCompany = businessPlanCompanyOptions.find((company) => company.id === workflowSelectedCompanyId);
  const workflowScopedTargets = workflowSelectedCompanyId
    ? scopedTargets.filter((target) => target.buyerCompany.id === workflowSelectedCompanyId || target.sellerCompany.id === workflowSelectedCompanyId)
    : scopedTargets;
  const workflowTodayTargets = workflowScopedTargets.filter((target) => target.targetDate === todayDate);
  const workflowOtherTargets = workflowScopedTargets.filter((target) => target.targetDate !== todayDate);
  const workflowTodayTotalPages = Math.max(1, Math.ceil(workflowTodayTargets.length / workflowPageSize));
  const workflowOtherTotalPages = Math.max(1, Math.ceil(workflowOtherTargets.length / workflowPageSize));
  const workflowTodayCurrentPage = Math.min(workflowTodayPage, workflowTodayTotalPages);
  const workflowOtherCurrentPage = Math.min(workflowOtherPage, workflowOtherTotalPages);
  const pagedWorkflowTodayTargets = workflowTodayTargets.slice((workflowTodayCurrentPage - 1) * workflowPageSize, workflowTodayCurrentPage * workflowPageSize);
  const pagedWorkflowOtherTargets = workflowOtherTargets.slice((workflowOtherCurrentPage - 1) * workflowPageSize, workflowOtherCurrentPage * workflowPageSize);
  const rawWorkflowBusinessPlans = allBusinessPlans.filter((plan) => businessPlanBelongsToCompany(plan, workflowSelectedCompany));
  const appendedWorkflowBusinessPlans = rawWorkflowBusinessPlans.filter((plan) => plan.planId.split(":").length > 2);
  const selectedWorkflowBusinessPlans = appendedWorkflowBusinessPlans.length ? appendedWorkflowBusinessPlans : rawWorkflowBusinessPlans;
  const selectedWorkflowBusinessPlan = selectedWorkflowBusinessPlans.find((plan) => plan.planId === editingBusinessPlanId) ?? selectedWorkflowBusinessPlans[0];
  const workflowPlanMonth = selectedWorkflowBusinessPlan?.planPeriodDateFrom?.slice(0, 7) || planAgentMonth;
  const selectedWorkflowPurchaseTarget = (summary?.turnoverTargets ?? []).find((target) => target.company.id === workflowSelectedCompanyId && target.type === "PURCHASE" && target.month === workflowPlanMonth);
  const selectedWorkflowSalesTarget = (summary?.turnoverTargets ?? []).find((target) => target.company.id === workflowSelectedCompanyId && target.type === "SALES" && target.month === workflowPlanMonth);
  const selectedBusinessPlanCompany = activeCompanies.find((company) => company.id === businessPlanCompanyId);
  const partnerCompanyOptions = portalOwnerCompany
    ? activeCompanies.filter((company) => isPartnerForCompany(company, portalOwnerCompany.id))
    : activeCompanies;
  const allCustomerCompanyOptions = partnerCompanyOptions.filter(canBeCustomer);
  const allVendorCompanyOptions = partnerCompanyOptions.filter(canBeVendor);
  const settingsCompanyOptions = !isCompanyPortal || companyScopeId === "ALL" || !portalOwnerCompany
    ? summary?.companies ?? []
    : (summary?.companies ?? []).filter((company) => isPartnerForCompany(company, portalOwnerCompany.id));
  const settingsCompaniesForTab = companyPartnerTab === "companies"
    ? settingsCompanyOptions.filter((company) => !company.managedByCompanyId)
    : companyPartnerTab === "customers"
      ? settingsCompanyOptions.filter(isManagedCustomer)
      : settingsCompanyOptions.filter(isManagedVendor);
  const workflowSellerId = workflowDirection === "PURCHASE" ? workflowCounterpartyId : workflowCompanyId;
  const workflowProductOptions = (summary?.items ?? []).map((item) => {
    const stock = (summary?.stock ?? []).find((entry) => entry.company.id === workflowSellerId && entry.item.id === item.id);
    return { item, quantity: stock?.quantity ?? 0 };
  }).filter((entry) => entry.quantity > 0);
  const canCreateVendorInvoice = (target: Target) => target.status === "PO_SENT" && (companyScopeId === "ALL" || target.sellerCompany.id === companyScopeId);
  const targetDocumentValue = (target: Target) => {
    if (target.documentValue) return money(target.documentValue);
    const total = target.lines.reduce((sum, line) => sum + Number(line.maxPrice ?? line.item.expectedPrice) * line.quantity * 1.05, 0);
    return money(total);
  };
  const agentPreview = {
    count: Math.max(1, Number(agentPoCount) || 1),
    amountMode: agentAmountMode === "PER_PO" ? `${money(agentAmount)} each` : `${money(agentAmount)} total split`,
    date: agentDateFrom === agentDateTo ? (agentDateFrom === todayDate ? "today" : agentDateFrom) : `${agentDateFrom} to ${agentDateTo}`,
    products: agentProductMode === "RANDOM" ? `${Math.max(1, Number(agentLineCount) || 1)} random` : `${workflowItemIds.length} selected`,
    invoice: agentAutoInvoice
      ? agentInvoiceDelayMode === "RANDOM"
        ? `random ${Number(agentInvoiceDelayMin) || 0}-${Number(agentInvoiceDelayMax) || 0} minutes`
        : `after ${Number(agentInvoiceDelay) || 0} minute${Number(agentInvoiceDelay) === 1 ? "" : "s"}`
      : "manual",
  };
  const portalDisplayName = portalCompanyName === "Dealzarabia" ? "Dealz" : portalCompanyName;
  const portalTitle = isCompanyPortal ? `${portalDisplayName} Portal` : "Admin Portal";
  const portalSubtitle = isCompanyPortal
    ? `${portalDisplayName} data and workflows only.`
    : "All company data in one admin view.";

  if (!token) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={handleLogin}>
          <div className="brand-row">
            <ShieldCheck size={28} />
            <div>
              <h1>{portalTitle}</h1>
              <p>Agent-to-agent procurement portal</p>
            </div>
          </div>
          <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button type="submit"><LogIn size={18} /> Login</button>
          {message && <p className="notice">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row compact">
          <ShieldCheck size={24} />
          <strong>{portalTitle}</strong>
        </div>
        <div className="portal-links">
          {sidebarCompanyLinks.map((company) => (
            <button
              type="button"
              key={company.id}
              className={companyScopeId === company.id ? "active-portal-link" : ""}
              onClick={() => selectSidebarCompany(company.id)}
              title={company.legalName}
            >
              {company.name}
            </button>
          ))}
          <button
            type="button"
            className={companyScopeId === "ALL" ? "active-portal-link" : ""}
            onClick={() => setCompanyScopeId("ALL")}
          >
            Admin
          </button>
        </div>
        <nav>
          <NavButton icon={<Building2 size={18} />} label="Overview" view="overview" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<Package size={18} />} label="Stock" view="stock" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<ShoppingCart size={18} />} label="Ecom Products" view="ecommerce" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<Play size={18} />} label="Workflow" view="workflow" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<FileText size={18} />} label="Invoices" view="invoices" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<ShieldCheck size={18} />} label="Reports" view="reports" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<Settings size={18} />} label="Settings" view="settings" activeView={activeView} onSelect={setActiveView} />
        </nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <h1>{portalTitle}</h1>
            <p>{portalSubtitle}</p>
          </div>
          <div className="actions">
            {!isCompanyPortal && (
              <label className="scope-control">
                Company Scope
                <select value={companyScopeId} onChange={(event) => setCompanyScopeId(event.target.value)}>
                  <option value="ALL">All Companies</option>
                  {(summary?.companies ?? []).map((company) => (
                    <option value={company.id} key={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" onClick={loadSummary} disabled={loading}><RefreshCcw size={17} /> Refresh</button>
            <button type="button" onClick={() => { localStorage.removeItem("b2b-token"); setToken(""); }}>Logout</button>
          </div>
        </header>

        {message && <div className={`banner ${messageSeverity(message)}`}><strong>{messageTitle(message)}</strong><span>{message}</span></div>}
        {confirmationToast && (
          <div className="toast-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="toast-confirm">
              <div>
                <strong id="confirm-title">{confirmationToast.title}</strong>
                <span>{confirmationToast.message}</span>
                {confirmationToast.typedPhrase && (
                  <label className="typed-confirmation">
                    Type {confirmationToast.typedPhrase}
                    <input value={typedConfirmation} onChange={(event) => setTypedConfirmation(event.target.value)} />
                  </label>
                )}
              </div>
              <div className="toast-actions">
                <button
                  type="button"
                  className={confirmationToast.danger ? "danger-button" : undefined}
                  disabled={loading || Boolean(confirmationToast.typedPhrase && typedConfirmation !== confirmationToast.typedPhrase)}
                  onClick={confirmToastAction}
                >
                  {loading && <span className="button-spinner" />}
                  {confirmationToast.confirmLabel}
                </button>
                <button type="button" className="secondary-button" disabled={loading} onClick={cancelToastAction}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === "overview" && (
          <>
            <section className="metrics">
              <Metric label="Target Plan" value={money(dashboardTargetValue)} />
              <Metric label="Purchase" value={money(dashboardPurchaseValue)} />
              <Metric label="Sales" value={money(dashboardSalesValue)} />
              <Metric label="Profit" value={money(dashboardProfitValue)} />
              <Metric label="Stock Value" value={money(dashboardStockValue)} />
              <Metric label="Invoices" value={scopedInvoices.length} />
            </section>

            <section className="split">
              <Panel title="Company Stock">
                <div className="table">
                  {scopedStockByCompany.map((row) => (
                    <div className="row" key={row.companyId}>
                      <span>{row.companyName}</span>
                      <span>{row.itemCount} items</span>
                      <span>{row.totalQuantity} total qty</span>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Workflow Status">
                <div className="table">
                  {Object.entries(summary?.overview.workflowByStatus ?? {}).map(([status, count]) => (
                    <div className="row compact-row" key={status}>
                      <span>{status}</span>
                      <span>{count}</span>
                      <span>requirements</span>
                    </div>
                  ))}
                  {!Object.keys(summary?.overview.workflowByStatus ?? {}).length && <div className="empty-state">No workflow activity yet.</div>}
                </div>
              </Panel>
            </section>

            <section className="split">
              <Panel title="Email Configuration">
                <div className="table">
                  <div className="row">
                    <span>Configured</span>
                    <span>{scopedEmailIntegrations.length}</span>
                    <span>company accounts</span>
                  </div>
                  <div className="row">
                    <span>Connected</span>
                    <span>{scopedEmailIntegrations.filter((integration) => integration.status === "CONNECTED").length}</span>
                    <span>live Gmail accounts</span>
                  </div>
                  {Object.entries(scopedEmails.reduce<Record<string, number>>((acc, emailLog) => {
                    acc[emailLog.status] = (acc[emailLog.status] ?? 0) + 1;
                    return acc;
                  }, {})).map(([status, count]) => (
                    <div className="row" key={status}>
                      <span>{status}</span>
                      <span>{count}</span>
                      <span>email logs</span>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Turnover Targets">
                <div className="table">
                  {scopedTurnoverTargets.map((target) => (
                    <div className="row" key={target.id}>
                      <span>{target.company.name}</span>
                      <span>{target.month} {target.type}</span>
                      <span>{money(target.amount)}</span>
                    </div>
                  ))}
                  {!scopedTurnoverTargets.length && <div className="empty-state">No turnover target configured.</div>}
                </div>
              </Panel>
            </section>

            <section className="split">
              <Panel title="Recent Database Activity">
                <div className="table">
                  {(summary?.overview.recentActivity ?? []).map((activity) => (
                    <div className="row activity-row" key={`${activity.type}-${activity.id}`}>
                      <span>{activity.type}</span>
                      <span>{activity.title}</span>
                      <span>{activity.status}</span>
                      <span>{appDateTime(activity.date)}</span>
                    </div>
                  ))}
                  {!(summary?.overview.recentActivity ?? []).length && <div className="empty-state">No database activity yet.</div>}
                </div>
              </Panel>
            </section>
          </>
        )}

        {activeView === "settings" && (
          <Panel title="Settings">
            <div className="settings-tabs">
              <button type="button" className={settingsTab === "company" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("company")}>
                <Building2 size={17} /> Company Profile
              </button>
              <button type="button" className={settingsTab === "businessImport" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("businessImport")}>
                <FileText size={17} /> Business Plan Import
              </button>
              <button type="button" className={settingsTab === "email" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("email")}>
                <Mail size={17} /> Email Configuration
              </button>
              <button type="button" className={settingsTab === "log" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("log")}>
                <Mail size={17} /> Email Log
              </button>
              <button type="button" className={settingsTab === "audit" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("audit")}>
                <ShieldCheck size={17} /> Agent Audit
              </button>
              <button type="button" className={settingsTab === "systemLogs" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("systemLogs")}>
                <Settings size={17} /> System Logs
              </button>
              <button type="button" className={settingsTab === "maintenance" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("maintenance")}>
                <Trash2 size={17} /> Maintenance
              </button>
            </div>

            {settingsTab === "company" && (
              <div className="company-card-list">
                <div className="company-list-toolbar manual-creation-toolbar">
                  <div>
                    <strong>Manual Creation</strong>
                    <span>Add one company, customer, or vendor by answering the required questions first.</span>
                  </div>
                  <button
                    type="button"
                    className={showCreateCompany ? "secondary-button" : undefined}
                    onClick={() => setShowCreateCompany((current) => !current)}
                  >
                    {showCreateCompany ? <ChevronUp size={17} /> : <Plus size={17} />}
                    {showCreateCompany ? "Close" : "Add Company"}
                  </button>
                </div>
                {showCreateCompany && (
                  <form className="company-settings-card create-company-card" onSubmit={createCompanyCard}>
                    <div className="company-card-head">
                      <div>
                        <strong>New Record Questionnaire</strong>
                        <span>Fill the required answers. Tax and bank details can be added now or later.</span>
                      </div>
                      <label className="company-active-toggle compact-toggle">
                        <span>
                          <input name="active" type="checkbox" defaultChecked />
                          <span className="status-badge completed">Active</span>
                        </span>
                      </label>
                      <label className="company-active-toggle compact-toggle">
                        <span>
                          <input name="vatEnabled" type="checkbox" defaultChecked />
                          <span className="status-badge completed">VAT On</span>
                        </span>
                      </label>
                    </div>
                    <div className="questionnaire-grid">
                      <fieldset className="question-card">
                        <legend>1. What are you adding?</legend>
                        <label>
                          Record Type
                          <select name="role" defaultValue="BOTH">
                            <option value="BUYER">Customer</option>
                            <option value="SELLER">Vendor</option>
                            <option value="BOTH">Customer & Vendor</option>
                          </select>
                        </label>
                        <label>
                          Belongs Under
                          <select name="managedByCompanyId" defaultValue={portalOwnerCompany?.id ?? ""}>
                            <option value="">Main company / no owner</option>
                            {activeCompanies.map((company) => (
                              <option value={company.id} key={company.id}>{company.name}</option>
                            ))}
                          </select>
                        </label>
                      </fieldset>

                      <fieldset className="question-card">
                        <legend>2. What is the company identity?</legend>
                        <label>
                          Display Name
                          <input name="name" placeholder="Short portal name" />
                        </label>
                        <label>
                          Legal Company Name
                          <input name="legalName" placeholder="Legal trade license name" />
                        </label>
                      </fieldset>

                      <fieldset className="question-card">
                        <legend>3. Where do we send documents?</legend>
                        <label>
                          Email For PO / Invoice
                          <input name="email" type="email" placeholder="finance@example.com" />
                        </label>
                        <label>
                          Address
                          <textarea name="location" placeholder="Company address" />
                        </label>
                      </fieldset>
                    </div>
                    <details className="optional-details-card">
                      <summary>Optional tax and bank details</summary>
                      <div className="company-card-fields optional-bank-fields">
                        <label>
                          TRN / Tax Number
                          <input name="trn" placeholder="Optional" />
                        </label>
                        <label>
                          Bank Name
                          <input name="bankName" placeholder="Optional" />
                        </label>
                        <label>
                          Beneficiary Account Name
                          <input name="bankBeneficiaryName" placeholder="Optional" />
                        </label>
                        <label>
                          Account Number
                          <input name="bankAccountNumber" placeholder="Optional" />
                        </label>
                        <label>
                          IBAN Number
                          <input name="bankIban" placeholder="Optional" />
                        </label>
                        <label>
                          CID
                          <input name="bankCid" placeholder="Optional" />
                        </label>
                        <label>
                          Bank Branch
                          <input name="bankBranch" placeholder="Optional" />
                        </label>
                      </div>
                    </details>
                    <div className="company-card-actions">
                      <button type="submit" disabled={loading}><Building2 size={17} /> Create Company</button>
                      <button type="reset" className="secondary-button" disabled={loading}>Clear</button>
                    </div>
                  </form>
                )}
                <div className="company-list-toolbar uploaded-records-toolbar">
                  <div>
                    <strong>Uploaded / Existing Records</strong>
                    <span>Records imported from business plans or already created in the system. Expand any row to edit details.</span>
                  </div>
                </div>
                <div className="partner-list-card">
                  <div className="partner-list-tabs">
                    <button
                      type="button"
                      className={companyPartnerTab === "companies" ? "secondary-button active-tab" : "secondary-button"}
                      onClick={() => setCompanyPartnerTab("companies")}
                    >
                      <Building2 size={17} /> Companies
                      <span>{settingsCompanyOptions.filter((company) => !company.managedByCompanyId).length}</span>
                    </button>
                    <button
                      type="button"
                      className={companyPartnerTab === "customers" ? "secondary-button active-tab" : "secondary-button"}
                      onClick={() => setCompanyPartnerTab("customers")}
                    >
                      <Building2 size={17} /> Customers
                      <span>{settingsCompanyOptions.filter(isManagedCustomer).length}</span>
                    </button>
                    <button
                      type="button"
                      className={companyPartnerTab === "vendors" ? "secondary-button active-tab" : "secondary-button"}
                      onClick={() => setCompanyPartnerTab("vendors")}
                    >
                      <Building2 size={17} /> Vendors
                      <span>{settingsCompanyOptions.filter(isManagedVendor).length}</span>
                    </button>
                  </div>
                </div>
                {settingsCompaniesForTab.map((company) => {
                  const isExpanded = expandedCompanyIds.includes(company.id);
                  return (
                    <form className="company-settings-card" key={company.id} onSubmit={(event) => saveCompanyCard(event, company)}>
                      <div className="company-card-head">
                        <div className="company-card-title">
                          <div className="company-logo-preview">
                            <CompanyLogoPreview company={company} />
                          </div>
                          <div>
                            <strong>{company.name}</strong>
                            <span>{company.legalName}</span>
                          </div>
                        </div>
                        <div className="company-card-summary-actions">
                          {company.managedByCompany && <span className="muted-text">Under {company.managedByCompany.name}</span>}
                          <span className="status-badge open">{roleLabel(company.role)}</span>
                          <span className={`status-badge ${company.active === false ? "stopped" : "completed"}`}>{company.active === false ? "Inactive" : "Active"}</span>
                          <button type="button" className="secondary-button" onClick={() => toggleCompanyExpanded(company.id)}>
                            {isExpanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                            {isExpanded ? "Close" : "Expand"}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <>
                          <div className="company-card-fields">
                            <label className="company-logo-upload">
                              Company Logo
                              <span>
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  onChange={(event) => uploadCompanyLogo(company, event.currentTarget.files?.[0] ?? null)}
                                  disabled={loading}
                                />
                                <span className="muted-text">PNG, JPG, or WEBP. Used in PO and invoice PDFs.</span>
                              </span>
                            </label>
                            <div className="company-logo-expanded-preview">
                              <div className="company-logo-preview large">
                                <CompanyLogoPreview company={company} />
                              </div>
                              <span>
                                <strong>Logo Preview</strong>
                                <small>{company.logoPath ? `Saved in DB: ${company.logoPath}` : "No logo saved yet"}</small>
                              </span>
                            </div>
                            <label>
                              Display Name
                              <input name="name" defaultValue={company.name} />
                            </label>
                            <label>
                              Legal Company Name
                              <input name="legalName" defaultValue={company.legalName} />
                            </label>
                            <label>
                              Partner Type
                              <select name="role" defaultValue={company.role ?? "BOTH"}>
                                <option value="BUYER">Customer</option>
                                <option value="SELLER">Vendor</option>
                                <option value="BOTH">Customer & Vendor</option>
                              </select>
                            </label>
                            <label>
                              Managed Under Company
                              <select name="managedByCompanyId" defaultValue={company.managedByCompanyId ?? ""}>
                                <option value="">Main company / no owner</option>
                                {activeCompanies
                                  .filter((owner) => owner.id !== company.id)
                                  .map((owner) => (
                                    <option value={owner.id} key={owner.id}>{owner.name}</option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              TRN / Tax Number
                              <input name="trn" defaultValue={company.trn ?? ""} placeholder="Optional" />
                            </label>
                            <label>
                              Email For PO / Invoice
                              <input name="email" type="email" defaultValue={company.email} />
                            </label>
                            <label className="company-active-toggle">
                              Active Company
                              <span>
                              <input name="active" type="checkbox" defaultChecked={company.active !== false} />
                              <span className="muted-text">Show this company in portals and workflow menus</span>
                            </span>
                          </label>
                            <label className="company-active-toggle">
                              Workflow VAT
                              <span>
                                <input name="vatEnabled" type="checkbox" defaultChecked={company.vatEnabled !== false} />
                                <span className="muted-text">Apply VAT in PO and invoice workflow</span>
                              </span>
                            </label>
                            <label className="company-card-address">
                              Address
                              <textarea name="location" defaultValue={company.location} />
                            </label>
                            <label>
                              Bank Name
                              <input name="bankName" defaultValue={company.bankName ?? ""} placeholder="Optional" />
                            </label>
                            <label>
                              Beneficiary Account Name
                              <input name="bankBeneficiaryName" defaultValue={company.bankBeneficiaryName ?? ""} placeholder="Optional" />
                            </label>
                            <label>
                              Account Number
                              <input name="bankAccountNumber" defaultValue={company.bankAccountNumber ?? ""} placeholder="Optional" />
                            </label>
                            <label>
                              IBAN Number
                              <input name="bankIban" defaultValue={company.bankIban ?? ""} placeholder="Optional" />
                            </label>
                            <label>
                              CID
                              <input name="bankCid" defaultValue={company.bankCid ?? ""} placeholder="Optional" />
                            </label>
                            <label>
                              Bank Branch
                              <input name="bankBranch" defaultValue={company.bankBranch ?? ""} placeholder="Optional" />
                            </label>
                          </div>
                          <div className="company-card-actions">
                            <button type="submit" disabled={loading}><Save size={17} /> Save Company</button>
                            <button
                              type="button"
                              className={company.active === false ? undefined : "secondary-button"}
                              disabled={loading}
                              onClick={async () => {
                                setLoading(true);
                                try {
                                  await request(`/api/catalog/companies/${company.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      name: company.name,
                                      legalName: company.legalName,
                                      role: company.role ?? "BOTH",
                                      managedByCompanyId: company.managedByCompanyId ?? undefined,
                                      location: company.location,
                                      email: company.email,
                                      trn: company.trn || undefined,
                                      active: company.active === false,
                                      vatEnabled: company.vatEnabled !== false,
                                      bankName: company.bankName || undefined,
                                      bankBeneficiaryName: company.bankBeneficiaryName || undefined,
                                      bankAccountNumber: company.bankAccountNumber || undefined,
                                      bankIban: company.bankIban || undefined,
                                      bankCid: company.bankCid || undefined,
                                      bankBranch: company.bankBranch || undefined,
                                    }),
                                  });
                                  setMessage(`${company.name} ${company.active === false ? "activated" : "deactivated"}.`);
                                  await loadSummary();
                                } catch (error) {
                                  setMessage(error instanceof Error ? error.message : "Could not update company status");
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              {company.active === false ? "Activate" : "Deactivate"}
                            </button>
                            <button
                              type="button"
                              className="danger-button"
                              disabled={loading}
                              onClick={() => deleteCompany(company)}
                            >
                              <Trash2 size={17} /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </form>
                  );
                })}
                {companyPartnerTab === "companies" && !settingsCompaniesForTab.length && <div className="empty-state">No companies onboarded yet.</div>}
                {companyPartnerTab === "customers" && !settingsCompanyOptions.filter(isManagedCustomer).length && <div className="empty-state">No customers onboarded yet.</div>}
                {companyPartnerTab === "vendors" && !settingsCompanyOptions.filter(isManagedVendor).length && <div className="empty-state">No vendors onboarded yet.</div>}
              </div>
            )}

            {settingsTab === "businessImport" && (
              <div className="settings-section business-import-section">
                <form className="business-import-form" onSubmit={previewBusinessPlanImport}>
                  <label>
                    Import Under Company
                    <select
                      value={businessPlanCompanyId}
                      onChange={(event) => {
                        setBusinessPlanCompanyId(event.target.value);
                        setBusinessScenarioImportResult(null);
                      }}
                      disabled={isCompanyPortal}
                    >
                      {(!isCompanyPortal || businessPlanCompanyOptions.length === 0) && <option value="AUTO">Auto-detect from Excel</option>}
                      {businessPlanCompanyOptions.map((company) => (
                        <option value={company.id} key={company.id}>{company.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Plan Period From
                    <input type="date" value={businessPlanPeriodFrom} onChange={(event) => setBusinessPlanPeriodFrom(event.target.value)} />
                  </label>
                  <label>
                    Plan Period To
                    <input type="date" value={businessPlanPeriodTo} onChange={(event) => setBusinessPlanPeriodTo(event.target.value)} />
                  </label>
                  <label>
                    Excel Business Plan File
                    <input
                      type="file"
                      accept=".xlsx,.xls,.xlsb,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={(event) => {
                        const selectedFile = event.currentTarget.files?.[0] ?? null;
                        setBusinessPlanFile(selectedFile);
                        setBusinessPlanPreview(null);
                        setBusinessProductImportResult(null);
                        setBusinessScenarioImportResult(null);
                        setShowBusinessImportProgress(Boolean(selectedFile));
                        setBusinessImportProgress(0);
                        setBusinessImportStatus(selectedFile ? "File selected. Preview before import." : "Waiting for business plan file");
                      }}
                    />
                  </label>
                  <button type="submit" disabled={loading || !businessPlanFile}><FileText size={17} /> Preview File</button>
                </form>

                {!businessPlanPreview && (
                  <div className="empty-state">Upload the company activity workbook to preview companies, products, targets, and workflow rules before importing.</div>
                )}

                {showBusinessImportProgress && (
                  <div className="import-progress-card">
                    <div>
                      <strong>Business Import Progress</strong>
                      <span>{businessImportStatus}</span>
                    </div>
                    {businessImportProgress > 0 && (
                      <div className="progress-track">
                        <span style={{ width: `${businessImportProgress}%` }} />
                      </div>
                    )}
                  </div>
                )}

                {businessScenarioImportResult && (
                  <div className="business-import-complete-panel">
                    <div className="config-status ready">
                      <strong>Business Plan Import Complete</strong>
                      <span>Main company: {businessScenarioImportResult.company}</span>
                      <span>Plan period: {businessScenarioImportResult.planPeriodDateFrom || "open"} to {businessScenarioImportResult.planPeriodDateTo || "open"}</span>
                      <span>Partners: {businessScenarioImportResult.partnersCreated} created, {businessScenarioImportResult.partnersUpdated} updated.</span>
                      <span>Targets: {businessScenarioImportResult.turnoverTargetsCreated} created, {businessScenarioImportResult.turnoverTargetsUpdated} updated. Rules saved: {businessScenarioImportResult.rulesSaved}.</span>
                    </div>
                    <div className="import-action-panel imported">
                      <div>
                        <strong>Scenario loaded into workflow</strong>
                        <span>The workbook preview is complete. Continue from Company Profile or Workflow to review the imported partners, targets, and allocation rules.</span>
                      </div>
                      <div className="import-complete-actions">
                        <button
                          type="button"
                          onClick={() => {
                            const targetCompanyId = selectedBusinessPlanCompany?.id || (companyScopeId !== "ALL" ? companyScopeId : workflowSelectedCompanyId);
                            if (targetCompanyId) {
                              selectSidebarCompany(targetCompanyId);
                              setProfileCompanyId(targetCompanyId);
                              setCompanyPartnerTab("vendors");
                            }
                            setSettingsTab("company");
                          }}
                        >
                          <Building2 size={17} /> View Company Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const targetCompanyId = selectedBusinessPlanCompany?.id || (companyScopeId !== "ALL" ? companyScopeId : workflowSelectedCompanyId);
                            if (targetCompanyId) {
                              selectSidebarCompany(targetCompanyId);
                              setPlanAgentCompanyId(targetCompanyId);
                              setWorkflowCompanyId(targetCompanyId);
                            }
                            setWorkflowTab("uploaded");
                            setActiveView("workflow");
                          }}
                        >
                          <Play size={17} /> Open Workflow
                        </button>
                        {businessPlanPreview?.counts.products && !businessProductImportResult ? (
                          <button type="button" disabled={loading} onClick={importBusinessPlanProducts}>
                            <Package size={17} /> Import Products
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {businessPlanPreview && !businessScenarioImportResult && (
                  <div className="business-preview">
                    <div className="preview-metrics">
                      <Metric label="Companies" value={businessPlanPreview.counts.companies} />
                      <Metric label="Purchase Vendors" value={businessPlanPreview.counts.purchaseVendors} />
                      <Metric label="Sales Customers" value={businessPlanPreview.counts.salesCustomers} />
                      <Metric label="Products" value={businessPlanPreview.counts.products} />
                      <Metric label="Bank Status Rows" value={businessPlanPreview.counts.bankStatusRows} />
                      <Metric label="Checklist Items" value={businessPlanPreview.counts.checklistItems} />
                      <Metric label="Manual Warnings" value={businessPlanPreview.counts.warnings} />
                    </div>

                    <div className="config-status ready">
                      <strong>Workbook Preview Only</strong>
                      <span>
                        Import owner: {selectedBusinessPlanCompany
                          ? `${selectedBusinessPlanCompany.name} (existing company)`
                          : "Auto-detect from Excel"}
                      </span>
                      <span>Plan period: {businessPlanPeriodFrom || "open"} to {businessPlanPeriodTo || "open"}</span>
                      <span>Sheets: {businessPlanPreview.workbook.sheetNames.join(", ")}</span>
                      <span>{businessPlanPreview.nextStep}</span>
                    </div>

                    <div className="import-action-panel">
                      <div>
                        <strong>Business Plan Scenario Import</strong>
                        <span>{selectedBusinessPlanCompany
                          ? `Uses ${selectedBusinessPlanCompany.name} as the owner, then attaches purchase vendors, sales customers, monthly turnover targets, and allocation rules from this workbook.`
                          : "Creates or updates the main company detected from Excel, plus purchase vendors, sales customers, monthly turnover target, and allocation rules."}</span>
                      </div>
                      <button type="button" disabled={loading || !businessPlanPreview.scenario?.mainCompany} onClick={importBusinessPlanScenario}>
                        <Building2 size={17} /> Import Scenario
                      </button>
                    </div>

                    <div className="import-action-panel">
                      <div>
                        <strong>E.CARD Product Price Import</strong>
                        <span>Optional. Use only when this workbook has a product price sheet. Business plan import can use existing products already in the system.</span>
                      </div>
                      <button type="button" disabled={loading || !businessPlanPreview.counts.products} onClick={importBusinessPlanProducts}>
                        <Package size={17} /> Import Products
                      </button>
                    </div>

                    {businessProductImportResult && (
                      <div className="config-status ready">
                        <strong>Product Import Complete</strong>
                        <span>{businessProductImportResult.created} created, {businessProductImportResult.updated} updated, {businessProductImportResult.skipped} skipped.</span>
                      </div>
                    )}

                    {!!businessPlanPreview.warnings.length && (
                      <div className="config-status missing">
                        <strong>Manual Review Needed</strong>
                        {businessPlanPreview.warnings.slice(0, 12).map((warning) => <span key={warning}>{warning}</span>)}
                        {businessPlanPreview.warnings.length > 12 && <span>{businessPlanPreview.warnings.length - 12} more warnings hidden.</span>}
                      </div>
                    )}

                    {!!businessPlanPreview.missingDataChecklist.length && (
                      <section>
                        <h3>Missing Data Checklist</h3>
                        <div className="table import-preview-table">
                          {businessPlanPreview.missingDataChecklist.map((item) => (
                            <div className="row" key={`${item.section}-${item.name}-${item.missing.join("-")}`}>
                              <span className={`status-badge ${item.severity === "WARNING" ? "held" : "open"}`}>{item.severity}</span>
                              <span>{item.section}</span>
                              <span>{item.name}</span>
                              <span>{item.missing.join(", ")}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <section>
                      <h3>Field Mapping Preview</h3>
                      <div className="table import-preview-table">
                        {businessPlanPreview.fieldMappings.map((mapping) => (
                          <div className="row import-company-row" key={mapping.source}>
                            <span>{mapping.source === "BUSINESS_PLAN" ? "Business Plan" : "Product Price"}</span>
                            <span>{mapping.sheetName || "Sheet not found"}</span>
                            <span className={`status-badge ${mapping.detected ? "completed" : "stopped"}`}>{mapping.detected ? "Detected" : "Missing"}</span>
                            <span>
                              {mapping.columns.map((column) => (
                                <small key={`${mapping.source}-${column.field}`}>{column.field}: {column.header || column.status}</small>
                              ))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3>Business Scenario Preview</h3>
                      {businessPlanPreview.scenario?.mainCompany ? (
                        <div className="table import-preview-table">
                          <div className="row import-company-row">
                            <span>Main Company</span>
                            <span>
                              <strong>{businessPlanPreview.scenario.mainCompany.name}</strong>
                              <small>{businessPlanPreview.scenario.mainCompany.email || "Email missing"}</small>
                              <small>{businessPlanPreview.scenario.mainCompany.address || "Address missing"}</small>
                            </span>
                            <span>
                              <strong>Purchase Target</strong>
                              <small>{businessPlanPreview.scenario.purchasePlan?.revenueTargetText || "Not set"}</small>
                              <small>
                                Transaction: {businessPlanPreview.scenario.purchasePlan?.transactionAmountMin === undefined
                                  ? "Not set"
                                  : `${money(businessPlanPreview.scenario.purchasePlan.transactionAmountMin)}${businessPlanPreview.scenario.purchasePlan.transactionPercent ? ` (${percent(businessPlanPreview.scenario.purchasePlan.transactionPercent * 100)} of revenue)` : ""}`}
                              </small>
                              <small>{businessPlanPreview.scenario.purchasePlan?.invoiceRuleText || "Invoice rule missing"}</small>
                            </span>
                            <span>
                              <strong>Sales Rule</strong>
                              <small>{businessPlanPreview.scenario.salesPlan?.priceRule || "Not set"}</small>
                              <small>{businessPlanPreview.scenario.salesPlan?.productSpecification || ""}</small>
                            </span>
                          </div>
                          {businessPlanPreview.scenario.purchaseVendors.map((vendor) => (
                            <div className="row import-company-row" key={`vendor-${vendor.name}`}>
                              <span>Vendor</span>
                              <span><strong>{vendor.name}</strong><small>{vendor.email || "Email can be added later"}</small></span>
                              <span>{vendor.allocationPercent === undefined ? "-" : `${vendor.allocationPercent}% purchase allocation`}</span>
                              <span>{vendor.address || "Address can be added later"}</span>
                            </div>
                          ))}
                          {businessPlanPreview.scenario.salesCustomers.map((customer) => {
                            const allocation = businessPlanPreview.scenario?.salesAllocations.find((entry) => entry.name.toLowerCase() === customer.name.toLowerCase());
                            return (
                              <div className="row import-company-row" key={`customer-${customer.name}`}>
                                <span>Customer</span>
                                <span><strong>{customer.name}</strong><small>{customer.email || "Email can be added later"}</small></span>
                                <span>{allocation?.allocationPercent === undefined ? "-" : `${allocation.allocationPercent}% sales allocation`}</span>
                                <span>
                                  {customer.address || "Address can be added later"}
                                  <small>{customer.bank?.bankName ? `Bank: ${customer.bank.bankName}` : "Bank can be added later"}</small>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-state">No business scenario detected in this workbook.</div>
                      )}
                    </section>

                    <section>
                      <h3>Company / Activity Preview</h3>
                      <div className="table import-preview-table">
                        {businessPlanPreview.companies.slice(0, 18).map((company) => (
                          <div className="row import-company-row" key={`${company.index}-${company.name}`}>
                            <span>{company.index || "-"}</span>
                            <span>
                              <strong>{company.name}</strong>
                              <small>{company.email || "Email missing"}</small>
                              <small>{company.address || "Address missing"}</small>
                            </span>
                            <span>
                              <strong>Target</strong>
                              <small>{company.revenueTargetText || "Not set"}</small>
                              <small>{company.transactionAmountMin === undefined ? "Transaction amount not set" : `Transaction ${money(company.transactionAmountMin)}`}</small>
                              <small>{company.invoiceRuleText || "Invoice rule missing"}</small>
                            </span>
                            <span>
                              <strong>Relations</strong>
                              <small>Customer: {company.customerRule || "Not set"}</small>
                              <small>Vendor: {company.vendorRule || "Not set"}</small>
                            </span>
                            <span>
                              <strong>Bank</strong>
                              <small>{company.bank.bankName || company.bank.status || "Not set"}</small>
                              <small>{company.bank.iban || company.bank.accountNumber || ""}</small>
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3>Product Price Preview</h3>
                      <div className="table product-import-preview-table">
                        {!!businessPlanPreview.products.length && (
                          <div className="row table-header">
                            <span>SKU</span>
                            <span>Product</span>
                            <span>Currency</span>
                            <span>Denomination</span>
                            <span>Conversion</span>
                            <span>Denom AED</span>
                            <span>Buying</span>
                            <span>Profit</span>
                            <span>%</span>
                            <span>Selling</span>
                          </div>
                        )}
                        {businessPlanPreview.products.map((product) => (
                          <div className="row import-product-row" key={product.title}>
                            <span>{product.sku}</span>
                            <span>{product.title}</span>
                            <span>{product.currency || "-"}</span>
                            <span>{product.denomination ?? "-"}</span>
                            <span>{product.conversionRate ?? "-"}</span>
                            <span>{product.denominationAed === undefined ? "-" : money(product.denominationAed)}</span>
                            <span>Buy {product.buyingPrice === undefined ? "-" : money(product.buyingPrice)}</span>
                            <span>{product.profit === undefined ? "-" : money(product.profit)}</span>
                            <span>{percent(product.marginPercent)}</span>
                            <span>Sell {product.sellingPrice === undefined ? "-" : money(product.sellingPrice)}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    {businessProductImportResult && (
                      <section>
                        <h3>Imported Product Result</h3>
                        <div className="table product-import-preview-table">
                          <div className="row table-header">
                            <span>Product</span>
                            <span>Status</span>
                            <span>Currency</span>
                            <span>Denomination</span>
                            <span>Conversion</span>
                            <span>Denom AED</span>
                            <span>Buying</span>
                            <span>Profit</span>
                            <span>%</span>
                            <span>Selling</span>
                            <span>Reason</span>
                          </div>
                          {businessProductImportResult.rows.map((row) => (
                            <div className="row import-product-row" key={`${row.sku}-${row.status}`}>
                              <span>{row.sku}<small>{row.name}</small></span>
                              <span>{row.status}</span>
                              <span>{row.currency ?? "-"}</span>
                              <span>{row.denomination ?? "-"}</span>
                              <span>{row.conversionRate ?? "-"}</span>
                              <span>{row.denominationAed === undefined ? "-" : money(row.denominationAed)}</span>
                              <span>Buy {row.buyingPrice === undefined ? "-" : money(row.buyingPrice)}</span>
                              <span>{row.profit === undefined ? "-" : money(row.profit)}</span>
                              <span>{percent(row.marginPercent)}</span>
                              <span>Sell {money(row.sellingPrice)}</span>
                              <span>{row.reason || "-"}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {!!businessPlanPreview.bankStatusRows.length && (
                      <section>
                        <h3>Bank Status Preview</h3>
                        <div className="table import-preview-table">
                          {businessPlanPreview.bankStatusRows.map((row) => (
                            <div className="row" key={row.companyName}>
                              <span>{row.companyName}</span>
                              <span>{row.owner || "-"}</span>
                              <span>{row.bankStatus || "-"}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
            )}

            {settingsTab === "email" && (
              <div className="settings-section">
                <div className={emailConfigStatus?.oauthConfigured ? "config-status ready" : "config-status missing"}>
                  <strong>Gmail OAuth: {emailConfigStatus?.oauthConfigured ? "Configured" : "Missing"}</strong>
                  <span>{emailConfigStatus?.modeNote ?? "Checking Gmail configuration..."}</span>
                  <span>Client ID: {emailConfigStatus?.clientIdConfigured ? "set" : "missing"}</span>
                  <span>Client Secret: {emailConfigStatus?.clientSecretConfigured ? "set" : "missing"}</span>
                  <span>Redirect URI: {emailConfigStatus?.redirectUriConfigured ? emailConfigStatus.redirectUri : "missing"}</span>
                  <span>Token Encryption Key: {emailConfigStatus?.tokenEncryptionConfigured ? "set" : "missing"}</span>
                  <span>SMTP Sending: {emailConfigStatus?.smtpConfigured ? "configured" : "missing"}</span>
                  <span>IMAP Reading: {emailConfigStatus?.imapConfigured ? "configured" : "missing"}</span>
                </div>
                <form className="gmail-config-form" onSubmit={saveSmtpImapConfig}>
                  <label>SMTP Host<input value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} /></label>
                  <label>SMTP Port<input type="number" value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} /></label>
                  <label>
                    SMTP Encryption
                    <select value={smtpEncryption} onChange={(event) => setSmtpEncryption(event.target.value as "TLS" | "SSL" | "NONE")}>
                      <option value="TLS">TLS</option>
                      <option value="SSL">SSL</option>
                      <option value="NONE">None</option>
                    </select>
                  </label>
                  <label>SMTP Username<input value={smtpUsername} onChange={(event) => setSmtpUsername(event.target.value)} /></label>
                  <label>SMTP Password<input type="password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} placeholder={emailConfigStatus?.smtpConfigured ? "Leave blank to keep existing" : "App password"} /></label>
                  <label>IMAP Host<input value={imapHost} onChange={(event) => setImapHost(event.target.value)} /></label>
                  <label>IMAP Port<input type="number" value={imapPort} onChange={(event) => setImapPort(event.target.value)} /></label>
                  <label>
                    IMAP Encryption
                    <select value={imapEncryption} onChange={(event) => setImapEncryption(event.target.value as "TLS" | "SSL" | "NONE")}>
                      <option value="SSL">SSL</option>
                      <option value="TLS">TLS</option>
                      <option value="NONE">None</option>
                    </select>
                  </label>
                  <label>IMAP Username<input value={imapUsername} onChange={(event) => setImapUsername(event.target.value)} /></label>
                  <label>IMAP Password<input type="password" value={imapPassword} onChange={(event) => setImapPassword(event.target.value)} placeholder={emailConfigStatus?.imapConfigured ? "Leave blank to keep existing" : "App password"} /></label>
                  <button type="submit" disabled={loading}><Save size={17} /> Save SMTP/IMAP</button>
                </form>
                <form className="gmail-config-form" onSubmit={saveGmailConfig}>
                  <label>
                    Google Client ID
                    <input value={googleClientId} onChange={(event) => setGoogleClientId(event.target.value)} placeholder={emailConfigStatus?.clientIdConfigured ? "Already configured" : "Paste client ID"} />
                  </label>
                  <label>
                    Google Client Secret
                    <input type="password" value={googleClientSecret} onChange={(event) => setGoogleClientSecret(event.target.value)} placeholder={emailConfigStatus?.clientSecretConfigured ? "Leave blank to keep existing" : "Paste client secret"} />
                  </label>
                  <label>
                    Redirect URI
                    <input value={googleRedirectUri} onChange={(event) => setGoogleRedirectUri(event.target.value)} />
                  </label>
                  <label>
                    Token Encryption Key
                    <input type="password" value={gmailTokenEncryptionKey} onChange={(event) => setGmailTokenEncryptionKey(event.target.value)} placeholder={emailConfigStatus?.tokenEncryptionConfigured ? "Leave blank to keep existing" : "Minimum 32 characters"} />
                  </label>
                  <button type="submit" disabled={loading}><Save size={17} /> Save Gmail Config</button>
                </form>
                <form className="stock-form email-form" onSubmit={saveEmailIntegration}>
                  <label>
                    Company
                    <select value={emailCompanyId} onChange={(event) => setEmailCompanyId(event.target.value)} disabled={isCompanyPortal}>
                      <option value="">Select company</option>
                      {visibleCompanyOptions.map((company) => (
                        <option value={company.id} key={company.id}>{company.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Gmail Address
                    <input value={integrationEmail} onChange={(event) => setIntegrationEmail(event.target.value)} placeholder="name@company.com" />
                  </label>
                  <label>
                    Send Mode
                    <select value={integrationMode} onChange={(event) => setIntegrationMode(event.target.value as EmailIntegration["mode"])}>
                      <option value="SIMULATION">Simulation</option>
                      <option value="DRAFT">Draft</option>
                      <option value="LIVE">Live Gmail</option>
                    </select>
                  </label>
                  <button type="submit" disabled={loading}><Save size={17} /> Save</button>
                </form>

                <div className="table">
                  {scopedEmailIntegrations.map((integration) => (
                    <div className="row integration-row" key={integration.id}>
                      <span>{integration.company.name}</span>
                      <span>{integration.email}</span>
                      <span>{integration.mode} / {integration.status}</span>
                      <button type="button" onClick={() => testEmailIntegration(integration.companyId)} disabled={loading}>Test</button>
                    </div>
                  ))}
                  {!scopedEmailIntegrations.length && (
                    <div className="empty-state">No email settings saved yet.</div>
                  )}
                </div>
              </div>
            )}

            {settingsTab === "log" && (
              <div className="settings-section">
                <div className="table">
                  {scopedEmails.map((emailLog) => (
                    <div className="row" key={emailLog.id}>
                      <span>{emailLog.subject}</span>
                      <span>{emailLog.fromEmail} to {emailLog.toEmail}</span>
                      <span>{emailLog.status}</span>
                    </div>
                  ))}
                  {!scopedEmails.length && <div className="empty-state">No email activity yet.</div>}
                </div>
              </div>
            )}

            {settingsTab === "audit" && (
              <div className="settings-section">
                <div className="table">
                  {scopedAgentAuditLogs.map((auditLog) => (
                    <div className="row audit-row" key={auditLog.id}>
                      <span>{appDateTime(auditLog.createdAt)}</span>
                      <span>{auditLog.step} / {auditLog.status}</span>
                      <span>{auditLog.message}</span>
                    </div>
                  ))}
                  {!scopedAgentAuditLogs.length && <div className="empty-state">No agent audit activity yet.</div>}
                </div>
              </div>
            )}

            {settingsTab === "systemLogs" && (
              <div className="settings-section system-log-section">
                <div className="system-log-toolbar">
                  <div>
                    <strong>Live System Logs</strong>
                    <span>Today&apos;s raw log tail refreshes automatically. Sensitive fields are redacted.</span>
                  </div>
                  <label>
                    Level
                    <select value={systemLogLevel} onChange={(event) => setSystemLogLevel(event.target.value)}>
                      <option value="ERROR">Errors</option>
                      <option value="WARN">Warnings</option>
                      <option value="INFO">Info</option>
                      <option value="ALL">All</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => loadSystemLogs()} disabled={loading}><RefreshCcw size={17} /> Refresh</button>
                  <button type="button" className="secondary-button" onClick={downloadSystemLogs} disabled={loading}><Download size={17} /> Download Logs</button>
                </div>

                {systemLogs && (
                  <div className="config-status ready">
                    <strong>Log Rotation</strong>
                    <span>Path: {systemLogs.status.logsDir}</span>
                    <span>Retention: {systemLogs.status.retentionDays} day{systemLogs.status.retentionDays === 1 ? "" : "s"}; older files rotate out automatically</span>
                    <span>Files: {systemLogs.status.files}, Size: {(systemLogs.status.totalBytes / 1024).toFixed(1)} KB</span>
                  </div>
                )}

                <div className="live-log-panel">
                  <div className="live-log-head">
                    <strong>Raw Live Tail</strong>
                    <span>Auto refresh every 5 seconds</span>
                  </div>
                  <pre>
                    {(systemLogs?.rawLogs ?? []).length
                      ? (systemLogs?.rawLogs ?? []).join("\n")
                      : "No raw log lines for today yet."}
                  </pre>
                </div>

                <div className="table system-log-table">
                  {(systemLogs?.logs ?? []).map((log, index) => (
                    <div className="row system-log-row" key={`${log.timestamp}-${index}`}>
                      <span>{log.timestamp || "-"}</span>
                      <span className={`status-badge ${(log.level || "").toLowerCase()}`}>{log.level || "-"}</span>
                      <span>{log.event || "-"}</span>
                      <span>{log.method || "-"} {log.path || ""}</span>
                      <span>{log.statusCode || "-"}</span>
                      <span>{log.durationMs === undefined ? "-" : `${log.durationMs} ms`}</span>
                      <span>{log.message || "-"}</span>
                    </div>
                  ))}
                  {systemLogs && !systemLogs.logs.length && <div className="empty-state">No logs found for this filter.</div>}
                  {!systemLogs && <div className="empty-state">Open or refresh this tab to load logs.</div>}
                </div>
              </div>
            )}

            {settingsTab === "maintenance" && (
              <div className="settings-section maintenance-section">
                <div className="maintenance-card database-safety-card">
                  <div>
                    <strong>Database Backup / Restore</strong>
                    <span>SQLite is safe for starting volume. For higher transaction volume, move this same workflow to PostgreSQL later.</span>
                    <span>CI/CD runs migration-safe database initialization and creates a SQLite backup before deploy.</span>
                  </div>
                  <div className="maintenance-button-stack">
                    <button type="button" onClick={createDatabaseBackup} disabled={loading}><Save size={17} /> Create Backup</button>
                    <button type="button" className="secondary-button" onClick={loadDatabaseBackups} disabled={loading}><RefreshCcw size={17} /> List Backups</button>
                  </div>
                </div>

                <div className="backup-restore-card">
                  <label>
                    Restore Backup
                    <select value={restoreBackupFile} onChange={(event) => setRestoreBackupFile(event.target.value)}>
                      <option value="">Select backup file</option>
                      {databaseBackups.map((backup) => (
                        <option value={backup.fileName} key={backup.fileName}>
                          {backup.fileName} - {(backup.bytes / 1024).toFixed(1)} KB
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="danger-button" disabled={loading || !restoreBackupFile} onClick={restoreDatabaseBackup}>
                    <Trash2 size={17} /> Restore Selected Backup
                  </button>
                  <div className="table backup-list-table">
                    {databaseBackups.map((backup) => (
                      <div className="row" key={backup.fileName}>
                        <span>{backup.fileName}</span>
                        <span>{(backup.bytes / 1024).toFixed(1)} KB</span>
                        <span>{appDateTime(backup.createdAt)}</span>
                      </div>
                    ))}
                    {!databaseBackups.length && <div className="empty-state">No backups listed yet. Click List Backups or Create Backup.</div>}
                  </div>
                </div>

                <div className="maintenance-card">
                  <div>
                    <strong>Flush Selected Data</strong>
                    <span>Select exactly which user-entered data categories should be cleared.</span>
                    <span>Safe defaults are selected. Company, product, stock, email, and user data stay unchecked until you choose them.</span>
                  </div>
                  <button type="button" className="secondary-button" disabled={loading} onClick={() => setSelectedFlushCategories(defaultFlushCategoryKeys)}>
                    <RefreshCcw size={17} /> Safe Default
                  </button>
                </div>

                <div className="flush-category-grid">
                  {flushCategoryOptions.map((option) => (
                    <label key={option.key} className={option.dangerous ? "checkbox-row danger-check" : "checkbox-row"}>
                      <input
                        type="checkbox"
                        checked={selectedFlushCategories.includes(option.key)}
                        onChange={() => toggleFlushCategory(option.key)}
                      />
                      <span>
                        <strong>{option.title}</strong>
                        <small>{option.description}</small>
                      </span>
                      {option.dangerous && <em>Danger</em>}
                    </label>
                  ))}
                </div>

                <div className="maintenance-action-row">
                  <span>
                    Selected: {flushCategoryOptions
                      .filter((option) => selectedFlushCategories.includes(option.key))
                      .map((option) => option.title)
                      .join(", ") || "None"}
                  </span>
                  <button type="button" className="danger-button" disabled={loading || selectedFlushCategories.length === 0} onClick={flushSelectedData}>
                    <Trash2 size={17} /> Flush Selected Data
                  </button>
                </div>

                <div className="flush-progress-card">
                  <div>
                    <strong>Delete Progress</strong>
                    <span>{flushStatus}</span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${flushProgress}%` }} />
                  </div>
                </div>

                {flushResult && (
                  <div className="config-status ready">
                    <strong>Flush Complete</strong>
                    <span>Successfully deleted {flushTotals(flushResult).records} records and {flushTotals(flushResult).files} files.</span>
                    <span>Selected categories: {flushResult.selectedCategories.join(", ")}</span>
                    <div className="flush-count-grid">
                      <div>
                        <strong>Records Deleted</strong>
                        {Object.entries(flushResult.deletedRecords).length
                          ? Object.entries(flushResult.deletedRecords).map(([key, value]) => <span key={key}>{key}: {value}</span>)
                          : <span>No records selected</span>}
                      </div>
                      <div>
                        <strong>Files Deleted</strong>
                        {Object.entries(flushResult.deletedFiles).length
                          ? Object.entries(flushResult.deletedFiles).map(([key, value]) => <span key={key}>{key}: {value}</span>)
                          : <span>No files selected</span>}
                      </div>
                    </div>
                    <span>Preserved: {flushResult.preserved.join(", ")}</span>
                  </div>
                )}
              </div>
            )}
          </Panel>
        )}

        {activeView === "stock" && (
          <Panel title="Stock By Company">
            <section className="stock-tools">
              <form className="tool-box" onSubmit={createStockItem}>
                <h3>Create Item</h3>
                <label>SKU<input value={newSku} onChange={(event) => setNewSku(event.target.value)} /></label>
                <label>Item Name<input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} /></label>
                <label>Unit<input value={newItemUnit} onChange={(event) => setNewItemUnit(event.target.value)} /></label>
                <label>Expected Price<input type="number" min="0.01" step="0.01" value={newItemPrice} onChange={(event) => setNewItemPrice(event.target.value)} /></label>
                <button type="submit" disabled={loading}><Save size={17} /> Create Item</button>
              </form>

              <form className="tool-box" onSubmit={uploadBulkStock}>
                <h3>Bulk Stock Upload</h3>
                <label>
                  Company
                  <select value={bulkCompanyId} onChange={(event) => setBulkCompanyId(event.target.value)} disabled={isCompanyPortal}>
                    {visibleCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                  </select>
                </label>
                <label>
                  Mode
                  <select value={bulkMode} onChange={(event) => setBulkMode(event.target.value as "SET" | "ADD")}>
                    <option value="SET">Set quantity</option>
                    <option value="ADD">Add quantity</option>
                  </select>
                </label>
                <textarea value={bulkCsvText} onChange={(event) => setBulkCsvText(event.target.value)} />
                <button type="submit" disabled={loading}><Save size={17} /> Upload Stock</button>
              </form>

              <form className="tool-box" onSubmit={generatePlanStock}>
                <h3>Generate From Business Plan</h3>
                <label>
                  Company
                  <select value={planStockCompanyId} onChange={(event) => setPlanStockCompanyId(event.target.value)} disabled={isCompanyPortal}>
                    {visibleCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                  </select>
                </label>
                <label>
                  Purchase Target Month
                  <input type="month" value={planStockMonth} onChange={(event) => setPlanStockMonth(event.target.value)} />
                </label>
                <span className="muted-text">Uses business plan purchase target and product buying price. No voucher/code generation.</span>
                <button type="submit" disabled={loading || !planStockCompanyId || !planStockMonth}>
                  <Package size={17} /> Generate Plan Stock
                </button>
                {planStockStatus && <span className="muted-text">{planStockStatus}</span>}
              </form>

              <form className="tool-box" onSubmit={parsePurchaseInvoice}>
                <h3>Purchase Invoice Parser</h3>
                <label>
                  Receiving Company
                  <select value={invoiceCompanyId} onChange={(event) => setInvoiceCompanyId(event.target.value)} disabled={isCompanyPortal}>
                    {visibleCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                  </select>
                </label>
                <textarea value={purchaseInvoiceText} onChange={(event) => setPurchaseInvoiceText(event.target.value)} />
                <button type="submit" disabled={loading}><Save size={17} /> Insert Stock</button>
              </form>

              <form className="tool-box" onSubmit={previewStockProductPrices}>
                <h3>Product Price Upload</h3>
                <label>
                  E.CARD Product File
                  <input
                    type="file"
                    accept=".xlsx,.xls,.xlsb,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(event) => {
                      const selectedFile = event.currentTarget.files?.[0] ?? null;
                      setProductPriceFile(selectedFile);
                      setProductPricePreview(null);
                      setProductPriceImportResult(null);
                      setShowProductImportProgress(Boolean(selectedFile));
                      setProductImportProgress(0);
                      setProductImportStatus(selectedFile ? "File selected. Click Preview Products to continue." : "Waiting for product file");
                    }}
                  />
                </label>
                <span className="muted-text">Imports product name, buying price, and selling price. Stock quantity is not changed.</span>
                <button type="submit" disabled={loading || !productPriceFile}><FileText size={17} /> Preview Products</button>
                <button type="button" disabled={loading || !productPricePreview?.counts.products} onClick={importStockProductPrices}>
                  <Package size={17} /> Confirm Import
                </button>
              </form>
            </section>

            {showProductImportProgress && (
              <div className="import-progress-card">
                <div>
                  <strong>Import Progress</strong>
                  <span>{productImportStatus}</span>
                </div>
                {productImportProgress > 0 && (
                  <div className="progress-track">
                    <span style={{ width: `${productImportProgress}%` }} />
                  </div>
                )}
              </div>
            )}

            {productPricePreview && (
              <section className="stock-product-preview">
                <div className="table-section-title">
                  <strong>Product Upload Preview</strong>
                  <span>{productPricePreview.counts.products} rows detected from {productPricePreview.workbook.sheetNames.join(", ")}</span>
                </div>
                <div className="table product-import-preview-table">
                  <div className="row table-header">
                    <span>SKU</span>
                    <span>Product</span>
                    <span>Currency</span>
                    <span>Denomination</span>
                    <span>Conversion</span>
                    <span>Denom AED</span>
                    <span>Buying</span>
                    <span>Profit</span>
                    <span>%</span>
                    <span>Selling</span>
                  </div>
                  {productPricePreview.products.map((product) => (
                    <div className="row" key={`${product.title}-${product.currency}-${product.denomination}`}>
                      <span>{product.sku}</span>
                      <span>{product.title}</span>
                      <span>{product.currency || "-"}</span>
                      <span>{product.denomination ?? "-"}</span>
                      <span>{product.conversionRate ?? "-"}</span>
                      <span>{product.denominationAed === undefined ? "-" : money(product.denominationAed)}</span>
                      <span>{product.buyingPrice === undefined ? "-" : money(product.buyingPrice)}</span>
                      <span>{product.profit === undefined ? "-" : money(product.profit)}</span>
                      <span>{percent(product.marginPercent)}</span>
                      <span>{product.sellingPrice === undefined ? "-" : money(product.sellingPrice)}</span>
                    </div>
                  ))}
                  {!productPricePreview.products.length && <div className="empty-state">No product rows found in this file.</div>}
                </div>
              </section>
            )}

            {productPriceImportResult && (
              <div className="config-status ready stock-import-result">
                <strong>Product Import Complete</strong>
                <span>{productPriceImportResult.created} created, {productPriceImportResult.updated} updated, {productPriceImportResult.skipped} skipped.</span>
                <span>Showing latest imported rows below. Full product master contains {(summary?.items ?? []).length} products.</span>
                <div className="imported-product-list">
                  {productPriceImportResult.rows.slice(0, 12).map((row) => (
                    <span key={row.sku}>
                      {row.sku} - {row.name} - {row.currency ?? "-"} {row.denomination ?? "-"} - Buy {money(row.buyingPrice ?? 0)} - Profit {money(row.profit ?? 0)} - {percent(row.marginPercent)} - Sell {money(row.sellingPrice)}
                    </span>
                  ))}
                  {productPriceImportResult.rows.length > 12 && <span>+ {productPriceImportResult.rows.length - 12} more products in Product Master.</span>}
                </div>
              </div>
            )}

            {productPriceImportResult && (
              <section className="stock-product-preview">
                <div className="table-section-title">
                  <strong>Product Import Result</strong>
                  <span>{productPriceImportResult.rows.length} rows processed</span>
                </div>
                <div className="table product-import-result-table">
                  <div className="row table-header">
                    <span>Product</span>
                    <span>Status</span>
                    <span>Currency</span>
                    <span>Denomination</span>
                    <span>Conversion</span>
                    <span>Denom AED</span>
                    <span>Buying</span>
                    <span>Profit</span>
                    <span>%</span>
                    <span>Selling</span>
                    <span>Reason</span>
                  </div>
                  {productPriceImportResult.rows.map((row) => (
                    <div className="row" key={`${row.sku}-${row.status}-${row.name}`}>
                      <span>{row.sku}<small>{row.name}</small></span>
                      <span>{row.status}</span>
                      <span>{row.currency ?? "-"}</span>
                      <span>{row.denomination ?? "-"}</span>
                      <span>{row.conversionRate ?? "-"}</span>
                      <span>{row.denominationAed === undefined ? "-" : money(row.denominationAed)}</span>
                      <span>{row.buyingPrice === undefined ? "-" : money(row.buyingPrice)}</span>
                      <span>{row.profit === undefined ? "-" : money(row.profit)}</span>
                      <span>{percent(row.marginPercent)}</span>
                      <span>{money(row.sellingPrice)}</span>
                      <span>{row.reason || "-"}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="table-section-title">
              <strong>Product Master</strong>
              <span>{productMasterRows.length} products imported/created</span>
            </div>
            <div className="table product-master-table">
              {!!productMasterRows.length && (
                <div className="row table-header">
                  <span>Product</span>
                  <span>Currency</span>
                  <span>Denomination</span>
                  <span>Conversion</span>
                  <span>Denom AED</span>
                  <span>Buying</span>
                  <span>Profit</span>
                  <span>%</span>
                  <span>Selling</span>
                  <span>Stock</span>
                  <span>Action</span>
                </div>
              )}
              {productMasterRows.map((item) => (
                <div className="row" key={item.id}>
                  <span>
                    <strong>{item.sku}</strong>
                    <small>{item.name}</small>
                  </span>
                  <span>{item.currency ?? "-"}</span>
                  <span>{item.denomination ?? "-"}</span>
                  <span>{item.conversionRate ?? "-"}</span>
                  <span>{item.denominationAed ? money(item.denominationAed) : "-"}</span>
                  <span>{item.buyingPrice || item.minPrice ? money(item.buyingPrice ?? item.minPrice ?? 0) : "-"}</span>
                  <span>{item.profit ? money(item.profit) : "-"}</span>
                  <span>{percent(item.marginPercent)}</span>
                  <span>{money(item.expectedPrice)}</span>
                  <span>{stockItemIds.has(item.id) ? "Stock row exists" : "No stock row yet"}</span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={loading}
                    onClick={() => {
                      setStockItemId(item.id);
                      setStockCompanyId(stockCompanyId || visibleCompanyOptions[0]?.id || "");
                      setStockQuantity("0");
                    }}
                  >
                    <Plus size={16} /> Add Stock
                  </button>
                </div>
              ))}
              {!productMasterRows.length && <div className="empty-state">No products imported yet.</div>}
            </div>

            <form className="stock-form" onSubmit={saveStock}>
              <label>
                Company
                <select value={stockCompanyId} onChange={(event) => setStockCompanyId(event.target.value)} disabled={isCompanyPortal}>
                  <option value="">Select company</option>
                  {visibleCompanyOptions.map((company) => (
                    <option value={company.id} key={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Item
                <select value={stockItemId} onChange={(event) => setStockItemId(event.target.value)}>
                  <option value="">Select item</option>
                  {(summary?.items ?? []).map((item) => (
                    <option value={item.id} key={item.id}>{item.sku} - {item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input type="number" min="0" step="1" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} />
              </label>
              <button type="submit" disabled={loading}><Save size={17} /> Save Stock</button>
            </form>
            {stockLocalMessage && <div className="local-success stock-local-message">{stockLocalMessage}</div>}
            <div className="table">
                  {scopedStock.map((stock) => (
                <div className="row" key={stock.id}>
                  <span>{stock.company.name}</span>
                  <span>{stock.item.sku}</span>
                  <span>{stock.quantity} {stock.item.unit}</span>
                  <button type="button" className="danger-button" onClick={() => deleteStockRow(stock)} disabled={loading}>
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              ))}
              {!scopedStock.length && <div className="empty-state">No stock rows yet.</div>}
            </div>

            <div className="table-section-title">
              <strong>Stock Movement Report</strong>
              <span>{scopedStockMovementReport.length} product balances</span>
            </div>
            <div className="table stock-movement-table">
              {!!scopedStockMovementReport.length && (
                <div className="row table-header">
                  <span>Company</span>
                  <span>Product</span>
                  <span>Purchased</span>
                  <span>Purchase Value</span>
                  <span>Sold</span>
                  <span>Sales Value</span>
                  <span>Balance</span>
                  <span>Balance Buy Value</span>
                  <span>Balance Sell Value</span>
                </div>
              )}
              {scopedStockMovementReport.map((row) => (
                <div className="row" key={`${row.companyId}-${row.itemId}`}>
                  <span>{row.companyName}</span>
                  <span><strong>{row.sku}</strong><small>{row.itemName}</small></span>
                  <span>{row.purchasedQuantity} {row.unit}</span>
                  <span>{money(row.purchaseValue)}</span>
                  <span>{row.soldQuantity} {row.unit}</span>
                  <span>{money(row.salesValue)}</span>
                  <span>{row.balanceQuantity} {row.unit}</span>
                  <span>{money(row.balanceBuyingValue)}</span>
                  <span>{money(row.balanceSellingValue)}</span>
                </div>
              ))}
              {!scopedStockMovementReport.length && <div className="empty-state">No stock movements yet.</div>}
            </div>
          </Panel>
        )}

        {activeView === "ecommerce" && (
          <Panel title="Ecom Products">
            <div className="ecom-product-grid">
              {ecommerceProductRows.map((stock) => (
                <article className="ecom-product-card" key={stock.id}>
                  <div>
                    <strong>{stock.item.sku}</strong>
                    <span>{stock.item.name}</span>
                  </div>
                  <div className="ecom-product-meta">
                    <span>Seller: {stock.company.name}</span>
                    <span>Available: {stock.quantity} {stock.item.unit}</span>
                    <span>Price: {money(stock.item.expectedPrice)}</span>
                  </div>
                  <button type="button" onClick={() => buyEcommerceProduct(stock)} disabled={loading}>
                    <ShoppingCart size={17} /> Buy
                  </button>
                </article>
              ))}
              {!ecommerceProductRows.length && (
                <div className="empty-state">No ecommerce products available from other company stock.</div>
              )}
            </div>

            <div className="table-section-title">
              <strong>Backend Delivery Tracking</strong>
              <span>{scopedEcommerceOrders.length} orders</span>
            </div>
            <div className="table">
              {scopedEcommerceOrders.map((order) => (
                <div className="row ecom-order-row" key={order.id}>
                  <span>{appDateTime(order.createdAt)}</span>
                  <span>{order.item.sku} x {order.quantity}</span>
                  <span>{order.buyerCompany.name} buying from {order.sellerCompany.name}</span>
                  <span>{money(order.total)}</span>
                  <span className={`status-badge ${order.status.toLowerCase()}`}>{order.status}</span>
                  <button type="button" onClick={() => markEcommerceDelivered(order.id)} disabled={loading || order.status === "DELIVERED"}>
                    <Truck size={16} /> {order.status === "DELIVERED" ? "Delivered" : "Deliver"}
                  </button>
                </div>
              ))}
              {!scopedEcommerceOrders.length && <div className="empty-state">No ecommerce buy orders yet.</div>}
            </div>
          </Panel>
        )}

        {activeView === "workflow" && (
          <Panel title={isCompanyPortal ? `${portalDisplayName} AI Agent Workflow` : "AI Agent Workflow"}>
            <div className="settings-tabs workflow-tabs">
              <button type="button" className={workflowTab === "uploaded" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setWorkflowTab("uploaded")}>
                <FileText size={17} /> Uploaded / Created Workflows
              </button>
              <button type="button" className={workflowTab === "manual" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setWorkflowTab("manual")}>
                <Plus size={17} /> Manual Creation
              </button>
            </div>
            {workflowTab === "uploaded" && (
              <>
            <div className="workflow-company-tabs">
              {businessPlanCompanyOptions.map((company) => (
                <button
                  type="button"
                  key={company.id}
                  className={workflowSelectedCompanyId === company.id ? "secondary-button active-tab" : "secondary-button"}
                  onClick={() => {
                    setPlanAgentCompanyId(company.id);
                    setBusinessPlanCompanyId(company.id);
                  }}
                >
                  <Building2 size={16} />
                  {company.name}
                </button>
              ))}
              {!businessPlanCompanyOptions.length && <div className="empty-state">No active company available for workflow.</div>}
            </div>
            <form className="agent-task-form business-plan-agent-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Business Plan Company
                <select
                  value={planAgentCompanyId}
                  onChange={(event) => {
                    setPlanAgentCompanyId(event.target.value);
                    if (event.target.value) setBusinessPlanCompanyId(event.target.value);
                  }}
                  disabled={isCompanyPortal}
                >
                  <option value="">Select company</option>
                  {businessPlanCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                </select>
              </label>
              {planAgentStatus && <div className="local-success stock-local-message">{planAgentStatus}</div>}
            </form>
            <section className="workflow-plan-card">
              <div className="table-section-title">
                <strong>Uploaded Business Plans</strong>
                <span>{workflowSelectedCompany ? `${workflowSelectedCompany.name}: ` : ""}{selectedWorkflowBusinessPlans.length ? `${selectedWorkflowBusinessPlans.length} plan${selectedWorkflowBusinessPlans.length === 1 ? "" : "s"} uploaded` : "Select a company with imported plans"}</span>
                <button type="button" className="secondary-button" onClick={openWorkflowBusinessPlanImport}>
                  <Plus size={16} /> Upload Business Plan
                </button>
              </div>
              {!workflowSelectedCompanyId && <div className="empty-state">Select a Business Plan Company to view the uploaded plan.</div>}
              {workflowSelectedCompanyId && !selectedWorkflowBusinessPlans.length && (
                <div className="empty-state">No uploaded business plan is saved for this company yet. Import one from Settings &gt; Business Plan Import.</div>
              )}
              <div className="workflow-plan-list">
                {selectedWorkflowBusinessPlans.map((plan, index) => {
                  const status = businessPlanRunStatus[plan.planId] ?? "IDLE";
                  const isEditingPlan = showBusinessPlanEditor && editingBusinessPlanId === plan.planId;
                  const isExpandedPlan = expandedWorkflowPlanIds.includes(plan.planId) || isEditingPlan;
                  const salesSummary = businessPlanSalesSummary(plan, summary?.targets ?? [], summary?.turnoverTargets ?? [], summary?.stock ?? []);
                  return (
                    <article className="workflow-plan-item" key={plan.planId}>
                      <div className="workflow-plan-item-head">
                        <div>
                          <strong>{plan.excelMainCompanyName || plan.companyName}</strong>
                          <span>Plan #{selectedWorkflowBusinessPlans.length - index} - {plan.updatedAt ? `Updated ${appDateTime(plan.updatedAt)}` : "Uploaded plan"}</span>
                        </div>
                        <div className="workflow-plan-actions">
                          <span className={`status-badge ${status === "RUNNING" ? "po_sent" : status === "FAILED" ? "held" : status === "STOPPED" ? "stopped" : status === "COMPLETED" ? "completed" : "open"}`}>{status}</span>
                          <button type="button" disabled={loading || status === "RUNNING"} onClick={() => runBusinessPlanById(plan)}><Play size={16} /> Start Agent</button>
                          <button type="button" className="secondary-button" disabled={status !== "RUNNING"} onClick={() => stopBusinessPlanRun(plan.planId)}><Square size={16} /> Stop</button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setExpandedWorkflowPlanIds((current) => current.includes(plan.planId) ? current.filter((id) => id !== plan.planId) : [...current, plan.planId])}
                          >
                            {isExpandedPlan ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            {isExpandedPlan ? "Close" : "Expand"}
                          </button>
                          {!plan.parseError && (
                            <button type="button" className="secondary-button" onClick={() => { setExpandedWorkflowPlanIds((current) => current.includes(plan.planId) ? current : [...current, plan.planId]); setEditingBusinessPlanId(plan.planId); setShowBusinessPlanEditor((current) => editingBusinessPlanId === plan.planId ? !current : true); }}>
                              <Edit size={16} /> {isEditingPlan ? "Close Modify" : "Modify Plan"}
                            </button>
                          )}
                        </div>
                      </div>
                      {plan.parseError && isExpandedPlan ? (
                        <div className="config-status missing">
                          <strong>Saved plan needs review</strong>
                          <span>{plan.parseError}</span>
                        </div>
                      ) : !plan.parseError && isExpandedPlan ? (
                        <>
                          <div className="workflow-plan-summary">
                            <Metric label="Plan Owner" value={plan.companyName} />
                            <Metric label="Purchase Target" value={plan.purchasePlan?.transactionAmountMin === undefined ? "-" : money(plan.purchasePlan.transactionAmountMin)} />
                            <Metric label="Transaction %" value={plan.purchasePlan?.transactionPercent === undefined ? "-" : percent(plan.purchasePlan.transactionPercent)} />
                            <Metric label="Vendors" value={plan.purchaseVendors?.length ?? 0} />
                            <Metric label="Customers" value={plan.salesCustomers?.length ?? 0} />
                            <Metric label="Plan Period" value={plan.planPeriodDateFrom || plan.planPeriodDateTo ? `${plan.planPeriodDateFrom || "open"} to ${plan.planPeriodDateTo || "open"}` : "-"} />
                          </div>
                          <div className="workflow-plan-sales-summary">
                            <div>
                              <span>Planned Sales Volume</span>
                              <strong>{salesSummary.plannedSalesValue > 0 ? money(salesSummary.plannedSalesValue) : "-"}</strong>
                              <small>{salesSummary.estimatedInvoiceCount === "-" ? "Invoice count not defined" : `${salesSummary.estimatedInvoiceCount} planned invoice${salesSummary.estimatedInvoiceCount === "1" ? "" : "s"}`}</small>
                            </div>
                            <div>
                              <span>Actual Sales Invoices</span>
                              <strong>{salesSummary.salesInvoiceCount}</strong>
                              <small>{salesSummary.totalSalesTargets} sales target{salesSummary.totalSalesTargets === 1 ? "" : "s"} created; {salesSummary.scheduledSalesCount} scheduled/open</small>
                            </div>
                            <div>
                              <span>Total Sales Invoice Value</span>
                              <strong>{money(salesSummary.salesInvoiceValue)}</strong>
                              <small>{salesSummary.salesInvoiceCount ? "Actual invoice value generated" : "No sales invoice generated yet"}</small>
                            </div>
                            <div>
                              <span>Available Stock Sales Value</span>
                              <strong>{money(salesSummary.stockProjectedSalesValue)}</strong>
                              <small>{salesSummary.stockQuantity} qty from stock; margin {money(salesSummary.stockProjectedMargin)} {salesSummary.stockMarginPercent === undefined ? "" : `(${percent(salesSummary.stockMarginPercent)})`}</small>
                            </div>
                            <div>
                              <span>Purchase To Sales</span>
                              <strong>{money(salesSummary.purchaseInvoiceValue)} / {money(salesSummary.projectedOrActualSalesValue)}</strong>
                              <small>{salesSummary.salesInvoiceCount ? "Using actual sales invoices" : `Using projected stock value; margin ${money(salesSummary.projectedOrActualMargin)}`}</small>
                            </div>
                            <div>
                              <span>Plan Coverage</span>
                              <strong>{salesSummary.projectedCoveragePercent === undefined ? "-" : percent(salesSummary.projectedCoveragePercent)}</strong>
                              <small>Remaining sales gap {money(salesSummary.projectedSalesGap)}{salesSummary.invoiceLimit ? `; invoice limit ${money(salesSummary.invoiceLimit)}` : ""}</small>
                            </div>
                          </div>
                          {isEditingPlan && (
                            <form className="business-plan-edit-form" key={`edit-${plan.planId}-${planAgentMonth}`} onSubmit={saveBusinessPlanEdits}>
                              <label>
                                Plan Period From
                                <input name="planPeriodDateFrom" type="date" defaultValue={plan.planPeriodDateFrom ?? ""} />
                              </label>
                              <label>
                                Plan Period To
                                <input name="planPeriodDateTo" type="date" defaultValue={plan.planPeriodDateTo ?? ""} />
                              </label>
                              <label>
                                Purchase Target For Plan Period
                                <input name="purchaseTargetAmount" type="number" min="0" step="0.01" defaultValue={selectedWorkflowPurchaseTarget?.amount ?? plan.purchasePlan?.transactionAmountMin ?? ""} />
                              </label>
                              <label>
                                Sales Target For Plan Period
                                <input name="salesTargetAmount" type="number" min="0" step="0.01" defaultValue={selectedWorkflowSalesTarget?.amount ?? selectedWorkflowPurchaseTarget?.amount ?? plan.purchasePlan?.transactionAmountMin ?? ""} />
                              </label>
                              <label>
                                Transaction Percentage
                                <input name="transactionPercent" type="number" min="0" max="100" step="0.01" defaultValue={plan.purchasePlan?.transactionPercent ? plan.purchasePlan.transactionPercent * 100 : ""} />
                              </label>
                              <label>
                                Purchase Invoice Rule
                                <input name="purchaseInvoiceRuleText" defaultValue={plan.purchasePlan?.invoiceRuleText ?? ""} />
                              </label>
                              <label>
                                Sales Invoice Rule
                                <input name="salesInvoiceRuleText" defaultValue={plan.salesPlan?.invoiceRuleText ?? ""} />
                              </label>
                              <label className="business-plan-edit-lines">
                                Purchase Vendors
                                <textarea name="purchaseVendors" defaultValue={businessPlanPartnerLines(plan.purchaseVendors)} />
                                <small>One per line: Vendor Name | Allocation % | Email | Address</small>
                              </label>
                              <label className="business-plan-edit-lines">
                                Sales Customers
                                <textarea name="salesCustomers" defaultValue={businessPlanPartnerLines(plan.salesCustomers, plan.salesAllocations)} />
                                <small>One per line: Customer Name | Allocation % | Email | Address</small>
                              </label>
                              <div className="company-card-actions">
                                <button type="submit" disabled={loading}><Save size={17} /> Save Modified Plan</button>
                                <button type="button" className="secondary-button" disabled={loading} onClick={() => setShowBusinessPlanEditor(false)}>Cancel</button>
                              </div>
                            </form>
                          )}
                          <div className="table workflow-plan-table">
                            <div className="row table-header"><span>Section</span><span>Rule / Name</span><span>Allocation / Detail</span><span>Contact / Notes</span></div>
                            <div className="row"><span>Purchase Plan</span><span>{plan.purchasePlan?.revenueTargetText || "Revenue target not set"}</span><span>{plan.purchasePlan?.transactionAmountMin === undefined ? "-" : `${money(plan.purchasePlan.transactionAmountMin)}${plan.purchasePlan.transactionPercent ? ` (${percent(plan.purchasePlan.transactionPercent)} of revenue)` : ""}`}</span><span>{plan.purchasePlan?.invoiceRuleText || "Invoice rule not set"}</span></div>
                            <div className="row"><span>Sales Plan</span><span>{plan.salesPlan?.priceRule || plan.salesPlan?.productSpecification || "Sales rule not set"}</span><span>{plan.salesPlan?.invoiceRuleText || "-"}</span><span>{plan.salesPlan?.productSpecification || "-"}</span></div>
                            {(plan.purchaseVendors ?? []).map((vendor) => <div className="row" key={`${plan.planId}-vendor-${vendor.name}`}><span>Vendor</span><span>{vendor.name}</span><span>{vendor.allocationPercent === undefined ? "Auto allocation" : `${percent(vendor.allocationPercent)} purchase`}</span><span>{vendor.email || vendor.address || "Contact can be added later"}</span></div>)}
                            {(plan.salesCustomers ?? []).map((customer) => {
                              const allocation = plan.salesAllocations?.find((entry) => entry.name.toLowerCase() === customer.name.toLowerCase());
                              return <div className="row" key={`${plan.planId}-customer-${customer.name}`}><span>Customer</span><span>{customer.name}</span><span>{allocation?.allocationPercent === undefined ? "Auto allocation" : `${percent(allocation.allocationPercent)} sales`}</span><span>{customer.email || customer.address || customer.bank?.bankName || "Contact can be added later"}</span></div>;
                            })}
                          </div>
                        </>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
              </>
            )}
            {workflowTab === "manual" && (
              <>
            <div className="manual-agent-section">
              <div className="table-section-title manual-agent-title">
                <strong>Manual Agent Commands</strong>
                <span>Optional one-off instructions outside uploaded business plans.</span>
                {agentRunning && <span className="status-badge po_sent">RUNNING</span>}
              </div>
              <div className="command-templates">
                <button type="button" className="secondary-button" onClick={() => applyAgentTemplate("today")}>Create today PO</button>
                <button type="button" className="secondary-button" onClick={() => applyAgentTemplate("multipleToday")}>Create multiple POs today</button>
                <button type="button" className="secondary-button" onClick={() => applyAgentTemplate("weekly")}>Create weekly schedule</button>
                <button type="button" className="secondary-button" onClick={() => applyAgentTemplate("monthly")}>Create monthly schedule</button>
                <button type="button" className="secondary-button" onClick={() => applyAgentTemplate("buy")}>Buy from vendor</button>
                <button type="button" className="secondary-button" onClick={() => applyAgentTemplate("sell")}>Sell to customer</button>
              </div>
            <form className="agent-task-form" onSubmit={startAgentTask}>
              <label>
                Tell Agent What To Do
                <textarea value={agentInstruction} onChange={(event) => updateAgentInstruction(event.target.value)} />
              </label>
              <label>
                Job Type
                <select value={workflowDirection} onChange={(event) => setWorkflowDirection(event.target.value as "PURCHASE" | "SALES")}>
                  <option value="PURCHASE">Purchase PO to vendor</option>
                  <option value="SALES">Sales PO from customer</option>
                </select>
              </label>
              <label>
                {workflowDirection === "PURCHASE" ? "Buyer" : "Seller"}
                <select value={workflowCompanyId} onChange={(event) => setWorkflowCompanyId(event.target.value)} disabled={isCompanyPortal}>
                  <option value="">Auto choose company</option>
                  {visibleCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>
                {workflowDirection === "PURCHASE" ? "Vendor" : "Customer"}
                <select value={workflowCounterpartyId} onChange={(event) => setWorkflowCounterpartyId(event.target.value)}>
                  <option value="">Select {workflowDirection === "PURCHASE" ? "vendor" : "customer"}</option>
                  {(workflowDirection === "PURCHASE" ? allVendorCompanyOptions : allCustomerCompanyOptions)
                    .filter((company) => company.id !== workflowCompanyId)
                    .map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>
                Number of POs
                <input type="number" min="1" max="10" step="1" value={agentPoCount} onChange={(event) => setAgentPoCount(event.target.value)} />
              </label>
              <label>
                Date From
                <input type="date" value={agentDateFrom} onChange={(event) => setAgentDateFrom(event.target.value)} />
              </label>
              <label>
                Date To
                <input type="date" value={agentDateTo} onChange={(event) => setAgentDateTo(event.target.value)} />
              </label>
              <label>
                Invoice Delay
                <select value={agentInvoiceDelayMode} onChange={(event) => setAgentInvoiceDelayMode(event.target.value as "FIXED" | "RANDOM")}>
                  <option value="RANDOM">Random range</option>
                  <option value="FIXED">Fixed minutes</option>
                </select>
              </label>
              {agentInvoiceDelayMode === "FIXED" ? (
                <label>
                  Fixed Delay Minutes
                  <input type="number" min="0" max="1440" step="1" value={agentInvoiceDelay} onChange={(event) => setAgentInvoiceDelay(event.target.value)} />
                </label>
              ) : (
                <>
                  <label>
                    Min Delay Minutes
                    <input type="number" min="0" max="1440" step="1" value={agentInvoiceDelayMin} onChange={(event) => setAgentInvoiceDelayMin(event.target.value)} />
                  </label>
                  <label>
                    Max Delay Minutes
                    <input type="number" min="0" max="1440" step="1" value={agentInvoiceDelayMax} onChange={(event) => setAgentInvoiceDelayMax(event.target.value)} />
                  </label>
                </>
              )}
              <label>
                Amount Mode
                <select value={agentAmountMode} onChange={(event) => setAgentAmountMode(event.target.value as "PER_PO" | "TOTAL_SPLIT")}>
                  <option value="PER_PO">Amount per PO</option>
                  <option value="TOTAL_SPLIT">Total split amount</option>
                </select>
              </label>
              <label>
                Amount
                <input type="number" min="0.01" step="0.01" value={agentAmount} onChange={(event) => setAgentAmount(event.target.value)} />
              </label>
              <label>
                Product Count
                <input type="number" min="1" max="20" step="1" value={agentLineCount} onChange={(event) => setAgentLineCount(event.target.value)} disabled={agentProductMode === "SELECTED"} />
              </label>
              <label>
                Product Mode
                <select value={agentProductMode} onChange={(event) => setAgentProductMode(event.target.value as "RANDOM" | "SELECTED")}>
                  <option value="RANDOM">Random products</option>
                  <option value="SELECTED">Selected products</option>
                </select>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={agentAutoStart} onChange={(event) => setAgentAutoStart(event.target.checked)} />
                Auto send PO
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={agentAutoInvoice} onChange={(event) => setAgentAutoInvoice(event.target.checked)} />
                Auto invoice after delay
              </label>
              {agentProductMode === "SELECTED" && (
                <div className="product-picker agent-product-picker">
                  {workflowProductOptions.map(({ item, quantity }) => (
                    <label className="checkbox-row" key={item.id}>
                      <input type="checkbox" checked={workflowItemIds.includes(item.id)} onChange={() => toggleWorkflowItem(item.id)} />
                      <span>{item.sku} - {item.name}</span>
                      <small>{quantity} in seller stock</small>
                    </label>
                  ))}
                  {!workflowProductOptions.length && <div className="empty-state">No seller stock available for selected vendor/customer.</div>}
                </div>
              )}
              <div className="agent-preview">
                <strong>Agent Preview</strong>
                <span>Count: {agentPreview.count}</span>
                <span>Amount mode: {agentPreview.amountMode}</span>
                <span>Date: {agentPreview.date}</span>
                <span>Products: {agentPreview.products}</span>
                <span>Invoice: {agentPreview.invoice}</span>
              </div>
              {agentRunning && (
                <div className="agent-progress" aria-live="polite">
                  <div className="agent-progress-head">
                    <span className="spinner" />
                    <strong>Agent is working</strong>
                    <span>Please wait. Creating documents and sending emails can take a moment.</span>
                  </div>
                  <div className="progress-bar"><span /></div>
                  <div className="agent-progress-steps">
                    <span>Parsing instruction</span>
                    <span>Creating target</span>
                    <span>Generating PO</span>
                    <span>Sending email</span>
                    <span>Refreshing data</span>
                  </div>
                </div>
              )}
              <div className="workflow-form-actions">
                <button type="submit" disabled={loading}>
                  {agentRunning ? <span className="button-spinner" /> : <Play size={17} />}
                  {agentRunning ? "Agent Running..." : "Start Agent"}
                </button>
                <button type="button" className="secondary-button" onClick={() => setShowAdvancedWorkflow((current) => !current)}>
                  {showAdvancedWorkflow ? "Hide Details" : "Manual Details"}
                </button>
              </div>
            </form>
            </div>

            {showAdvancedWorkflow && (
            <form className="workflow-planner-form" onSubmit={(event) => { event.preventDefault(); saveWorkflowTarget(false); }}>
              <label>
                Target Period
                <select value={workflowPeriodType} onChange={(event) => setWorkflowPeriodType(event.target.value as "MONTHLY" | "DAILY")}>
                  <option value="MONTHLY">Monthly date range</option>
                  <option value="DAILY">Daily hour range</option>
                </select>
              </label>
              <label>
                Month
                <input type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} disabled={workflowPeriodType === "DAILY"} />
              </label>
              <label>
                Date From
                <input type="date" value={workflowDateFrom} onChange={(event) => setWorkflowDateFrom(event.target.value)} />
              </label>
              <label>
                Date To
                <input type="date" value={workflowDateTo} onChange={(event) => setWorkflowDateTo(event.target.value)} disabled={workflowPeriodType === "DAILY"} />
              </label>
              <label>
                Hour From
                <input type="time" value={workflowHourFrom} onChange={(event) => setWorkflowHourFrom(event.target.value)} disabled={workflowPeriodType === "MONTHLY"} />
              </label>
              <label>
                Hour To
                <input type="time" value={workflowHourTo} onChange={(event) => setWorkflowHourTo(event.target.value)} disabled={workflowPeriodType === "MONTHLY"} />
              </label>
              <label>
                Sales / Purchase
                <select value={workflowDirection} onChange={(event) => setWorkflowDirection(event.target.value as "PURCHASE" | "SALES")}>
                  <option value="PURCHASE">Purchase</option>
                  <option value="SALES">Sales</option>
                </select>
              </label>
              <label>
                Company
                <select value={workflowCompanyId} onChange={(event) => setWorkflowCompanyId(event.target.value)} disabled={isCompanyPortal}>
                  <option value="">Select company</option>
                  {visibleCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>
                {workflowDirection === "SALES" ? "Customer Name" : "Vendor Name"}
                <select value={workflowCounterpartyId} onChange={(event) => setWorkflowCounterpartyId(event.target.value)}>
                  <option value="">Select {workflowDirection === "SALES" ? "customer" : "vendor"}</option>
                  {(workflowDirection === "PURCHASE" ? allVendorCompanyOptions : allCustomerCompanyOptions)
                    .filter((company) => company.id !== workflowCompanyId)
                    .map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>
                Volume Amount
                <input type="number" min="0.01" step="0.01" value={workflowAmount} onChange={(event) => setWorkflowAmount(event.target.value)} />
              </label>
              <label>
                Product Volume
                <input type="number" min="1" max="20" step="1" value={workflowLineCount} onChange={(event) => setWorkflowLineCount(event.target.value)} disabled={workflowProductMode === "SELECTED"} />
              </label>
              <label>
                Product Selection
                <select value={workflowProductMode} onChange={(event) => setWorkflowProductMode(event.target.value as "RANDOM" | "SELECTED")}>
                  <option value="RANDOM">Random from stock</option>
                  <option value="SELECTED">Select from list</option>
                </select>
              </label>
              <label className="target-notes">
                Notes
                <input value={targetNotes} onChange={(event) => setTargetNotes(event.target.value)} placeholder="Optional instruction" />
              </label>
              {workflowProductMode === "SELECTED" && (
                <div className="product-picker">
                  {workflowProductOptions.map(({ item, quantity }) => (
                    <label className="checkbox-row" key={item.id}>
                      <input type="checkbox" checked={workflowItemIds.includes(item.id)} onChange={() => toggleWorkflowItem(item.id)} />
                      <span>{item.sku} - {item.name}</span>
                      <small>{quantity} in seller stock</small>
                    </label>
                  ))}
                  {!workflowProductOptions.length && (
                    <div className="empty-state">No seller stock available for selected vendor/customer.</div>
                  )}
                </div>
              )}
              <div className="workflow-form-actions">
                <button type="submit" disabled={loading}><Save size={17} /> {editingTargetId ? "Update Target" : "Create Target"}</button>
                <button type="button" onClick={() => saveWorkflowTarget(true)} disabled={loading}><Play size={17} /> Create And Run</button>
                {editingTargetId && (
                  <button type="button" className="secondary-button" onClick={cancelEditTarget} disabled={loading}><X size={17} /> Cancel</button>
                )}
              </div>
            </form>
            )}
              </>
            )}
            {workflowTab === "uploaded" && (
              <>
            <div className="table-section-title">
              <strong>Today's Targets</strong>
              <span>{workflowSelectedCompany ? `${workflowSelectedCompany.name} - ` : ""}{todayDate} - {workflowTodayTargets.length} total</span>
            </div>
            <PaginationControls
              page={workflowTodayCurrentPage}
              totalPages={workflowTodayTotalPages}
              totalRows={workflowTodayTargets.length}
              onPageChange={setWorkflowTodayPage}
            />
            <div className="table">
              {pagedWorkflowTodayTargets.map((target) => (
                <div className="row workflow-row" key={target.id}>
                  <span>{target.periodType === "DAILY" ? `${target.targetDate ?? target.dateFrom} ${target.hourFrom ?? ""}-${target.hourTo ?? ""}` : `${target.month} ${target.dateFrom ?? ""}-${target.dateTo ?? ""}`}</span>
                  <span>{target.buyerCompany.name} to {target.sellerCompany.name}</span>
                  <span className="target-value">{target.invoiceNumber ? "Invoice" : "PO"} {targetDocumentValue(target)}</span>
                  <span className={`status-badge ${target.status.toLowerCase()}`}>{target.status}</span>
                  <button type="button" className="secondary-button" onClick={() => downloadTargetPoPdf(target)} disabled={loading || target.status === "OPEN"}><Download size={16} /> PO PDF</button>
                  <button type="button" onClick={() => target.status === "PO_SENT" ? createVendorInvoice(target.id) : runWorkflow(target.id)} disabled={loading || !["OPEN", "PO_SENT"].includes(target.status) || (target.status === "PO_SENT" && !canCreateVendorInvoice(target))}>
                    {target.status === "OPEN" ? "Send PO" : target.status === "PO_SENT" ? (canCreateVendorInvoice(target) ? "Create Invoice" : "Waiting Invoice") : "Completed"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => stopWorkflow(target.id)} disabled={loading || target.status !== "OPEN"}><Square size={16} /> Stop</button>
                  <button type="button" className="secondary-button" onClick={() => editTarget(target)} disabled={loading || target.status !== "OPEN"}><Edit size={16} /> Edit</button>
                  <button type="button" className="danger-button" onClick={() => deleteTarget(target.id)} disabled={loading || target.status !== "OPEN"}><Trash2 size={16} /> Delete</button>
                </div>
              ))}
              {!workflowTodayTargets.length && (
                <div className="empty-state">No target created for this company today yet.</div>
              )}
            </div>
            <div className="table-section-title">
              <strong>Other Workflow Targets</strong>
              <span>{workflowSelectedCompany ? `${workflowSelectedCompany.name}: ` : ""}{workflowOtherTargets.length} total</span>
            </div>
            <PaginationControls
              page={workflowOtherCurrentPage}
              totalPages={workflowOtherTotalPages}
              totalRows={workflowOtherTargets.length}
              onPageChange={setWorkflowOtherPage}
            />
            <div className="table">
              {pagedWorkflowOtherTargets.map((target) => (
                <div className="row workflow-row" key={target.id}>
                  <span>{target.periodType === "DAILY" ? `${target.targetDate ?? target.dateFrom} ${target.hourFrom ?? ""}-${target.hourTo ?? ""}` : `${target.month} ${target.dateFrom ?? ""}-${target.dateTo ?? ""}`}</span>
                  <span>{target.buyerCompany.name} to {target.sellerCompany.name}</span>
                  <span className="target-value">{target.invoiceNumber ? "Invoice" : "PO"} {targetDocumentValue(target)}</span>
                  <span className={`status-badge ${target.status.toLowerCase()}`}>{target.status}</span>
                  <button type="button" className="secondary-button" onClick={() => downloadTargetPoPdf(target)} disabled={loading || target.status === "OPEN"}><Download size={16} /> PO PDF</button>
                  <button type="button" onClick={() => target.status === "PO_SENT" ? createVendorInvoice(target.id) : runWorkflow(target.id)} disabled={loading || !["OPEN", "PO_SENT"].includes(target.status) || (target.status === "PO_SENT" && !canCreateVendorInvoice(target))}>
                    {target.status === "OPEN" ? "Send PO" : target.status === "PO_SENT" ? (canCreateVendorInvoice(target) ? "Create Invoice" : "Waiting Invoice") : "Completed"}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => stopWorkflow(target.id)} disabled={loading || target.status !== "OPEN"}><Square size={16} /> Stop</button>
                  <button type="button" className="secondary-button" onClick={() => editTarget(target)} disabled={loading || target.status !== "OPEN"}><Edit size={16} /> Edit</button>
                  <button type="button" className="danger-button" onClick={() => deleteTarget(target.id)} disabled={loading || target.status !== "OPEN"}><Trash2 size={16} /> Delete</button>
                </div>
              ))}
              {!workflowOtherTargets.length && (
                <div className="empty-state">No other workflow targets for this company.</div>
              )}
            </div>
              </>
            )}
          </Panel>
        )}

        {activeView === "invoices" && (
          <Panel title="Invoices">
            <div className="invoice-layout">
              <div className="table">
                {scopedInvoices.map((invoice) => (
                  <button
                    className={selectedInvoiceId === invoice.id ? "invoice-row active" : "invoice-row"}
                    key={invoice.id}
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                    type="button"
                  >
                    <span>{invoice.invoiceNumber}</span>
                    <span>{invoice.sellerCompany.name} to {invoice.buyerCompany.name}</span>
                    <strong>{money(invoice.total)}</strong>
                  </button>
                ))}
                {!scopedInvoices.length && (
                  <div className="empty-state">No invoices yet. Run the workflow to generate one.</div>
                )}
              </div>

              {invoiceDetail && (
                <div className="invoice-paper">
                  <div className="invoice-head">
                    <div>
                      <span className="eyebrow">Tax Invoice</span>
                      <h2>{invoiceDetail.invoiceNumber}</h2>
                    </div>
                    <div className="invoice-actions">
                      <button type="button" onClick={() => downloadInvoicePdf(invoiceDetail.id)} disabled={loading}><Download size={17} /> Download PDF</button>
                      <button type="button" onClick={() => sendInvoice(invoiceDetail.id)} disabled={loading}><Send size={17} /> Send Invoice</button>
                    </div>
                  </div>

                  <div className="invoice-meta">
                    <div>
                      <strong>Seller</strong>
                      <span>{invoiceDetail.sellerCompany.legalName}</span>
                      <span>{invoiceDetail.sellerCompany.location}</span>
                      <span>{invoiceDetail.sellerCompany.trn ? `TRN ${invoiceDetail.sellerCompany.trn}` : "TRN not set"}</span>
                    </div>
                    <div>
                      <strong>Buyer</strong>
                      <span>{invoiceDetail.buyerCompany.legalName}</span>
                      <span>{invoiceDetail.buyerCompany.location}</span>
                      <span>{invoiceDetail.buyerCompany.trn ? `TRN ${invoiceDetail.buyerCompany.trn}` : "TRN not set"}</span>
                    </div>
                    <div>
                      <strong>Reference</strong>
                      <span>PO {invoiceDetail.purchaseOrder.poNumber}</span>
                      <span>{appDate(invoiceDetail.createdAt)}</span>
                    </div>
                  </div>

                  <div className="invoice-lines">
                    <div className="invoice-line header">
                      <span>Item</span>
                      <span>Qty</span>
                      <span>Unit</span>
                      <span>VAT</span>
                      <span>Total</span>
                    </div>
                    {invoiceDetail.lines.map((line) => (
                      <div className="invoice-line" key={line.id}>
                        <span>{line.item.sku} - {line.item.name}</span>
                        <span>{line.quantity}</span>
                        <span>{money(line.unitPrice)}</span>
                        <span>{Number(line.vatRate) * 100}%</span>
                        <span>{money(line.lineTotal)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="invoice-totals">
                    <span>Subtotal</span><strong>{money(invoiceDetail.subtotal)}</strong>
                    <span>VAT 5%</span><strong>{money(invoiceDetail.vatAmount)}</strong>
                    <span>Total</span><strong>{money(invoiceDetail.total)}</strong>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}

        {activeView === "reports" && (
          <Panel title="Reports">
            <form className="stock-form report-filter-form" onSubmit={(event) => { event.preventDefault(); loadReports().catch((error) => setMessage(error.message)); }}>
              <label>
                Company
                <select value={reportCompanyId} onChange={(event) => setReportCompanyId(event.target.value)} disabled={isCompanyPortal}>
                  <option value="ALL">All companies</option>
                  {visibleCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>
                Month
                <input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
              </label>
              <label>
                Customer
                <select value={reportCustomerId} onChange={(event) => setReportCustomerId(event.target.value)}>
                  <option value="ALL">All customers</option>
                  {allCustomerCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>
                Vendor
                <select value={reportVendorId} onChange={(event) => setReportVendorId(event.target.value)}>
                  <option value="ALL">All vendors</option>
                  {allVendorCompanyOptions.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label>
                Product
                <select value={reportProductId} onChange={(event) => setReportProductId(event.target.value)}>
                  <option value="ALL">All products</option>
                  {(summary?.items ?? []).map((item) => <option value={item.id} key={item.id}>{item.sku} - {item.name}</option>)}
                </select>
              </label>
              <button type="submit" disabled={loading}><RefreshCcw size={17} /> Refresh Reports</button>
            </form>

            <div className="report-grid">
              <ReportTable title="Purchase Report - Vendor Wise" count={filteredPurchaseVendorWise.length} empty="No purchase vendor rows." headers={["Vendor", "Invoices", "Qty", "Subtotal", "VAT", "Total"]}>
                {filteredPurchaseVendorWise.map((row) => <div className="row" key={row.vendorId}><span>{row.vendorName}</span><span>{row.invoiceCount}</span><span>{row.quantity}</span><span>{money(row.subtotal)}</span><span>{money(row.vatAmount)}</span><span>{money(row.total)}</span></div>)}
              </ReportTable>
              <ReportTable title="Purchase Report - Product Wise" count={filteredPurchaseProductWise.length} empty="No purchase product rows." headers={["SKU", "Product", "Qty", "Buying Value", "VAT"]}>
                {filteredPurchaseProductWise.map((row) => <div className="row" key={row.itemId}><span>{row.sku}</span><span>{row.itemName}</span><span>{row.quantity}</span><span>{money(row.buyingValue)}</span><span>{money(row.vatAmount)}</span></div>)}
              </ReportTable>
              <ReportTable title="Purchase Report - PO / Invoice Wise" count={filteredPurchaseInvoiceWise.length} empty="No purchase invoices." headers={["Date", "PO", "Invoice", "Vendor", "Subtotal", "VAT", "Total"]} wide>
                {filteredPurchaseInvoiceWise.map((row) => <div className="row" key={row.invoiceId}><span>{appDate(row.date)}</span><span>{row.poNumber}</span><span>{row.invoiceNumber}</span><span>{row.vendorName}</span><span>{money(row.subtotal)}</span><span>{money(row.vatAmount)}</span><span>{money(row.total)}</span></div>)}
              </ReportTable>
              <ReportTable title="Sales Report - Customer Wise" count={filteredSalesCustomerWise.length} empty="No sales customer rows." headers={["Customer", "Invoices", "Qty", "Subtotal", "VAT", "Total"]}>
                {filteredSalesCustomerWise.map((row) => <div className="row" key={row.customerId}><span>{row.customerName}</span><span>{row.invoiceCount}</span><span>{row.quantity}</span><span>{money(row.subtotal)}</span><span>{money(row.vatAmount)}</span><span>{money(row.total)}</span></div>)}
              </ReportTable>
              <ReportTable title="Sales Report - Product Wise" count={filteredSalesProductWise.length} empty="No sales product rows." headers={["SKU", "Product", "Qty", "Selling Value", "VAT"]}>
                {filteredSalesProductWise.map((row) => <div className="row" key={row.itemId}><span>{row.sku}</span><span>{row.itemName}</span><span>{row.quantity}</span><span>{money(row.sellingValue)}</span><span>{money(row.vatAmount)}</span></div>)}
              </ReportTable>
              <ReportTable title="Sales Report - Invoice Wise" count={filteredSalesInvoiceWise.length} empty="No sales invoices." headers={["Date", "Invoice", "Customer", "Subtotal", "VAT", "Total"]} wide>
                {filteredSalesInvoiceWise.map((row) => <div className="row" key={row.invoiceId}><span>{appDate(row.date)}</span><span>{row.invoiceNumber}</span><span>{row.customerName}</span><span>{money(row.subtotal)}</span><span>{money(row.vatAmount)}</span><span>{money(row.total)}</span></div>)}
              </ReportTable>
              <ReportTable title="Profit Report" count={filteredProfitRows.length} empty="No profit rows." headers={["Company", "Product", "Buy Value", "Sell Value", "Margin", "%"]} wide subtitle={`VAT Net ${money(reports?.profit.vat.netVat ?? 0)}`}>
                {filteredProfitRows.map((row) => <div className="row" key={`${row.companyId}-${row.sku}`}><span>{row.companyName}</span><span>{row.sku}<small>{row.itemName}</small></span><span>{money(row.buyingValue)}</span><span>{money(row.sellingValue)}</span><span>{money(row.margin)}</span><span>{row.marginPercent}%</span></div>)}
              </ReportTable>
              <ReportTable title="Stock Report" count={filteredStockRows.length} empty="No stock movement rows." headers={["Company", "Product", "Opening", "Purchase", "Sales", "Closing", "Closing Buy", "Closing Sell"]} wide>
                {filteredStockRows.map((row) => <div className="row" key={`${row.companyId}-${row.sku}`}><span>{row.companyName}</span><span>{row.sku}<small>{row.itemName}</small></span><span>{row.opening}</span><span>{row.purchased}</span><span>{row.sold}</span><span>{row.closing}</span><span>{money(row.closingBuyingValue)}</span><span>{money(row.closingSellingValue)}</span></div>)}
              </ReportTable>
              <ReportTable title="Target Achievement" count={reports?.targetAchievement.rows.length ?? 0} empty="No targets configured for this filter." headers={["Company", "Month", "Type", "Planned", "Actual", "Variance", "%", "Invoices"]} wide>
                {reports?.targetAchievement.rows.map((row) => <div className="row" key={`${row.companyId}-${row.month}-${row.type}`}><span>{row.companyName}</span><span>{row.month}</span><span>{row.type}</span><span>{money(row.plannedValue)}</span><span>{money(row.actualValue)}</span><span>{money(row.variance)}</span><span>{row.achievementPercent}%</span><span>{row.invoiceCount}</span></div>)}
              </ReportTable>
              <ReportTable title="Audit Report" count={reports?.audit.events.length ?? 0} empty="No audit events." headers={["Date", "Type", "Status", "Title", "Detail / Failure"]} audit>
                {reports?.audit.events.map((row) => <div className="row" key={`${row.type}-${row.id}`}><span>{appDateTime(row.date)}</span><span>{row.type}</span><span>{row.status}</span><span>{row.title}</span><span>{row.failureReason || row.detail}</span></div>)}
              </ReportTable>
            </div>
          </Panel>
        )}

      </section>
    </main>
  );
}

function NavButton({
  icon,
  label,
  view,
  activeView,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  view: View;
  activeView: View;
  onSelect: (view: View) => void;
}) {
  return (
    <button className={activeView === view ? "nav-button active" : "nav-button"} onClick={() => onSelect(view)} type="button">
      {icon}
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function PaginationControls({
  page,
  totalPages,
  totalRows,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (page: number) => void;
}) {
  if (totalRows <= workflowPageSize) return null;
  const start = (page - 1) * workflowPageSize + 1;
  const end = Math.min(totalRows, page * workflowPageSize);
  return (
    <div className="pagination-controls">
      <span>{start}-{end} of {totalRows}</span>
      <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => onPageChange(1)}>First</button>
      <button type="button" className="secondary-button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      <strong>Page {page} / {totalPages}</strong>
      <button type="button" className="secondary-button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button>
      <button type="button" className="secondary-button" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>Last</button>
    </div>
  );
}

function ReportTable({
  title,
  count,
  subtitle,
  empty,
  headers,
  children,
  wide,
  audit,
}: {
  title: string;
  count: number;
  subtitle?: string;
  empty: string;
  headers: string[];
  children: React.ReactNode;
  wide?: boolean;
  audit?: boolean;
}) {
  return (
    <section className="report-section">
      <div className="table-section-title"><strong>{title}</strong><span>{subtitle ?? `${count} rows`}</span></div>
      <div className={`table ${audit ? "audit-report-table" : wide ? "report-wide-table" : "report-table"}`}>
        {!!count && <div className="row table-header">{headers.map((header) => <span key={header}>{header}</span>)}</div>}
        {children}
        {!count && <div className="empty-state">{empty}</div>}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
