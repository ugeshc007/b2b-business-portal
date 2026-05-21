import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { getEmailConfigurationStatus, listEmailIntegrations, saveEmailConfiguration, saveSmtpImapConfiguration, testEmailIntegration, upsertEmailIntegration } from "../services/emailIntegrations";

export const emailIntegrationRouter = Router();
emailIntegrationRouter.use(requireAuth);

emailIntegrationRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await listEmailIntegrations());
  } catch (error) {
    next(error);
  }
});

emailIntegrationRouter.get("/config/status", async (_req, res, next) => {
  try {
    res.json(await getEmailConfigurationStatus());
  } catch (error) {
    next(error);
  }
});

emailIntegrationRouter.post("/config", async (req, res, next) => {
  try {
    const input = z.object({
      googleClientId: z.string().min(5),
      googleClientSecret: z.string().min(5).optional().or(z.literal("")),
      googleRedirectUri: z.string().url(),
      gmailTokenEncryptionKey: z.string().min(32).optional().or(z.literal("")),
    }).parse(req.body);
    res.status(201).json(await saveEmailConfiguration({
      googleClientId: input.googleClientId,
      googleClientSecret: input.googleClientSecret || undefined,
      googleRedirectUri: input.googleRedirectUri,
      gmailTokenEncryptionKey: input.gmailTokenEncryptionKey || undefined,
    }));
  } catch (error) {
    next(error);
  }
});

emailIntegrationRouter.post("/config/smtp-imap", async (req, res, next) => {
  try {
    const input = z.object({
      smtpHost: z.string().min(3),
      smtpPort: z.number().int().positive(),
      smtpEncryption: z.enum(["TLS", "SSL", "NONE"]),
      smtpUsername: z.string().email(),
      smtpPassword: z.string().min(8).optional().or(z.literal("")),
      imapHost: z.string().min(3),
      imapPort: z.number().int().positive(),
      imapEncryption: z.enum(["TLS", "SSL", "NONE"]),
      imapUsername: z.string().email(),
      imapPassword: z.string().min(8).optional().or(z.literal("")),
    }).parse(req.body);
    res.status(201).json(await saveSmtpImapConfiguration({
      ...input,
      smtpPassword: input.smtpPassword || undefined,
      imapPassword: input.imapPassword || undefined,
    }));
  } catch (error) {
    next(error);
  }
});

emailIntegrationRouter.post("/", async (req, res, next) => {
  try {
    const input = z.object({
      companyId: z.string(),
      email: z.string().email(),
      mode: z.enum(["SIMULATION", "DRAFT", "LIVE"]),
      status: z.enum(["DISCONNECTED", "READY_TO_CONNECT", "CONNECTED"]).optional(),
    }).parse(req.body);
    res.status(201).json(await upsertEmailIntegration(input));
  } catch (error) {
    next(error);
  }
});

emailIntegrationRouter.post("/:companyId/test", async (req, res, next) => {
  try {
    res.status(201).json(await testEmailIntegration(req.params.companyId));
  } catch (error) {
    next(error);
  }
});
