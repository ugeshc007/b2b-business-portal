import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { createEcommerceOrder, updateEcommerceOrderStatus } from "../services/ecommerce";

export const ecommerceRouter = Router();
ecommerceRouter.use(requireAuth);

ecommerceRouter.post("/orders", async (req, res, next) => {
  try {
    const input = z.object({
      buyerCompanyId: z.string(),
      sellerCompanyId: z.string(),
      itemId: z.string(),
      quantity: z.number().int().positive().default(1),
    }).parse(req.body);
    res.status(201).json(await createEcommerceOrder(input));
  } catch (error) {
    next(error);
  }
});

ecommerceRouter.patch("/orders/:id/status", async (req, res, next) => {
  try {
    const input = z.object({
      status: z.enum(["PREPARING", "SHIPPED", "DELIVERED"]),
    }).parse(req.body);
    res.json(await updateEcommerceOrderStatus(req.params.id, input.status));
  } catch (error) {
    next(error);
  }
});
