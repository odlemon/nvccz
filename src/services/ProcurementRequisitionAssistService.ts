//@ts-nocheck
import { prisma } from "../utils/database";

const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 });

/**
 * What helps a requester fill in a requisition.
 *
 * SRD §7 Purchase Requisition Form: "Project/Cost Center (a searchable dropdown menu)" — the projects register Accounting
 * and Timesheets already keep. SRD §3: "as the user adds line items, the form will perform real-time lookups to suggest
 * pre-approved vendors and standard item costs" — items bought before, with their latest order price and the vendors
 * that supplied them (never a blacklisted vendor), and an inventory item's standard cost where one is kept.
 */
export class ProcurementRequisitionAssistService {
  static async projects() {
    return prisma.project.findMany({
      where: { isActive: true },
      select: { id: true, name: true, clientName: true, projectType: true, status: true },
      orderBy: { name: "asc" },
    });
  }

  /** The project id to store: null when none was chosen; an unknown or inactive project is refused. */
  static async assertProject(projectId: unknown): Promise<string | null> {
    const id = projectId == null ? "" : String(projectId).trim();
    if (!id) return null;
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true, isActive: true, name: true } });
    if (!project) throw badRequest("That project does not exist. Choose one from the list.");
    if (!project.isActive) throw badRequest(`${project.name} is no longer active, so a requisition cannot be charged to it.`);
    return project.id;
  }

  static async lineSuggestions(query: string) {
    const term = String(query || "").trim();
    if (term.length < 2) return [];
    const byItem = new Map<string, any>();
    const entry = (name: string) => {
      const key = name.trim().toLowerCase();
      if (!byItem.has(key)) {
        byItem.set(key, { itemName: name.trim(), unit: null, lastPrice: null, lastOrdered: null, lastPo: null, standardCost: null, vendors: new Map() });
      }
      return byItem.get(key);
    };

    const lines = await prisma.purchaseOrderItem.findMany({
      where: {
        itemName: { contains: term },
        purchaseOrder: { status: { notIn: ["CANCELLED", "DRAFT", "REJECTED"] } },
      },
      select: {
        itemName: true,
        unit: true,
        unitPrice: true,
        createdAt: true,
        purchaseOrder: {
          select: { poNumber: true, orderDate: true, createdAt: true, vendor: { select: { id: true, name: true, isActive: true, isBlacklisted: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    for (const l of lines) {
      const e = entry(l.itemName);
      if (!e.unit && l.unit) e.unit = l.unit;
      const when = l.purchaseOrder?.orderDate ?? l.purchaseOrder?.createdAt ?? l.createdAt;
      if (!e.lastOrdered || (when && new Date(when) > new Date(e.lastOrdered))) {
        e.lastPrice = Number(l.unitPrice);
        e.lastOrdered = when;
        e.lastPo = l.purchaseOrder?.poNumber ?? null;
      }
      const v = l.purchaseOrder?.vendor;
      if (v && v.isActive !== false && !v.isBlacklisted) {
        const cur = e.vendors.get(v.id) ?? { id: v.id, name: v.name, orders: 0, lastPrice: null, source: "orders" };
        cur.orders += 1;
        if (cur.lastPrice == null) cur.lastPrice = Number(l.unitPrice);
        e.vendors.set(v.id, cur);
      }
    }

    const stock = await prisma.inventoryItem.findMany({
      where: { isActive: true, itemName: { contains: term } },
      select: { itemName: true, unitOfMeasure: true, costOfPurchase: true, supplier: { select: { id: true, name: true, isActive: true, isBlacklisted: true } } },
      take: 30,
    });
    for (const s of stock) {
      const e = entry(s.itemName);
      e.standardCost = Number(s.costOfPurchase);
      if (!e.unit && s.unitOfMeasure) e.unit = s.unitOfMeasure;
      const v = s.supplier;
      if (v && v.isActive !== false && !v.isBlacklisted && !e.vendors.has(v.id)) {
        e.vendors.set(v.id, { id: v.id, name: v.name, orders: 0, lastPrice: null, source: "inventory" });
      }
    }

    return [...byItem.values()]
      .map((e) => ({
        itemName: e.itemName,
        unit: e.unit,
        lastPrice: e.lastPrice,
        lastOrdered: e.lastOrdered,
        lastPo: e.lastPo,
        standardCost: e.standardCost,
        vendors: [...e.vendors.values()].sort((a, b) => b.orders - a.orders).slice(0, 3),
      }))
      .sort((a, b) => String(b.lastOrdered ?? "").localeCompare(String(a.lastOrdered ?? "")))
      .slice(0, 8);
  }
}
