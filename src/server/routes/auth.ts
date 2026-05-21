import { Router } from "express";
import { z } from "zod";
import { login } from "../auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    res.json(await login(input.email, input.password));
  } catch (error) {
    next(error);
  }
});
