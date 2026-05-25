import cors from "cors";
import compression from "compression";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { ZodError } from "zod";
import { authRouter } from "./routes/auth";
import { catalogRouter } from "./routes/catalog";
import { workflowRouter } from "./routes/workflow";
import { dashboardRouter } from "./routes/dashboard";
import { invoiceRouter } from "./routes/invoices";
import { emailIntegrationRouter } from "./routes/emailIntegrations";
import { ecommerceRouter } from "./routes/ecommerce";
import { prisma } from "./db";
import { env } from "./env";

export function createApp() {
  const app = express();
  if (env.trustProxy) app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: false,
  }));
  app.use(compression());
  app.use(cors({
    origin: env.isProduction ? env.appOrigin : true,
    credentials: false,
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", rateLimit({
    windowMs: 60_000,
    limit: env.isProduction ? 120 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/ready", async (_req, res, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, database: "connected" });
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/auth", authRouter);
  app.use("/api/catalog", catalogRouter);
  app.use("/api/workflow", workflowRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/invoices", invoiceRouter);
  app.use("/api/email-integrations", emailIntegrationRouter);
  app.use("/api/ecommerce", ecommerceRouter);

  const distPath = path.resolve(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.flatten() });
    }

    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = message.includes("not found") ? 404 : 400;
    return res.status(status).json({ error: message });
  });

  return app;
}
