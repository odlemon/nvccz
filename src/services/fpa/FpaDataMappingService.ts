// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";

const MAPPING_STATUSES = new Set(["MAPPED", "UNMAPPED", "TYPE_MISMATCH", "STALE"]);

export class FpaDataMappingService {
  static assertBuilder(user: any) {
    FpaAccessService.assertCanApprove(user);
  }

  static async assertModel(modelId: string) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");
    return model;
  }

  static async refresh(modelId: string, user: any) {
    FpaDataMappingService.assertBuilder(user);
    await FpaDataMappingService.assertModel(modelId);
    const userId = user?.id;

    let dataSource = await prisma.planningDataSource.findFirst({
      where: { modelId, OR: [{ systemCode: "ACCOUNTING" }, { systemCode: "NETSUITE_GL" }, { name: "NetSuite GL" }] },
    });
    if (!dataSource) {
      dataSource = await prisma.planningDataSource.create({
        data: {
          modelId,
          systemCode: "ACCOUNTING",
          name: "NetSuite GL",
          connectorConfig: { provider: "ACCOUNTING", label: "NetSuite GL" },
        },
      });
    }

    const modelAccounts = await prisma.planningModelAccount.findMany({ where: { modelId } });
    const accountIds = modelAccounts.map((a) => a.accountId);
    const accounts = accountIds.length
      ? await prisma.chartOfAccounts.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, accountNo: true, accountName: true, accountType: true },
        })
      : [];
    const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));

    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId },
      select: { id: true, accountId: true, moduleId: true, name: true, code: true },
    });
    const liByAccount = {};
    for (const li of lineItems) {
      if (li.accountId) liByAccount[li.accountId] = li;
    }

    let createdFields = 0;
    let createdMappings = 0;
    let mapped = 0;
    const now = new Date();

    for (const ma of modelAccounts) {
      const acct = accountById[ma.accountId];
      const code = acct?.accountNo || ma.accountId;
      const fieldKey = `GL_ACCOUNT.${code}`;
      let field = await prisma.planningSourceField.findFirst({
        where: { dataSourceId: dataSource.id, fieldKey },
      });
      if (!field) {
        field = await prisma.planningSourceField.create({
          data: {
            dataSourceId: dataSource.id,
            fieldKey,
            dataType: acct?.accountType || "CURRENCY",
          },
        });
        createdFields += 1;
      }

      let mapping = await prisma.planningLineItemMapping.findFirst({
        where: { modelId, sourceFieldId: field.id },
      });
      const matchLi = liByAccount[ma.accountId] || null;
      if (!mapping) {
        mapping = await prisma.planningLineItemMapping.create({
          data: {
            modelId,
            sourceFieldId: field.id,
            lineItemId: matchLi?.id || null,
            moduleId: matchLi?.moduleId || null,
            status: matchLi ? "MAPPED" : "UNMAPPED",
            mappedAt: matchLi ? now : null,
            mappedById: matchLi ? userId : null,
            lastSyncedAt: now,
          },
        });
        createdMappings += 1;
        if (matchLi) mapped += 1;
      } else {
        const data: any = { lastSyncedAt: now };
        if (matchLi && mapping.status === "UNMAPPED" && !mapping.lineItemId) {
          data.lineItemId = matchLi.id;
          data.moduleId = matchLi.moduleId || null;
          data.status = "MAPPED";
          data.mappedAt = now;
          data.mappedById = userId;
          mapped += 1;
        }
        await prisma.planningLineItemMapping.update({ where: { id: mapping.id }, data });
      }
    }

    await FpaAuditService.log("DATA_MAPPING_REFRESH", userId, {
      modelId,
      entityType: "DATA_MAPPING",
      reason: JSON.stringify({ createdFields, createdMappings, mapped }),
    });

    return FpaDataMappingService.list(modelId, {});
  }

  static async list(modelId: string, query: any = {}) {
    await FpaDataMappingService.assertModel(modelId);
    const where: any = { modelId };
    if (query.moduleId) where.moduleId = String(query.moduleId);
    if (query.unmappedOnly === true || query.unmappedOnly === "1" || query.unmappedOnly === "true") {
      where.status = "UNMAPPED";
    } else if (query.status) {
      where.status = String(query.status).toUpperCase();
    }

    const take = Math.min(Number(query.limit || query.pageSize || 100), 500);
    const skip = query.page ? (Math.max(1, Number(query.page)) - 1) * take : Number(query.offset || query.cursor || 0);

    const rows = await prisma.planningLineItemMapping.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take,
      skip,
      include: {
        sourceField: { include: { dataSource: true } },
        lineItem: { select: { id: true, code: true, name: true, moduleId: true } },
      },
    });

    let filtered = rows;
    if (query.sourceSystem) {
      const sys = String(query.sourceSystem).toUpperCase();
      filtered = filtered.filter((r) => {
        const code = String(r.sourceField?.dataSource?.systemCode || "").toUpperCase();
        const name = String(r.sourceField?.dataSource?.name || "").toUpperCase();
        return code.includes(sys) || name.includes(sys) || sys === "NETSUITE" && (code === "ACCOUNTING" || name.includes("NETSUITE"));
      });
    }
    if (query.q) {
      const q = String(query.q).trim().toLowerCase();
      filtered = filtered.filter((r) => {
        const key = String(r.sourceField?.fieldKey || "").toLowerCase();
        const li = String(r.lineItem?.name || r.lineItem?.code || "").toLowerCase();
        return key.includes(q) || li.includes(q);
      });
    }

    const allForSummary = await prisma.planningLineItemMapping.findMany({
      where: { modelId, ...(query.moduleId ? { moduleId: String(query.moduleId) } : {}) },
      select: { status: true },
    });
    const total = allForSummary.length;
    const mappedCount = allForSummary.filter((r) => r.status === "MAPPED").length;
    const pct = total ? Math.round((mappedCount / total) * 1000) / 10 : 0;

    const entries = filtered.map((r) => ({
      id: r.id,
      sourceField: r.sourceField?.fieldKey || null,
      sourceFieldId: r.sourceFieldId,
      sourceSystem: r.sourceField?.dataSource?.name || r.sourceField?.dataSource?.systemCode || null,
      sourceSystemCode: r.sourceField?.dataSource?.systemCode || null,
      targetLineItemId: r.lineItemId,
      targetLineItemName: r.lineItem?.name || null,
      targetLineItemCode: r.lineItem?.code || null,
      moduleId: r.moduleId || r.lineItem?.moduleId || null,
      status: r.status,
      mappedAt: r.mappedAt,
      lastSyncedAt: r.lastSyncedAt,
    }));

    return {
      summary: { total, mapped: mappedCount, unmapped: total - mappedCount, pct },
      entries,
      nextCursor: rows.length === take ? String(skip + take) : null,
    };
  }

  static async update(modelId: string, mappingId: string, body: any, user: any) {
    FpaDataMappingService.assertBuilder(user);
    await FpaDataMappingService.assertModel(modelId);
    const mapping = await prisma.planningLineItemMapping.findFirst({
      where: { id: mappingId, modelId },
    });
    if (!mapping) throw new FpaError(404, "NOT_FOUND", "Mapping not found");

    const data: any = {};
    if (body.lineItemId !== undefined) {
      if (body.lineItemId) {
        const li = await prisma.planningLineItem.findFirst({
          where: { id: String(body.lineItemId), modelId },
        });
        if (!li) throw new FpaError(400, "VALIDATION", "lineItemId must belong to model");
        data.lineItemId = li.id;
        data.moduleId = body.moduleId != null ? String(body.moduleId) : li.moduleId;
        data.status = "MAPPED";
        data.mappedAt = new Date();
        data.mappedById = user?.id || null;
      } else {
        data.lineItemId = null;
        data.moduleId = body.moduleId != null ? String(body.moduleId) : null;
        data.status = "UNMAPPED";
        data.mappedAt = null;
        data.mappedById = null;
      }
    }
    if (body.moduleId !== undefined && body.lineItemId === undefined) {
      data.moduleId = body.moduleId ? String(body.moduleId) : null;
    }
    if (body.status != null) {
      const st = String(body.status).toUpperCase();
      if (!MAPPING_STATUSES.has(st)) throw new FpaError(400, "VALIDATION", `Invalid status: ${st}`);
      data.status = st;
    }

    const updated = await prisma.planningLineItemMapping.update({
      where: { id: mappingId },
      data,
      include: {
        sourceField: { include: { dataSource: true } },
        lineItem: { select: { id: true, code: true, name: true, moduleId: true } },
      },
    });

    await FpaAuditService.log("DATA_MAPPING_UPDATE", user?.id, {
      modelId,
      lineItemId: updated.lineItemId,
      moduleId: updated.moduleId,
      entityType: "DATA_MAPPING",
      newValue: updated.id,
      reason: JSON.stringify({ before: { status: mapping.status, lineItemId: mapping.lineItemId }, after: { status: updated.status, lineItemId: updated.lineItemId } }),
    });

    return {
      id: updated.id,
      sourceField: updated.sourceField?.fieldKey || null,
      sourceSystem: updated.sourceField?.dataSource?.name || null,
      targetLineItemId: updated.lineItemId,
      targetLineItemName: updated.lineItem?.name || null,
      status: updated.status,
      moduleId: updated.moduleId,
      lastSyncedAt: updated.lastSyncedAt,
    };
  }
}
