// @ts-nocheck
/**
 * The two VAT accounts, resolved one way for every posting and every report (decision D23): input VAT is recoverable
 * from ZIMRA, an asset — 1101 VAT Input Recoverable; output VAT is owed to ZIMRA, a liability — 2100 VAT Output Payable.
 * Each caller used to look them up for itself by name, and "VAT Input" matched both 1101 and 2110 "VAT Input (clearing)
 * / VAT Payable", so postings and the VAT report could use different accounts.
 */
import { prisma } from "./database";

export async function vatInputAccount(client: any = prisma) {
  return (
    (await client.chartOfAccounts.findFirst({ where: { accountNo: "1101", isActive: true } })) ||
    (await client.chartOfAccounts.findFirst({ where: { accountName: { contains: "VAT Input" }, accountType: "Current Asset", isActive: true }, orderBy: { accountNo: "asc" } }))
  );
}

export async function vatOutputAccount(client: any = prisma) {
  return (
    (await client.chartOfAccounts.findFirst({ where: { accountNo: "2100", isActive: true } })) ||
    (await client.chartOfAccounts.findFirst({ where: { accountName: { contains: "VAT Output" }, accountType: "Current Liability", isActive: true }, orderBy: { accountNo: "asc" } }))
  );
}
