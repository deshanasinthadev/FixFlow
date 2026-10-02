import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const tables: Record<string, any> = {
  users: s.users,
  customers: s.customers,
  devices: s.devices,
  repairs: s.repairs,
  repairParts: s.repairParts,
  repairActivity: s.repairActivity,
  quotations: s.quotations,
  products: s.products,
  stockMovements: s.stockMovements,
  suppliers: s.suppliers,
  purchases: s.purchases,
  invoices: s.invoices,
  payments: s.payments,
  expenses: s.expenses,
  warranties: s.warranties,
  warrantyClaims: s.warrantyClaims,
  returns: s.returns,
  messages: s.messages,
  notifications: s.notifications,
  auditLogs: s.auditLogs,
};

export async function GET(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get("entity");
  if (!entity || !tables[entity]) return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  try {
    const rows = await db.select().from(tables[entity]).orderBy(desc(tables[entity].id)).limit(500);
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entity, record } = body as { entity: string; record: Record<string, unknown> };
  if (!entity || !tables[entity]) return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
  try {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record ?? {})) {
      if (k === "id") continue;
      if (v === "") continue;
      clean[k] = v;
    }
    const rows = (await db.insert(tables[entity]).values(clean).returning()) as unknown as Record<string, unknown>[];
    // side effects
    try {
      if (entity === "stockMovements" && clean.productId && clean.qty) {
        const pid = Number(clean.productId);
        const q = Number(clean.qty);
        const pr = await db.select().from(s.products).where(eq(s.products.id, pid));
        if (pr.length) await db.update(s.products).set({ stock: (pr[0].stock ?? 0) + q }).where(eq(s.products.id, pid));
      }
      if (entity === "repairParts" && clean.productId && clean.qty) {
        const pid = Number(clean.productId);
        const q = Number(clean.qty);
        const pr = await db.select().from(s.products).where(eq(s.products.id, pid));
        if (pr.length) await db.update(s.products).set({ stock: Math.max(0, (pr[0].stock ?? 0) - q) }).where(eq(s.products.id, pid));
        await db.insert(s.stockMovements).values({ productId: pid, productName: String(clean.productName ?? "Part"), type: "Repair Usage", qty: -q, reference: String(clean.repairId ?? "repair"), user: "Technician" });
      }
    } catch { /* ignore */ }
    return NextResponse.json({ data: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { entity, id, record } = body as { entity: string; id: number; record: Record<string, unknown> };
  if (!entity || !tables[entity] || !id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record ?? {})) {
      if (k === "id") continue;
      clean[k] = v;
    }
    const rows = (await db.update(tables[entity]).set(clean).where(eq(tables[entity].id, id)).returning()) as unknown as Record<string, unknown>[];
    return NextResponse.json({ data: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get("entity");
  const id = req.nextUrl.searchParams.get("id");
  if (!entity || !tables[entity] || !id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    await db.delete(tables[entity]).where(eq(tables[entity].id, Number(id)));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
