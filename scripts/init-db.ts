import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => {
  exec(sql: string): void;
  prepare(sql: string): { all(): unknown[] };
  close(): void;
}; };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.resolve(__dirname, "../prisma/dev.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

if (process.argv.includes("--reset") && fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN',
  companyId TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Company (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  legalName TEXT NOT NULL,
  trn TEXT,
  role TEXT NOT NULL DEFAULT 'BOTH',
  managedByCompanyId TEXT,
  location TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  vatEnabled BOOLEAN NOT NULL DEFAULT true,
  logoPath TEXT,
  bankName TEXT,
  bankBeneficiaryName TEXT,
  bankAccountNumber TEXT,
  bankIban TEXT,
  bankCid TEXT,
  bankBranch TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (managedByCompanyId) REFERENCES Company(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Item (
  id TEXT PRIMARY KEY NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  expectedPrice DECIMAL NOT NULL,
  minPrice DECIMAL,
  maxPrice DECIMAL,
  currency TEXT,
  denomination DECIMAL,
  conversionRate DECIMAL,
  denominationAed DECIMAL,
  buyingPrice DECIMAL,
  profit DECIMAL,
  marginPercent DECIMAL,
  vatRate DECIMAL NOT NULL DEFAULT 0.05,
  active BOOLEAN NOT NULL DEFAULT true,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Stock (
  id TEXT PRIMARY KEY NOT NULL,
  companyId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updatedAt DATETIME NOT NULL,
  FOREIGN KEY (companyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (itemId) REFERENCES Item(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS Stock_companyId_itemId_key ON Stock(companyId, itemId);

CREATE TABLE IF NOT EXISTS StockMovement (
  id TEXT PRIMARY KEY NOT NULL,
  companyId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitCost DECIMAL,
  unitPrice DECIMAL,
  purchaseValue DECIMAL NOT NULL DEFAULT 0,
  salesValue DECIMAL NOT NULL DEFAULT 0,
  source TEXT,
  reference TEXT,
  notes TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (companyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (itemId) REFERENCES Item(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS StockMovement_companyId_itemId_idx ON StockMovement(companyId, itemId);
CREATE INDEX IF NOT EXISTS StockMovement_source_reference_idx ON StockMovement(source, reference);

CREATE TABLE IF NOT EXISTS EcommerceOrder (
  id TEXT PRIMARY KEY NOT NULL,
  buyerCompanyId TEXT NOT NULL,
  sellerCompanyId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitPrice DECIMAL NOT NULL,
  vatRate DECIMAL NOT NULL,
  subtotal DECIMAL NOT NULL,
  vatAmount DECIMAL NOT NULL,
  total DECIMAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_DELIVERY',
  source TEXT NOT NULL DEFAULT 'AGENT_BUY',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deliveredAt DATETIME,
  FOREIGN KEY (buyerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (sellerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (itemId) REFERENCES Item(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS MonthlyTarget (
  id TEXT PRIMARY KEY NOT NULL,
  buyerCompanyId TEXT NOT NULL,
  sellerCompanyId TEXT NOT NULL,
  month TEXT NOT NULL,
  targetDate TEXT,
  periodType TEXT NOT NULL DEFAULT 'MONTHLY',
  dateFrom TEXT,
  dateTo TEXT,
  hourFrom TEXT,
  hourTo TEXT,
  direction TEXT,
  productMode TEXT NOT NULL DEFAULT 'RANDOM',
  amountVolume DECIMAL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  notes TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (sellerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS MonthlyTargetLine (
  id TEXT PRIMARY KEY NOT NULL,
  targetId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  maxPrice DECIMAL,
  FOREIGN KEY (targetId) REFERENCES MonthlyTarget(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (itemId) REFERENCES Item(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Requirement (
  id TEXT PRIMARY KEY NOT NULL,
  targetId TEXT NOT NULL,
  buyerCompanyId TEXT NOT NULL,
  sellerCompanyId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sentAt DATETIME,
  FOREIGN KEY (targetId) REFERENCES MonthlyTarget(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (buyerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (sellerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS RequirementLine (
  id TEXT PRIMARY KEY NOT NULL,
  requirementId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  FOREIGN KEY (requirementId) REFERENCES Requirement(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (itemId) REFERENCES Item(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Quotation (
  id TEXT PRIMARY KEY NOT NULL,
  requirementId TEXT NOT NULL,
  buyerCompanyId TEXT NOT NULL,
  sellerCompanyId TEXT NOT NULL,
  quoteNumber TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'SENT',
  subtotal DECIMAL NOT NULL,
  vatAmount DECIMAL NOT NULL,
  total DECIMAL NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requirementId) REFERENCES Requirement(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (buyerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (sellerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS QuotationLine (
  id TEXT PRIMARY KEY NOT NULL,
  quotationId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitPrice DECIMAL NOT NULL,
  vatRate DECIMAL NOT NULL,
  lineTotal DECIMAL NOT NULL,
  FOREIGN KEY (quotationId) REFERENCES Quotation(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (itemId) REFERENCES Item(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS PurchaseOrder (
  id TEXT PRIMARY KEY NOT NULL,
  quotationId TEXT NOT NULL UNIQUE,
  buyerCompanyId TEXT NOT NULL,
  sellerCompanyId TEXT NOT NULL,
  poNumber TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  subtotal DECIMAL NOT NULL,
  vatAmount DECIMAL NOT NULL,
  total DECIMAL NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quotationId) REFERENCES Quotation(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (buyerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (sellerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS PurchaseOrderLine (
  id TEXT PRIMARY KEY NOT NULL,
  purchaseOrderId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitPrice DECIMAL NOT NULL,
  vatRate DECIMAL NOT NULL,
  lineTotal DECIMAL NOT NULL,
  FOREIGN KEY (purchaseOrderId) REFERENCES PurchaseOrder(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (itemId) REFERENCES Item(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Invoice (
  id TEXT PRIMARY KEY NOT NULL,
  purchaseOrderId TEXT NOT NULL UNIQUE,
  buyerCompanyId TEXT NOT NULL,
  sellerCompanyId TEXT NOT NULL,
  invoiceNumber TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ISSUED',
  subtotal DECIMAL NOT NULL,
  vatAmount DECIMAL NOT NULL,
  total DECIMAL NOT NULL,
  pdfPath TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (purchaseOrderId) REFERENCES PurchaseOrder(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (buyerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (sellerCompanyId) REFERENCES Company(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS InvoiceLine (
  id TEXT PRIMARY KEY NOT NULL,
  invoiceId TEXT NOT NULL,
  itemId TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitPrice DECIMAL NOT NULL,
  vatRate DECIMAL NOT NULL,
  lineTotal DECIMAL NOT NULL,
  FOREIGN KEY (invoiceId) REFERENCES Invoice(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (itemId) REFERENCES Item(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS EmailLog (
  id TEXT PRIMARY KEY NOT NULL,
  requirementId TEXT,
  direction TEXT NOT NULL,
  fromEmail TEXT NOT NULL,
  toEmail TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFTED',
  messageId TEXT,
  attachmentPath TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requirementId) REFERENCES Requirement(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS EmailIntegration (
  id TEXT PRIMARY KEY NOT NULL,
  companyId TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'GMAIL',
  email TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'SIMULATION',
  status TEXT NOT NULL DEFAULT 'DISCONNECTED',
  lastTestAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL,
  FOREIGN KEY (companyId) REFERENCES Company(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS AgentDecision (
  id TEXT PRIMARY KEY NOT NULL,
  quotationId TEXT,
  agentName TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quotationId) REFERENCES Quotation(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS AgentAuditLog (
  id TEXT PRIMARY KEY NOT NULL,
  targetId TEXT,
  step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OK',
  message TEXT NOT NULL,
  metadata TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS AppSetting (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  isSecret BOOLEAN NOT NULL DEFAULT false,
  updatedAt DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS TurnoverTarget (
  id TEXT PRIMARY KEY NOT NULL,
  companyId TEXT NOT NULL,
  type TEXT NOT NULL,
  month TEXT NOT NULL,
  amount DECIMAL NOT NULL,
  notes TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL,
  FOREIGN KEY (companyId) REFERENCES Company(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS TurnoverTarget_companyId_type_month_key ON TurnoverTarget(companyId, type, month);
`);

const invoiceColumns = db.prepare("PRAGMA table_info(Invoice)").all() as Array<{ name: string }>;
if (!invoiceColumns.some((column) => column.name === "pdfPath")) {
  db.exec("ALTER TABLE Invoice ADD COLUMN pdfPath TEXT;");
}

const itemColumns = db.prepare("PRAGMA table_info(Item)").all() as Array<{ name: string }>;
const itemOptionalColumns: Array<{ name: string; type: string }> = [
  { name: "currency", type: "TEXT" },
  { name: "denomination", type: "DECIMAL" },
  { name: "conversionRate", type: "DECIMAL" },
  { name: "denominationAed", type: "DECIMAL" },
  { name: "buyingPrice", type: "DECIMAL" },
  { name: "profit", type: "DECIMAL" },
  { name: "marginPercent", type: "DECIMAL" },
];
for (const column of itemOptionalColumns) {
  if (!itemColumns.some((existing) => existing.name === column.name)) {
    db.exec(`ALTER TABLE Item ADD COLUMN ${column.name} ${column.type};`);
  }
}

const companyColumns = db.prepare("PRAGMA table_info(Company)").all() as Array<{ name: string }>;
if (!companyColumns.some((column) => column.name === "role")) {
  db.exec("ALTER TABLE Company ADD COLUMN role TEXT NOT NULL DEFAULT 'BOTH';");
}
if (!companyColumns.some((column) => column.name === "managedByCompanyId")) {
  db.exec("ALTER TABLE Company ADD COLUMN managedByCompanyId TEXT;");
}
db.exec("CREATE INDEX IF NOT EXISTS Company_managedByCompanyId_idx ON Company(managedByCompanyId);");
if (!companyColumns.some((column) => column.name === "active")) {
  db.exec("ALTER TABLE Company ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;");
}
if (!companyColumns.some((column) => column.name === "vatEnabled")) {
  db.exec("ALTER TABLE Company ADD COLUMN vatEnabled BOOLEAN NOT NULL DEFAULT true;");
}
const companyOptionalTextColumns = [
  "logoPath",
  "bankName",
  "bankBeneficiaryName",
  "bankAccountNumber",
  "bankIban",
  "bankCid",
  "bankBranch",
];
for (const columnName of companyOptionalTextColumns) {
  if (!companyColumns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE Company ADD COLUMN ${columnName} TEXT;`);
  }
}

const emailLogColumns = db.prepare("PRAGMA table_info(EmailLog)").all() as Array<{ name: string }>;
if (!emailLogColumns.some((column) => column.name === "attachmentPath")) {
  db.exec("ALTER TABLE EmailLog ADD COLUMN attachmentPath TEXT;");
}

const monthlyTargetColumns = db.prepare("PRAGMA table_info(MonthlyTarget)").all() as Array<{ name: string }>;
if (!monthlyTargetColumns.some((column) => column.name === "targetDate")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN targetDate TEXT;");
}
if (!monthlyTargetColumns.some((column) => column.name === "periodType")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN periodType TEXT NOT NULL DEFAULT 'MONTHLY';");
}
if (!monthlyTargetColumns.some((column) => column.name === "dateFrom")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN dateFrom TEXT;");
}
if (!monthlyTargetColumns.some((column) => column.name === "dateTo")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN dateTo TEXT;");
}
if (!monthlyTargetColumns.some((column) => column.name === "hourFrom")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN hourFrom TEXT;");
}
if (!monthlyTargetColumns.some((column) => column.name === "hourTo")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN hourTo TEXT;");
}
if (!monthlyTargetColumns.some((column) => column.name === "direction")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN direction TEXT;");
}
if (!monthlyTargetColumns.some((column) => column.name === "productMode")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN productMode TEXT NOT NULL DEFAULT 'RANDOM';");
}
if (!monthlyTargetColumns.some((column) => column.name === "amountVolume")) {
  db.exec("ALTER TABLE MonthlyTarget ADD COLUMN amountVolume DECIMAL;");
}

const userColumns = db.prepare("PRAGMA table_info(User)").all() as Array<{ name: string }>;
if (!userColumns.some((column) => column.name === "role")) {
  db.exec("ALTER TABLE User ADD COLUMN role TEXT NOT NULL DEFAULT 'ADMIN';");
}
if (!userColumns.some((column) => column.name === "companyId")) {
  db.exec("ALTER TABLE User ADD COLUMN companyId TEXT;");
}

db.close();
console.log(`Database ready: ${dbPath}`);
