import type express from "express";
import fs from "node:fs";
import path from "node:path";
import { appDate, appDateTime } from "../../shared/timezone";

type LogLevel = "INFO" | "WARN" | "ERROR";

const retentionDays = Number(process.env.LOG_RETENTION_DAYS || 1);
const logsDir = path.resolve(process.cwd(), "storage", "logs");
const redactedKeys = [
  "authorization",
  "token",
  "password",
  "secret",
  "clientsecret",
  "gmailtokenencryptionkey",
  "smtppassword",
  "imappassword",
];

function dayStamp(date = new Date()) {
  return appDate(date);
}

function logPath(date = new Date()) {
  return path.join(logsDir, `app-${dayStamp(date)}.log`);
}

function redact(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (typeof value === "string") return value.length > 600 ? `${value.slice(0, 600)}...` : value;
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    output[key] = redactedKeys.some((redactedKey) => normalized.includes(redactedKey))
      ? "[REDACTED]"
      : redact(entryValue);
  }
  return output;
}

function cleanupOldLogs() {
  fs.mkdirSync(logsDir, { recursive: true });
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(logsDir)) {
    if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
    const filePath = path.join(logsDir, file);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath);
  }
}

function writeLog(level: LogLevel, event: string, data: Record<string, unknown>) {
  try {
    cleanupOldLogs();
    const payload = {
      timestamp: appDateTime(),
      utcTimestamp: new Date().toISOString(),
      level,
      event,
      ...data,
    };
    fs.appendFileSync(logPath(), `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.error("Could not write application log", error);
  }
}

export function logSystemEvent(level: LogLevel, event: string, data: Record<string, unknown> = {}) {
  writeLog(level, event, data);
}

function requestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function requestIp(req: express.Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") return forwardedFor.split(",")[0]?.trim();
  return req.ip || req.socket.remoteAddress;
}

export function requestResponseLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  if (req.path === "/api/maintenance/flush-transactional-data") return next();
  const id = requestId();
  const startedAt = Date.now();
  res.setHeader("X-Request-Id", id);

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    const level: LogLevel = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    writeLog(level, "http_request", {
      requestId: id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ip: requestIp(req),
      userAgent: req.headers["user-agent"],
      headers: redact({
        authorization: req.headers.authorization,
        contentType: req.headers["content-type"],
      }),
      body: req.method === "GET" ? undefined : redact(req.body),
    });
  });

  next();
}

export function logError(error: unknown, req?: express.Request, statusCode?: number) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  writeLog("ERROR", "application_error", {
    method: req?.method,
    path: req?.originalUrl,
    statusCode,
    ip: req ? requestIp(req) : undefined,
    message,
    stack,
  });
}

export function getRecentLogs(options: { level?: string; limit?: number } = {}) {
  fs.mkdirSync(logsDir, { recursive: true });
  cleanupOldLogs();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const files = fs.readdirSync(logsDir)
    .filter((file) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(file))
    .sort()
    .reverse()
    .slice(0, 3);
  const rows: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(logsDir, file), "utf8").split(/\r?\n/).filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (options.level && String(parsed.level) !== options.level) continue;
        rows.push(parsed);
      } catch {
        rows.push({ timestamp: null, level: "ERROR", event: "invalid_log_line", raw: line });
      }
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

export function getRecentRawLogs(options: { limit?: number } = {}) {
  fs.mkdirSync(logsDir, { recursive: true });
  cleanupOldLogs();
  const limit = Math.min(Math.max(options.limit ?? 150, 1), 500);
  const file = path.basename(logPath());
  const filePath = path.join(logsDir, file);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit);
}

export function getLogStatus() {
  fs.mkdirSync(logsDir, { recursive: true });
  cleanupOldLogs();
  const files = fs.readdirSync(logsDir).filter((file) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(file));
  const totalBytes = files.reduce((sum, file) => sum + fs.statSync(path.join(logsDir, file)).size, 0);
  return { logsDir, retentionDays, files: files.length, totalBytes };
}

export function getLogDownload() {
  fs.mkdirSync(logsDir, { recursive: true });
  cleanupOldLogs();
  const files = fs.readdirSync(logsDir)
    .filter((file) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(file))
    .sort();
  const body = files.map((file) => {
    const filePath = path.join(logsDir, file);
    return [`# ${file}`, fs.readFileSync(filePath, "utf8")].join("\n");
  }).join("\n");
  return {
    filename: `b2b-logs-${dayStamp()}.log`,
    body,
  };
}

export function clearApplicationLogs() {
  fs.mkdirSync(logsDir, { recursive: true });
  let deleted = 0;
  for (const file of fs.readdirSync(logsDir)) {
    if (!/^app-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
    fs.unlinkSync(path.join(logsDir, file));
    deleted += 1;
  }
  return deleted;
}
