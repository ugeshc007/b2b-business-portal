import { prisma } from "../db";
import { env } from "../env";

const gmailSettingKeys = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GMAIL_TOKEN_ENCRYPTION_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_ENCRYPTION",
  "SMTP_USERNAME",
  "SMTP_PASSWORD",
  "IMAP_HOST",
  "IMAP_PORT",
  "IMAP_ENCRYPTION",
  "IMAP_USERNAME",
  "IMAP_PASSWORD",
] as const;

type GmailSettingKey = typeof gmailSettingKeys[number];
type EmailSettingName = "SMTP_HOST" | "SMTP_PORT" | "SMTP_ENCRYPTION" | "SMTP_USERNAME" | "SMTP_PASSWORD" | "IMAP_HOST" | "IMAP_PORT" | "IMAP_ENCRYPTION" | "IMAP_USERNAME" | "IMAP_PASSWORD";

function companySettingKey(companyId: string, key: EmailSettingName) {
  return `COMPANY_EMAIL:${companyId}:${key}`;
}

async function getSavedGmailSettings() {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [...gmailSettingKeys] } },
  });
  return new Map(settings.map((setting) => [setting.key as GmailSettingKey, setting.value]));
}

export async function listEmailIntegrations() {
  return prisma.emailIntegration.findMany({
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getEmailConfigurationStatus() {
  const saved = await getSavedGmailSettings();
  const clientId = env.gmail.clientId || saved.get("GOOGLE_CLIENT_ID");
  const clientSecret = env.gmail.clientSecret || saved.get("GOOGLE_CLIENT_SECRET");
  const redirectUri = env.gmail.redirectUri || saved.get("GOOGLE_REDIRECT_URI");
  const tokenEncryptionKey = env.gmail.tokenEncryptionKey || saved.get("GMAIL_TOKEN_ENCRYPTION_KEY");
  const oauthConfigured = Boolean(clientId && clientSecret && redirectUri && tokenEncryptionKey);
  const smtpConfigured = Boolean(
    saved.get("SMTP_HOST") && saved.get("SMTP_PORT") && saved.get("SMTP_USERNAME") && saved.get("SMTP_PASSWORD")
  );
  const imapConfigured = Boolean(
    saved.get("IMAP_HOST") && saved.get("IMAP_PORT") && saved.get("IMAP_USERNAME") && saved.get("IMAP_PASSWORD")
  );

  return {
    provider: "GMAIL",
    oauthConfigured,
    smtpConfigured,
    imapConfigured,
    clientIdConfigured: Boolean(clientId),
    clientSecretConfigured: Boolean(clientSecret),
    redirectUriConfigured: Boolean(redirectUri),
    tokenEncryptionConfigured: Boolean(tokenEncryptionKey),
    redirectUri: redirectUri ?? null,
    source: {
      clientId: env.gmail.clientId ? "env" : saved.has("GOOGLE_CLIENT_ID") ? "database" : "missing",
      clientSecret: env.gmail.clientSecret ? "env" : saved.has("GOOGLE_CLIENT_SECRET") ? "database" : "missing",
      redirectUri: env.gmail.redirectUri ? "env" : saved.has("GOOGLE_REDIRECT_URI") ? "database" : "missing",
      tokenEncryptionKey: env.gmail.tokenEncryptionKey ? "env" : saved.has("GMAIL_TOKEN_ENCRYPTION_KEY") ? "database" : "missing",
    },
    modeNote: oauthConfigured
      ? "Gmail OAuth environment is configured. Company accounts can be connected next."
      : smtpConfigured
        ? "SMTP is configured for Gmail sending. IMAP status controls Gmail reading."
        : "Gmail OAuth/SMTP environment is missing. Simulation and audit logging work, but live Gmail send/read is not enabled.",
  };
}

export async function saveEmailConfiguration(input: {
  googleClientId: string;
  googleClientSecret?: string;
  googleRedirectUri: string;
  gmailTokenEncryptionKey?: string;
}) {
  const updates: Array<{ key: GmailSettingKey; value: string; isSecret: boolean }> = [
    { key: "GOOGLE_CLIENT_ID", value: input.googleClientId, isSecret: false },
    { key: "GOOGLE_REDIRECT_URI", value: input.googleRedirectUri, isSecret: false },
  ];

  if (input.googleClientSecret) {
    updates.push({ key: "GOOGLE_CLIENT_SECRET", value: input.googleClientSecret, isSecret: true });
  }
  if (input.gmailTokenEncryptionKey) {
    updates.push({ key: "GMAIL_TOKEN_ENCRYPTION_KEY", value: input.gmailTokenEncryptionKey, isSecret: true });
  }

  for (const setting of updates) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, isSecret: setting.isSecret },
      create: setting,
    });
  }

  return getEmailConfigurationStatus();
}

export async function saveSmtpImapConfiguration(input: {
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: string;
  smtpUsername: string;
  smtpPassword?: string;
  imapHost: string;
  imapPort: number;
  imapEncryption: string;
  imapUsername: string;
  imapPassword?: string;
}) {
  const settings: Array<{ key: GmailSettingKey; value: string; isSecret: boolean }> = [
    { key: "SMTP_HOST", value: input.smtpHost, isSecret: false },
    { key: "SMTP_PORT", value: String(input.smtpPort), isSecret: false },
    { key: "SMTP_ENCRYPTION", value: input.smtpEncryption, isSecret: false },
    { key: "SMTP_USERNAME", value: input.smtpUsername, isSecret: false },
    { key: "IMAP_HOST", value: input.imapHost, isSecret: false },
    { key: "IMAP_PORT", value: String(input.imapPort), isSecret: false },
    { key: "IMAP_ENCRYPTION", value: input.imapEncryption, isSecret: false },
    { key: "IMAP_USERNAME", value: input.imapUsername, isSecret: false },
  ];

  if (input.smtpPassword) settings.push({ key: "SMTP_PASSWORD", value: input.smtpPassword, isSecret: true });
  if (input.imapPassword) settings.push({ key: "IMAP_PASSWORD", value: input.imapPassword, isSecret: true });

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, isSecret: setting.isSecret },
      create: setting,
    });
  }

  return getEmailConfigurationStatus();
}

export async function getSmtpSettings() {
  const saved = await getSavedGmailSettings();
  const host = saved.get("SMTP_HOST");
  const port = saved.get("SMTP_PORT");
  const username = saved.get("SMTP_USERNAME");
  const password = saved.get("SMTP_PASSWORD");
  const encryption = saved.get("SMTP_ENCRYPTION") ?? "TLS";

  if (!host || !port || !username || !password) return null;
  return {
    host,
    port: Number(port),
    secure: encryption.toUpperCase() === "SSL" || Number(port) === 465,
    username,
    password,
  };
}

export async function saveCompanySmtpImapConfiguration(input: {
  companyId: string;
  provider?: string;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: string;
  smtpUsername: string;
  smtpPassword?: string;
  imapHost: string;
  imapPort: number;
  imapEncryption: string;
  imapUsername: string;
  imapPassword?: string;
}) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company) throw new Error("Company not found");

  const settings: Array<{ key: string; value: string; isSecret: boolean }> = [
    { key: companySettingKey(input.companyId, "SMTP_HOST"), value: input.smtpHost, isSecret: false },
    { key: companySettingKey(input.companyId, "SMTP_PORT"), value: String(input.smtpPort), isSecret: false },
    { key: companySettingKey(input.companyId, "SMTP_ENCRYPTION"), value: input.smtpEncryption, isSecret: false },
    { key: companySettingKey(input.companyId, "SMTP_USERNAME"), value: input.smtpUsername, isSecret: false },
    { key: companySettingKey(input.companyId, "IMAP_HOST"), value: input.imapHost, isSecret: false },
    { key: companySettingKey(input.companyId, "IMAP_PORT"), value: String(input.imapPort), isSecret: false },
    { key: companySettingKey(input.companyId, "IMAP_ENCRYPTION"), value: input.imapEncryption, isSecret: false },
    { key: companySettingKey(input.companyId, "IMAP_USERNAME"), value: input.imapUsername, isSecret: false },
  ];

  if (input.smtpPassword) settings.push({ key: companySettingKey(input.companyId, "SMTP_PASSWORD"), value: input.smtpPassword, isSecret: true });
  if (input.imapPassword) settings.push({ key: companySettingKey(input.companyId, "IMAP_PASSWORD"), value: input.imapPassword, isSecret: true });

  for (const setting of settings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value, isSecret: setting.isSecret },
      create: setting,
    });
  }

  return upsertEmailIntegration({
    companyId: input.companyId,
    provider: input.provider,
    email: input.smtpUsername,
    mode: "LIVE",
    status: "CONNECTED",
  });
}

export async function getCompanySmtpSettings(companyId: string) {
  const keys = ["SMTP_HOST", "SMTP_PORT", "SMTP_ENCRYPTION", "SMTP_USERNAME", "SMTP_PASSWORD"] as const;
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: keys.map((key) => companySettingKey(companyId, key)) } },
  });
  const saved = new Map(settings.map((setting) => [setting.key, setting.value]));
  const host = saved.get(companySettingKey(companyId, "SMTP_HOST"));
  const port = saved.get(companySettingKey(companyId, "SMTP_PORT"));
  const username = saved.get(companySettingKey(companyId, "SMTP_USERNAME"));
  const password = saved.get(companySettingKey(companyId, "SMTP_PASSWORD"));
  const encryption = saved.get(companySettingKey(companyId, "SMTP_ENCRYPTION")) ?? "TLS";

  if (!host || !port || !username || !password) return getSmtpSettings();
  return {
    host,
    port: Number(port),
    secure: encryption.toUpperCase() === "SSL" || Number(port) === 465,
    username,
    password,
  };
}

export async function upsertEmailIntegration(input: {
  companyId: string;
  provider?: string;
  email: string;
  mode: string;
  status?: string;
}) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company) throw new Error("Company not found");

  return prisma.emailIntegration.upsert({
    where: { companyId: input.companyId },
    update: {
      provider: input.provider ?? "GMAIL",
      email: input.email,
      mode: input.mode,
      status: input.status ?? "DISCONNECTED",
    },
    create: {
      companyId: input.companyId,
      provider: input.provider ?? "GMAIL",
      email: input.email,
      mode: input.mode,
      status: input.status ?? "DISCONNECTED",
    },
    include: { company: true },
  });
}

export async function testEmailIntegration(companyId: string) {
  const integration = await prisma.emailIntegration.findUnique({
    where: { companyId },
    include: { company: true },
  });
  if (!integration) throw new Error("Email integration not found");

  const testedAt = new Date();
  await prisma.emailIntegration.update({
    where: { companyId },
    data: { lastTestAt: testedAt, status: integration.status === "CONNECTED" ? "CONNECTED" : "READY_TO_CONNECT" },
  });

  return prisma.emailLog.create({
    data: {
      direction: "OUTBOUND",
      fromEmail: integration.email,
      toEmail: integration.email,
      subject: `Gmail integration test - ${integration.company.name}`,
      body: `Test mode: ${integration.mode}. This confirms the email configuration is saved and audit logging works.`,
      status: integration.mode === "LIVE" && integration.status === "CONNECTED" ? "SENT_VIA_GMAIL" : "SIMULATED",
    },
  });
}
