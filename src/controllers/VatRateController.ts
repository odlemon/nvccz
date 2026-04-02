// @ts-nocheck
import { Response } from "express";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import VATService from "../services/VATService";

export class VatRateController {
  static async list(req: AuthRequest, res: Response) {
    const rows = await prisma.vatRate.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
    });
    return res.json({ success: true, data: rows });
  }

  static async getActive(req: AuthRequest, res: Response) {
    const row = await prisma.vatRate.findFirst({ where: { isActive: true } });
    return res.json({ success: true, data: row });
  }

  static async create(req: AuthRequest, res: Response) {
    const { name, rateDecimal, isActive } = req.body || {};
    if (!name || rateDecimal === undefined || rateDecimal === null) {
      return res.status(400).json({ success: false, message: "name and rateDecimal are required" });
    }
    const r = Number(rateDecimal);
    if (!Number.isFinite(r) || r < 0 || r > 1) {
      return res.status(400).json({ success: false, message: "rateDecimal must be a decimal between 0 and 1 (e.g. 0.15 for 15%)" });
    }

    if (isActive) {
      const current = await prisma.vatRate.findFirst({ where: { isActive: true } });
      if (current) {
        return res.status(409).json({
          success: false,
          message: `Cannot activate: "${current.name}" is already the active VAT rate. Deactivate it first or use set-active to switch.`
        });
      }
    }

    const row = await prisma.vatRate.create({
      data: { name, rateDecimal: r, isActive: Boolean(isActive) }
    });

    await VATService.refreshActiveVatRate(true).catch(() => undefined);
    return res.status(201).json({ success: true, message: "VAT rate created", data: row });
  }

  static async update(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { name, rateDecimal, isActive } = req.body || {};

    const existing = await prisma.vatRate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "VAT rate not found" });

    const nextRate =
      rateDecimal === undefined || rateDecimal === null ? undefined : Number(rateDecimal);
    if (nextRate !== undefined && (!Number.isFinite(nextRate) || nextRate < 0 || nextRate > 1)) {
      return res.status(400).json({ success: false, message: "rateDecimal must be a decimal between 0 and 1 (e.g. 0.15 for 15%)" });
    }

    // Block activating this rate if another rate is already active
    if (isActive === true && !existing.isActive) {
      const current = await prisma.vatRate.findFirst({ where: { isActive: true } });
      if (current && current.id !== id) {
        return res.status(409).json({
          success: false,
          message: `Cannot activate: "${current.name}" is already the active VAT rate. Deactivate it first or use set-active to switch.`
        });
      }
    }

    const row = await prisma.vatRate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(nextRate !== undefined ? { rateDecimal: nextRate } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {})
      }
    });

    await VATService.refreshActiveVatRate(true).catch(() => undefined);
    return res.json({ success: true, message: "VAT rate updated", data: row });
  }

  static async setActive(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const existing = await prisma.vatRate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "VAT rate not found" });

    const current = await prisma.vatRate.findFirst({ where: { isActive: true } });
    if (current && current.id !== id) {
      return res.status(409).json({
        success: false,
        message: `Cannot activate: "${current.name}" is already the active VAT rate. Deactivate it first before switching.`
      });
    }

    const row = await prisma.vatRate.update({ where: { id }, data: { isActive: true } });

    await VATService.refreshActiveVatRate(true).catch(() => undefined);
    return res.json({ success: true, message: "Active VAT rate updated", data: row });
  }

  static async remove(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const existing = await prisma.vatRate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "VAT rate not found" });

    if (existing.isActive) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete the active VAT rate. Deactivate it first."
      });
    }

    await prisma.vatRate.delete({ where: { id } });
    await VATService.refreshActiveVatRate(true).catch(() => undefined);
    return res.json({ success: true, message: "VAT rate deleted" });
  }
}
