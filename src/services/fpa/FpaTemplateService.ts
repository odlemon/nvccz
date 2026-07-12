// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";
import { FpaLineItemService } from "./FpaLineItemService";

const TEMPLATES = [
  {
    id: "saas-revenue",
    name: "SaaS Revenue Pack",
    description: "Units, price, revenue, discounts, net revenue",
    lineItems: [
      { code: "UNITS", name: "Units Sold", lineItemType: "INPUT", dataType: "NUMBER", format: "Number", summaryMethod: "SUM", isEditable: true },
      { code: "PRICE", name: "Price", lineItemType: "INPUT", dataType: "CURRENCY", format: "Currency", summaryMethod: "AVERAGE", isEditable: true },
      { code: "REVENUE", name: "Revenue", lineItemType: "CALCULATED", dataType: "CURRENCY", format: "Currency", summaryMethod: "SUM", isEditable: false, expression: "[Units Sold] * [Price]" },
      { code: "DISCOUNTS", name: "Discounts", lineItemType: "INPUT", dataType: "CURRENCY", format: "Currency", summaryMethod: "SUM", isEditable: true },
      { code: "NET_REV", name: "Net Revenue", lineItemType: "CALCULATED", dataType: "CURRENCY", format: "Currency", summaryMethod: "SUM", isEditable: false, expression: "[Revenue] - [Discounts]" },
    ],
  },
  {
    id: "cogs-margin",
    name: "COGS & Margin Pack",
    description: "COGS and gross profit drivers",
    lineItems: [
      { code: "COGS", name: "COGS", lineItemType: "INPUT", dataType: "CURRENCY", format: "Currency", summaryMethod: "SUM", isEditable: true },
      { code: "GROSS_PROFIT", name: "Gross Profit", lineItemType: "CALCULATED", dataType: "CURRENCY", format: "Currency", summaryMethod: "SUM", isEditable: false, expression: "[Net Revenue] - [COGS]" },
    ],
  },
  {
    id: "discount-adj",
    name: "Discount & Adjustments",
    description: "Discount and adjustment line items",
    lineItems: [
      { code: "DISC_PCT", name: "Discount %", lineItemType: "INPUT", dataType: "PERCENT", format: "Percent", summaryMethod: "AVERAGE", isEditable: true },
      { code: "ADJ", name: "Adjustments", lineItemType: "INPUT", dataType: "CURRENCY", format: "Currency", summaryMethod: "SUM", isEditable: true },
    ],
  },
  {
    id: "workforce-drivers",
    name: "Workforce Drivers",
    description: "Headcount and average salary → payroll",
    lineItems: [
      { code: "HEADCOUNT", name: "Headcount", lineItemType: "INPUT", dataType: "NUMBER", format: "Integer", summaryMethod: "LAST", isEditable: true },
      { code: "AVG_SALARY", name: "Average Salary", lineItemType: "INPUT", dataType: "CURRENCY", format: "Currency", summaryMethod: "AVERAGE", isEditable: true },
      { code: "PAYROLL", name: "Payroll Expense", lineItemType: "CALCULATED", dataType: "CURRENCY", format: "Currency", summaryMethod: "SUM", isEditable: false, expression: "[Headcount] * [Average Salary]" },
    ],
  },
];

/** Map bracket refs [Name] to LINE('CODE') for engine */
function toEngineExpression(expression: string, codeByName: Record<string, string>): string {
  if (!expression) return expression;
  return expression.replace(/\[([^\]]+)\]/g, (_m, name) => {
    const code = codeByName[String(name).trim()] || String(name).trim().toUpperCase().replace(/\s+/g, "_");
    return `LINE('${code}')`;
  });
}

export class FpaTemplateService {
  static list() {
    return TEMPLATES.map(({ id, name, description, lineItems }) => ({
      id,
      name,
      description,
      lineItems: lineItems.map(({ expression, ...rest }) => ({ ...rest, expression: expression || null })),
    }));
  }

  static async apply(modelId: string, moduleId: string, templateId: string, user: any, ip?: string) {
    FpaAccessService.assertCanApprove(user);
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) throw new FpaError(404, "NOT_FOUND", `Template ${templateId} not found`);
    const mod = await prisma.planningModule.findUnique({ where: { id: moduleId } });
    if (!mod || mod.modelId !== modelId) throw new FpaError(400, "VALIDATION", "moduleId must belong to model");

    const createdLis = [];
    const createdFormulas = [];
    const codeByName: Record<string, string> = {};
    let sort = (await prisma.planningLineItem.count({ where: { modelId } })) * 10 + 10;

    for (const item of tpl.lineItems) {
      codeByName[item.name] = item.code;
      const existing = await prisma.planningLineItem.findFirst({ where: { modelId, code: item.code } });
      if (existing) {
        createdLis.push(await FpaLineItemService.update(existing.id, { moduleId, name: item.name }, user.id, ip));
        continue;
      }
      const li = await FpaLineItemService.create(
        {
          modelId,
          moduleId,
          code: item.code,
          name: item.name,
          lineItemType: item.lineItemType,
          dataType: item.dataType,
          format: item.format,
          summaryMethod: item.summaryMethod,
          isEditable: item.isEditable,
          sortOrder: sort,
        },
        user.id,
        ip
      );
      createdLis.push(li);
      sort += 10;
    }

    // Refresh name→code from DB for formula resolution
    const all = await prisma.planningLineItem.findMany({ where: { modelId }, select: { code: true, name: true } });
    for (const li of all) codeByName[li.name] = li.code;

    for (const item of tpl.lineItems) {
      if (!item.expression) continue;
      const li = await prisma.planningLineItem.findFirst({ where: { modelId, code: item.code } });
      if (!li) continue;
      const existingF = await prisma.planningFormula.findFirst({ where: { lineItemId: li.id } });
      const expression = toEngineExpression(item.expression, codeByName);
      if (existingF) {
        const updated = await FpaLineItemService.updateFormula(existingF.id, { expression }, user.id, ip);
        createdFormulas.push(updated.formula || updated);
      } else {
        const created = await FpaLineItemService.createFormula(
          { modelId, lineItemId: li.id, expression },
          user.id,
          ip
        );
        createdFormulas.push(created.formula || created);
      }
    }

    await FpaAuditService.log("TEMPLATE_APPLIED", user.id, {
      modelId,
      newValue: moduleId,
      reason: JSON.stringify({ templateId, summary: `Applied ${tpl.name}` }),
      ip,
    });

    return {
      templateId,
      moduleId,
      lineItems: createdLis,
      formulas: createdFormulas,
    };
  }
}
