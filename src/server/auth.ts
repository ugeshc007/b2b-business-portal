import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "./db";
import { env } from "./env";

export async function createUser(email: string, password: string, name: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({ data: { email, passwordHash, name } });
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password");

  const token = jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, { expiresIn: "8h" });
  return { token, user: { id: user.id, email: user.email, name: user.name } };
}
