import { PrismaClient } from "@prisma/client";
import { createUser } from "../src/server/auth";

const prisma = new PrismaClient();

async function upsertCompanyByName(input: {
  name: string;
  legalName: string;
  trn: string;
  location: string;
  email: string;
}) {
  const existing = await prisma.company.findFirst({ where: { name: input.name } });
  if (existing) {
    return prisma.company.update({
      where: { id: existing.id },
      data: {
        legalName: input.legalName,
        trn: input.trn,
        location: input.location,
        email: input.email,
        role: "BOTH",
      },
    });
  }

  return prisma.company.create({
    data: {
      name: input.name,
      legalName: input.legalName,
      trn: input.trn,
      location: input.location,
      email: input.email,
      role: "BOTH",
    },
  });
}

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) await createUser(email, password, "Admin");

  const companyA = await upsertCompanyByName({
    name: "Dealzarabia",
    legalName: "Dealzarabia Trading LLC",
    trn: "100000000000001",
    location: "Dubai, UAE",
    email: "dealzinvoice@gmail.com",
  });

  await prisma.company.update({
    where: { id: companyA.id },
    data: {
      legalName: "Dealzarabia Electronics Trading L.L.C -AUH Branch",
      trn: null,
      location: "Abu Dhabi Industrial City Company for Chemicals, Building ~0/1, AKIA, Abu Dhabi Industrial City, Abu Dhabi",
      email: "dealzinvoice@gmail.com",
      bankName: "ADCB",
      bankBeneficiaryName: "DEALZ ARABIA ELECTRONICS TRADING LLC.",
      bankAccountNumber: "14213322920001",
      bankIban: "AE470030014213322920001",
      bankCid: "14213322",
      bankBranch: "AL RIGGAH ROAD , AL RIGGAH ROAD",
    },
  });

  const companyB = await upsertCompanyByName({
    name: "Buy2day",
    legalName: "Buy2day Distribution LLC",
    trn: "100000000000002",
    location: "Sharjah, UAE",
    email: "b2dfinance01@gmail.com",
  });

  const item = await prisma.item.upsert({
    where: { sku: "SAMPLE-001" },
    update: {},
    create: {
      sku: "SAMPLE-001",
      name: "Sample Trading Item",
      unit: "pcs",
      expectedPrice: "100.00",
      minPrice: "90.00",
      maxPrice: "120.00",
      vatRate: "0.05",
    },
  });

  const giftCardProducts = [
    { sku: "PSN-UAE-50", name: "PlayStation Store Gift Card UAE AED 50", price: "50.00", max: "55.00", stock: 100 },
    { sku: "PSN-UAE-100", name: "PlayStation Store Gift Card UAE AED 100", price: "100.00", max: "110.00", stock: 100 },
    { sku: "PSN-UAE-250", name: "PlayStation Store Gift Card UAE AED 250", price: "250.00", max: "270.00", stock: 60 },
    { sku: "XBOX-UAE-50", name: "Xbox Gift Card UAE AED 50", price: "50.00", max: "55.00", stock: 80 },
    { sku: "XBOX-UAE-100", name: "Xbox Gift Card UAE AED 100", price: "100.00", max: "110.00", stock: 80 },
    { sku: "STEAM-USD-10", name: "Steam Wallet Gift Card USD 10", price: "37.00", max: "42.00", stock: 120 },
    { sku: "STEAM-USD-20", name: "Steam Wallet Gift Card USD 20", price: "74.00", max: "82.00", stock: 120 },
    { sku: "STEAM-USD-50", name: "Steam Wallet Gift Card USD 50", price: "184.00", max: "200.00", stock: 70 },
    { sku: "NINTENDO-USD-10", name: "Nintendo eShop Gift Card USD 10", price: "37.00", max: "42.00", stock: 80 },
    { sku: "NINTENDO-USD-20", name: "Nintendo eShop Gift Card USD 20", price: "74.00", max: "82.00", stock: 80 },
    { sku: "ROBLOX-USD-10", name: "Roblox Gift Card USD 10", price: "37.00", max: "42.00", stock: 150 },
    { sku: "ROBLOX-USD-25", name: "Roblox Gift Card USD 25", price: "92.00", max: "105.00", stock: 120 },
    { sku: "PUBG-UC-60", name: "PUBG Mobile UC 60", price: "4.00", max: "5.00", stock: 500 },
    { sku: "PUBG-UC-325", name: "PUBG Mobile UC 325", price: "20.00", max: "24.00", stock: 350 },
    { sku: "PUBG-UC-660", name: "PUBG Mobile UC 660", price: "40.00", max: "48.00", stock: 250 },
    { sku: "FREEFIRE-100D", name: "Free Fire Diamonds 100", price: "4.00", max: "5.00", stock: 500 },
    { sku: "FREEFIRE-310D", name: "Free Fire Diamonds 310", price: "12.00", max: "15.00", stock: 350 },
    { sku: "GOOGLEPLAY-UAE-50", name: "Google Play Gift Card UAE AED 50", price: "50.00", max: "55.00", stock: 120 },
    { sku: "GOOGLEPLAY-UAE-100", name: "Google Play Gift Card UAE AED 100", price: "100.00", max: "110.00", stock: 100 },
    { sku: "APPLE-UAE-50", name: "Apple Gift Card UAE AED 50", price: "50.00", max: "55.00", stock: 120 },
    { sku: "APPLE-UAE-100", name: "Apple Gift Card UAE AED 100", price: "100.00", max: "110.00", stock: 100 },
    { sku: "AMAZON-UAE-50", name: "Amazon.ae Gift Card AED 50", price: "50.00", max: "55.00", stock: 100 },
    { sku: "AMAZON-UAE-100", name: "Amazon.ae Gift Card AED 100", price: "100.00", max: "110.00", stock: 100 },
    { sku: "NETFLIX-UAE-50", name: "Netflix Gift Card UAE AED 50", price: "50.00", max: "55.00", stock: 80 },
    { sku: "SPOTIFY-UAE-1M", name: "Spotify Premium UAE 1 Month", price: "20.00", max: "25.00", stock: 150 },
    { sku: "RAZERGOLD-USD-10", name: "Razer Gold Gift Card USD 10", price: "37.00", max: "42.00", stock: 100 },
    { sku: "RAZERGOLD-USD-20", name: "Razer Gold Gift Card USD 20", price: "74.00", max: "82.00", stock: 100 },
  ];

  for (const product of giftCardProducts) {
    const giftCardItem = await prisma.item.upsert({
      where: { sku: product.sku },
      update: {
        name: product.name,
        unit: "code",
        expectedPrice: product.price,
        maxPrice: product.max,
        vatRate: "0.05",
        active: true,
      },
      create: {
        sku: product.sku,
        name: product.name,
        unit: "code",
        expectedPrice: product.price,
        minPrice: product.price,
        maxPrice: product.max,
        vatRate: "0.05",
      },
    });

    await prisma.stock.upsert({
      where: { companyId_itemId: { companyId: companyB.id, itemId: giftCardItem.id } },
      update: { quantity: product.stock },
      create: { companyId: companyB.id, itemId: giftCardItem.id, quantity: product.stock },
    });

    await prisma.stock.upsert({
      where: { companyId_itemId: { companyId: companyA.id, itemId: giftCardItem.id } },
      update: { quantity: Math.floor(product.stock * 0.75) },
      create: { companyId: companyA.id, itemId: giftCardItem.id, quantity: Math.floor(product.stock * 0.75) },
    });
  }

  await prisma.stock.upsert({
    where: { companyId_itemId: { companyId: companyB.id, itemId: item.id } },
    update: { quantity: 500 },
    create: { companyId: companyB.id, itemId: item.id, quantity: 500 },
  });

  await prisma.stock.upsert({
    where: { companyId_itemId: { companyId: companyA.id, itemId: item.id } },
    update: {},
    create: { companyId: companyA.id, itemId: item.id, quantity: 0 },
  });

  await prisma.emailIntegration.upsert({
    where: { companyId: companyA.id },
    update: {
      email: companyA.email,
      provider: "GMAIL",
      mode: "SIMULATION",
      status: "READY_TO_CONNECT",
    },
    create: {
      companyId: companyA.id,
      email: companyA.email,
      provider: "GMAIL",
      mode: "SIMULATION",
      status: "READY_TO_CONNECT",
    },
  });

  await prisma.emailIntegration.upsert({
    where: { companyId: companyB.id },
    update: {
      email: companyB.email,
      provider: "GMAIL",
      mode: "SIMULATION",
      status: "READY_TO_CONNECT",
    },
    create: {
      companyId: companyB.id,
      email: companyB.email,
      provider: "GMAIL",
      mode: "SIMULATION",
      status: "READY_TO_CONNECT",
    },
  });

  const currentMonth = new Date().toISOString().slice(0, 7);
  await prisma.turnoverTarget.upsert({
    where: { companyId_type_month: { companyId: companyA.id, type: "PURCHASE", month: currentMonth } },
    update: {
      amount: "2000000.00",
      notes: "Dealzarabia monthly purchase turnover target",
    },
    create: {
      companyId: companyA.id,
      type: "PURCHASE",
      month: currentMonth,
      amount: "2000000.00",
      notes: "Dealzarabia monthly purchase turnover target",
    },
  });

  await prisma.turnoverTarget.upsert({
    where: { companyId_type_month: { companyId: companyB.id, type: "PURCHASE", month: currentMonth } },
    update: {
      amount: "2000000.00",
      notes: "Buy2day monthly purchase turnover target",
    },
    create: {
      companyId: companyB.id,
      type: "PURCHASE",
      month: currentMonth,
      amount: "2000000.00",
      notes: "Buy2day monthly purchase turnover target",
    },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
