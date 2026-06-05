import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./env";

export type AuthRole = "ADMIN" | "COMPANY_USER" | "FINANCE" | "VIEWER";
export type AuthRequest = Request & { userId?: string; userRole?: AuthRole; userCompanyId?: string | null };

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Missing authorization token" });

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; role?: AuthRole; companyId?: string | null };
    req.userId = payload.sub;
    req.userRole = payload.role ?? "ADMIN";
    req.userCompanyId = payload.companyId ?? null;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid authorization token" });
  }
}

export function requireRoles(roles: AuthRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) return res.status(401).json({ error: "Missing authorization token" });
    if (!roles.includes(req.userRole)) return res.status(403).json({ error: "Insufficient role permission" });
    return next();
  };
}

export const requireAdmin = requireRoles(["ADMIN"]);
export const requireFinanceOrAdmin = requireRoles(["ADMIN", "FINANCE"]);
