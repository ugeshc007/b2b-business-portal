import dotenv from "dotenv";
import fs from "node:fs";
import { z } from "zod";

const envPath = process.env.NODE_ENV === "production" && fs.existsSync(".env.production")
  ? ".env.production"
  : ".env";

dotenv.config({ path: envPath });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters in production").default("dev-secret-change-me-dev-only-value"),
  API_PORT: z.coerce.number().int().positive().default(4321),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:5321"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  GMAIL_TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === "production" && parsed.JWT_SECRET.includes("dev-secret")) {
  throw new Error("Production JWT_SECRET must be changed before startup");
}

export const env = {
  nodeEnv: parsed.NODE_ENV,
  databaseUrl: parsed.DATABASE_URL,
  jwtSecret: parsed.JWT_SECRET,
  apiPort: parsed.API_PORT,
  appOrigin: parsed.APP_ORIGIN,
  trustProxy: parsed.TRUST_PROXY === "true",
  gmail: {
    clientId: parsed.GOOGLE_CLIENT_ID,
    clientSecret: parsed.GOOGLE_CLIENT_SECRET,
    redirectUri: parsed.GOOGLE_REDIRECT_URI,
    tokenEncryptionKey: parsed.GMAIL_TOKEN_ENCRYPTION_KEY,
    oauthConfigured: Boolean(parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET && parsed.GOOGLE_REDIRECT_URI && parsed.GMAIL_TOKEN_ENCRYPTION_KEY),
  },
  isProduction: parsed.NODE_ENV === "production",
};
