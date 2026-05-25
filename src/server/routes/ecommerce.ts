import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { createEcommerceOrder, markEcommerceOrderDelivered } from "../services/ecommerce";

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

ecommerceRouter.patch("/orders/:id/deliver", async (req, res, next) => {
  try {
    res.json(await markEcommerceOrderDelivered(req.params.id));
  } catch (error) {
    next(error);
  }
});
