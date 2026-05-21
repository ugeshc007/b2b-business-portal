import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Building2, ChevronDown, ChevronUp, Download, Edit, FileText, LogIn, Mail, Package, Play, RefreshCcw, Save, Send, Settings, ShieldCheck, Square, Trash2, X } from "lucide-react";
import "./styles.css";

const apiUrl = import.meta.env.VITE_API_URL ?? window.location.origin;
const portalSlug = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
const portalCompanyName = ["dealz", "dealzarabia"].includes(portalSlug) ? "Dealzarabia" : portalSlug === "buy2day" ? "Buy2day" : "";
const isCompanyPortal = Boolean(portalCompanyName);

type Company = {
  id: string;
  name: string;
  legalName: string;
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
};
type Item = { id: string; sku: string; name: string; unit: string; expectedPrice: string; maxPrice?: string };
type Stock = { id: string; quantity: number; company: Company; item: Item };
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
type Invoice = { id: string; invoiceNumber: string; total: string; vatAmount: string; buyerCompany: Company; sellerCompany: Company };
type InvoiceDetail = Invoice & {
  subtotal: string;
  createdAt: string;
  purchaseOrder: { poNumber: string };
  lines: Array<{ id: string; quantity: number; unitPrice: string; vatRate: string; lineTotal: string; item: Item }>;
};
type EmailLog = { id: string; fromEmail: string; toEmail: string; subject: string; status: string };
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
  onConfirm: () => Promise<void>;
};
type Summary = {
  counts: Record<string, number>;
  overview: Overview;
  companies: Company[];
  items: Item[];
  stock: Stock[];
  targets: Target[];
  invoices: Invoice[];
  emails: EmailLog[];
  agentAuditLogs: AgentAuditLog[];
  emailIntegrations: EmailIntegration[];
  turnoverTargets: TurnoverTarget[];
};

type View = "overview" | "stock" | "workflow" | "invoices" | "settings";

function money(value: string | number) {
  return `AED ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function monthStartInputValue(date = new Date()) {
  return dateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
}

function monthEndInputValue(date = new Date()) {
  return dateInputValue(new Date(date.getFullYear(), date.getMonth() + 1, 0));
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

function App() {
  const [token, setToken] = useState(localStorage.getItem("b2b-token") ?? "");
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState("");
  const [confirmationToast, setConfirmationToast] = useState<ConfirmationToast | null>(null);
  const [loading, setLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [activeView, setActiveView] = useState<View>("overview");
  const [settingsTab, setSettingsTab] = useState<"company" | "email" | "log" | "audit">("company");
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

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function loadSummary() {
    if (!token) return;
    setLoading(true);
    try {
      setSummary(await request<Summary>("/api/dashboard/summary"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary().catch((error) => setMessage(error.message));
  }, [token]);

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
    if (portalCompany) {
      setCompanyScopeId(portalCompany.id);
    }
    setProfileCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setStockCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setStockItemId((current) => current || summary.items[0]?.id || "");
    setBulkCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setInvoiceCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setTargetBuyerId((current) => portalCompany?.id || current || defaultCompanyId);
    setTargetSellerId((current) => current || summary.companies.find((company) => company.id !== (portalCompany?.id || defaultCompanyId))?.id || "");
    setDailyCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
    setDailyCounterpartyId((current) => current || summary.companies.find((company) => company.id !== (portalCompany?.id || defaultCompanyId))?.id || "");
    setWorkflowCompanyId((current) => portalCompany?.id || current || defaultCompanyId);
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
      await request(`/api/catalog/companies/${profileCompanyId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: profileName,
          legalName: profileLegalName,
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
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const legalName = String(form.get("legalName") ?? "").trim();
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
      event.currentTarget.reset();
      setExpandedCompanyIds((current) => [...current, created.id]);
      setMessage(`${created.name} company created.`);
      await loadSummary();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create company");
    } finally {
      setLoading(false);
    }
  }

  async function deleteCompany(company: Company) {
    setConfirmationToast({
      title: "Delete company?",
      message: `Delete ${company.name}? This is only allowed when the company has no transaction history.`,
      confirmLabel: "Delete",
      danger: true,
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
    const action = confirmationToast.onConfirm;
    setConfirmationToast(null);
    await action();
  }

  function cancelToastAction() {
    if (confirmationToast) {
      setMessage("Action cancelled.");
      setConfirmationToast(null);
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
  }

  async function createVendorInvoice(targetId: string) {
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
  }

  async function stopWorkflow(targetId: string) {
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
  }

  async function parsePurchaseInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!invoiceCompanyId || !purchaseInvoiceText.trim()) {
      setMessage("Select receiving company and paste purchase invoice lines.");
      return;
    }

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
      const invoice = invoiceDetail?.id === invoiceId ? invoiceDetail : summary?.invoices.find((item) => item.id === invoiceId);
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
  }

  const scopedCompanies = companyScopeId === "ALL"
    ? summary?.companies ?? []
    : summary?.companies.filter((company) => company.id === companyScopeId) ?? [];
  const scopedCompanyEmails = new Set(scopedCompanies.map((company) => company.email));
  const scopedStock = companyScopeId === "ALL"
    ? summary?.stock ?? []
    : summary?.stock.filter((stock) => stock.company.id === companyScopeId) ?? [];
  const scopedTargets = companyScopeId === "ALL"
    ? summary?.targets ?? []
    : summary?.targets.filter((target) => target.buyerCompany.id === companyScopeId || target.sellerCompany.id === companyScopeId) ?? [];
  const todayDate = dateInputValue();
  const todayTargets = scopedTargets.filter((target) => target.targetDate === todayDate);
  const otherWorkflowTargets = scopedTargets.filter((target) => target.targetDate !== todayDate);
  const scopedInvoices = companyScopeId === "ALL"
    ? summary?.invoices ?? []
    : summary?.invoices.filter((invoice) => invoice.buyerCompany.id === companyScopeId || invoice.sellerCompany.id === companyScopeId) ?? [];
  const scopedEmails = companyScopeId === "ALL"
    ? summary?.emails ?? []
    : summary?.emails.filter((emailLog) => scopedCompanyEmails.has(emailLog.fromEmail) || scopedCompanyEmails.has(emailLog.toEmail)) ?? [];
  const scopedAgentAuditLogs = summary?.agentAuditLogs ?? [];
  const scopedEmailIntegrations = companyScopeId === "ALL"
    ? summary?.emailIntegrations ?? []
    : summary?.emailIntegrations.filter((integration) => integration.companyId === companyScopeId) ?? [];
  const scopedStockByCompany = companyScopeId === "ALL"
    ? summary?.overview.stockByCompany ?? []
    : summary?.overview.stockByCompany.filter((row) => row.companyId === companyScopeId) ?? [];
  const scopedInvoiceTotal = scopedInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const scopedVatTotal = scopedInvoices.reduce((sum, invoice) => sum + Number(invoice.vatAmount), 0);
  const scopedTurnoverTargets = companyScopeId === "ALL"
    ? summary?.turnoverTargets ?? []
    : summary?.turnoverTargets.filter((target) => target.companyId === companyScopeId) ?? [];
  const activeCompanies = (summary?.companies ?? []).filter((company) => company.active !== false);
  const activePortalLinks: Array<{ href: string; label: string }> = [];
  for (const company of activeCompanies) {
    const haystack = `${company.name} ${company.legalName}`.toLowerCase();
    const link = haystack.includes("dealzarabia") || haystack.includes("dealz")
      ? { href: "/dealz", label: "Dealz" }
      : haystack.includes("buy2day")
        ? { href: "/buy2day", label: "Buy2day" }
        : null;
    if (link && !activePortalLinks.some((item) => item.href === link.href)) activePortalLinks.push(link);
  }
  const visibleCompanyOptions = isCompanyPortal ? scopedCompanies : activeCompanies;
  const settingsCompanyOptions = isCompanyPortal ? scopedCompanies : summary?.companies ?? [];
  const workflowSellerId = workflowDirection === "PURCHASE" ? workflowCounterpartyId : workflowCompanyId;
  const workflowProductOptions = (summary?.items ?? []).map((item) => {
    const stock = summary?.stock.find((entry) => entry.company.id === workflowSellerId && entry.item.id === item.id);
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
          {activePortalLinks.map((link) => <a href={link.href} key={link.href}>{link.label}</a>)}
          <a href="/">Admin</a>
        </div>
        <nav>
          <NavButton icon={<Building2 size={18} />} label="Overview" view="overview" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<Package size={18} />} label="Stock" view="stock" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<Play size={18} />} label="Workflow" view="workflow" activeView={activeView} onSelect={setActiveView} />
          <NavButton icon={<FileText size={18} />} label="Invoices" view="invoices" activeView={activeView} onSelect={setActiveView} />
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
                  {summary?.companies.map((company) => (
                    <option value={company.id} key={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={loadSummary} disabled={loading}><RefreshCcw size={17} /> Refresh</button>
            <button onClick={() => { localStorage.removeItem("b2b-token"); setToken(""); }}>Logout</button>
          </div>
        </header>

        {message && <div className="banner">{message}</div>}
        {confirmationToast && (
          <div className="toast-confirm">
            <div>
              <strong>{confirmationToast.title}</strong>
              <span>{confirmationToast.message}</span>
            </div>
            <div className="toast-actions">
              <button
                type="button"
                className={confirmationToast.danger ? "danger-button" : undefined}
                disabled={loading}
                onClick={confirmToastAction}
              >
                {confirmationToast.confirmLabel}
              </button>
              <button type="button" className="secondary-button" disabled={loading} onClick={cancelToastAction}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {activeView === "overview" && (
          <>
            <section className="metrics">
              <Metric label="Companies" value={companyScopeId === "ALL" ? summary?.counts.companies ?? 0 : 1} />
              <Metric label="Items" value={summary?.counts.items ?? 0} />
              <Metric label="Targets" value={scopedTargets.length} />
              <Metric label="Invoices" value={scopedInvoices.length} />
              <Metric label="Invoice Value" value={money(scopedInvoiceTotal)} />
              <Metric label="VAT 5%" value={money(scopedVatTotal)} />
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
                  {summary?.overview.recentActivity.map((activity) => (
                    <div className="row activity-row" key={`${activity.type}-${activity.id}`}>
                      <span>{activity.type}</span>
                      <span>{activity.title}</span>
                      <span>{activity.status}</span>
                      <span>{new Date(activity.date).toLocaleString()}</span>
                    </div>
                  ))}
                  {!summary?.overview.recentActivity.length && <div className="empty-state">No database activity yet.</div>}
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
              <button type="button" className={settingsTab === "email" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("email")}>
                <Mail size={17} /> Email Configuration
              </button>
              <button type="button" className={settingsTab === "log" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("log")}>
                <Mail size={17} /> Email Log
              </button>
              <button type="button" className={settingsTab === "audit" ? "secondary-button active-tab" : "secondary-button"} onClick={() => setSettingsTab("audit")}>
                <ShieldCheck size={17} /> Agent Audit
              </button>
            </div>

            {settingsTab === "company" && (
              <div className="company-card-list">
                {!isCompanyPortal && (
                  <form className="company-settings-card create-company-card" onSubmit={createCompanyCard}>
                    <div className="company-card-head">
                      <div>
                        <strong>Create Company</strong>
                        <span>Add a new company profile for portal, workflow, PO, and invoice use.</span>
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
                    <div className="company-card-fields">
                      <label>
                        Display Name
                        <input name="name" placeholder="Short portal name" />
                      </label>
                      <label>
                        Legal Company Name
                        <input name="legalName" placeholder="Legal trade license name" />
                      </label>
                      <label>
                        TRN / Tax Number
                        <input name="trn" placeholder="Optional" />
                      </label>
                      <label>
                        Email For PO / Invoice
                        <input name="email" type="email" placeholder="finance@example.com" />
                      </label>
                      <label className="company-card-address">
                        Address
                        <textarea name="location" placeholder="Company address" />
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
                    <div className="company-card-actions">
                      <button type="submit" disabled={loading}><Building2 size={17} /> Create Company</button>
                      <button type="reset" className="secondary-button" disabled={loading}>Clear</button>
                    </div>
                  </form>
                )}
                {settingsCompanyOptions.map((company) => {
                  const isExpanded = expandedCompanyIds.includes(company.id);
                  return (
                    <form className="company-settings-card" key={company.id} onSubmit={(event) => saveCompanyCard(event, company)}>
                      <div className="company-card-head">
                        <div>
                          <strong>{company.name}</strong>
                          <span>{company.legalName}</span>
                        </div>
                        <div className="company-card-summary-actions">
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
                            <label>
                              Display Name
                              <input name="name" defaultValue={company.name} />
                            </label>
                            <label>
                              Legal Company Name
                              <input name="legalName" defaultValue={company.legalName} />
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
                      <button onClick={() => testEmailIntegration(integration.companyId)} disabled={loading}>Test</button>
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
                      <span>{new Date(auditLog.createdAt).toLocaleString()}</span>
                      <span>{auditLog.step} / {auditLog.status}</span>
                      <span>{auditLog.message}</span>
                    </div>
                  ))}
                  {!scopedAgentAuditLogs.length && <div className="empty-state">No agent audit activity yet.</div>}
                </div>
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
            </section>

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
                  {summary?.items.map((item) => (
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
            <div className="table">
                  {scopedStock.map((stock) => (
                <div className="row" key={stock.id}>
                  <span>{stock.company.name}</span>
                  <span>{stock.item.sku}</span>
                  <span>{stock.quantity} {stock.item.unit}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {activeView === "workflow" && (
          <Panel title={isCompanyPortal ? `${portalDisplayName} AI Agent Workflow` : "AI Agent Workflow"}>
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
                  {summary?.companies.filter((company) => company.id !== workflowCompanyId).map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
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
                  {summary?.companies.filter((company) => company.id !== workflowCompanyId).map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
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
            <div className="table-section-title">
              <strong>Today's Targets</strong>
              <span>{todayDate}</span>
            </div>
            <div className="table">
              {todayTargets.map((target) => (
                <div className="row workflow-row" key={target.id}>
                  <span>{target.periodType === "DAILY" ? `${target.targetDate ?? target.dateFrom} ${target.hourFrom ?? ""}-${target.hourTo ?? ""}` : `${target.month} ${target.dateFrom ?? ""}-${target.dateTo ?? ""}`}</span>
                  <span>{target.buyerCompany.name} to {target.sellerCompany.name}</span>
                  <span className="target-value">{target.invoiceNumber ? "Invoice" : "PO"} {targetDocumentValue(target)}</span>
                  <span className={`status-badge ${target.status.toLowerCase()}`}>{target.status}</span>
                  <button className="secondary-button" onClick={() => downloadTargetPoPdf(target)} disabled={loading || target.status === "OPEN"}><Download size={16} /> PO PDF</button>
                  <button onClick={() => target.status === "PO_SENT" ? createVendorInvoice(target.id) : runWorkflow(target.id)} disabled={loading || !["OPEN", "PO_SENT"].includes(target.status) || (target.status === "PO_SENT" && !canCreateVendorInvoice(target))}>
                    {target.status === "OPEN" ? "Send PO" : target.status === "PO_SENT" ? (canCreateVendorInvoice(target) ? "Create Invoice" : "Waiting Invoice") : "Completed"}
                  </button>
                  <button className="secondary-button" onClick={() => stopWorkflow(target.id)} disabled={loading || target.status !== "OPEN"}><Square size={16} /> Stop</button>
                  <button className="secondary-button" onClick={() => editTarget(target)} disabled={loading || target.status !== "OPEN"}><Edit size={16} /> Edit</button>
                  <button className="danger-button" onClick={() => deleteTarget(target.id)} disabled={loading || target.status !== "OPEN"}><Trash2 size={16} /> Delete</button>
                </div>
              ))}
              {!todayTargets.length && (
                <div className="empty-state">No target created for today yet.</div>
              )}
            </div>
            <div className="table-section-title">
              <strong>Other Workflow Targets</strong>
              <span>{otherWorkflowTargets.length} total</span>
            </div>
            <div className="table">
              {otherWorkflowTargets.map((target) => (
                <div className="row workflow-row" key={target.id}>
                  <span>{target.periodType === "DAILY" ? `${target.targetDate ?? target.dateFrom} ${target.hourFrom ?? ""}-${target.hourTo ?? ""}` : `${target.month} ${target.dateFrom ?? ""}-${target.dateTo ?? ""}`}</span>
                  <span>{target.buyerCompany.name} to {target.sellerCompany.name}</span>
                  <span className="target-value">{target.invoiceNumber ? "Invoice" : "PO"} {targetDocumentValue(target)}</span>
                  <span className={`status-badge ${target.status.toLowerCase()}`}>{target.status}</span>
                  <button className="secondary-button" onClick={() => downloadTargetPoPdf(target)} disabled={loading || target.status === "OPEN"}><Download size={16} /> PO PDF</button>
                  <button onClick={() => target.status === "PO_SENT" ? createVendorInvoice(target.id) : runWorkflow(target.id)} disabled={loading || !["OPEN", "PO_SENT"].includes(target.status) || (target.status === "PO_SENT" && !canCreateVendorInvoice(target))}>
                    {target.status === "OPEN" ? "Send PO" : target.status === "PO_SENT" ? (canCreateVendorInvoice(target) ? "Create Invoice" : "Waiting Invoice") : "Completed"}
                  </button>
                  <button className="secondary-button" onClick={() => stopWorkflow(target.id)} disabled={loading || target.status !== "OPEN"}><Square size={16} /> Stop</button>
                  <button className="secondary-button" onClick={() => editTarget(target)} disabled={loading || target.status !== "OPEN"}><Edit size={16} /> Edit</button>
                  <button className="danger-button" onClick={() => deleteTarget(target.id)} disabled={loading || target.status !== "OPEN"}><Trash2 size={16} /> Delete</button>
                </div>
              ))}
              {!otherWorkflowTargets.length && (
                <div className="empty-state">No other workflow targets.</div>
              )}
            </div>
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
                      <button onClick={() => downloadInvoicePdf(invoiceDetail.id)} disabled={loading}><Download size={17} /> Download PDF</button>
                      <button onClick={() => sendInvoice(invoiceDetail.id)} disabled={loading}><Send size={17} /> Send Invoice</button>
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
                      <span>{new Date(invoiceDetail.createdAt).toLocaleDateString()}</span>
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

createRoot(document.getElementById("root")!).render(<App />);
