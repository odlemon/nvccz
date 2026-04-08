/**
 * Reset the applicant user's password for a portfolio company found by name.
 *
 * Usage:
 *   npx ts-node scripts/reset-applicant-password-by-portfolio-company-name.ts "<companyNameQuery>" "<newPassword>"
 *
 * Notes:
 * - Does NOT disclose existing password (passwords are hashed).
 * - Resets the linked `portfolio_companies.userId` user password.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/database";

async function main() {
  const nameQuery = process.argv[2];
  const newPassword = process.argv[3];

  if (!nameQuery || !newPassword) {
    console.error(
      'Usage: npx ts-node scripts/reset-applicant-password-by-portfolio-company-name.ts "<companyNameQuery>" "<newPassword>"'
    );
    process.exit(1);
  }

  if (String(newPassword).length < 6) {
    console.error("newPassword must be at least 6 characters");
    process.exit(1);
  }

  const companies = await prisma.portfolioCompany.findMany({
    where: { name: { contains: nameQuery } },
    select: { id: true, name: true, industry: true, status: true, userId: true, user: { select: { email: true } } },
    take: 10,
  });

  if (companies.length === 0) {
    console.error(`No portfolio company found with name containing "${nameQuery}"`);
    process.exit(1);
  }

  if (companies.length > 1) {
    console.log(`Found ${companies.length} companies matching "${nameQuery}".`);
    for (const c of companies) {
      console.log(`- ${c.id} | ${c.name} | industry=${c.industry} | status=${c.status} | userEmail=${c.user?.email ?? "?"}`);
    }
    console.error("Refusing to reset password because match is ambiguous. Please use a more specific query.");
    process.exit(1);
  }

  const company = companies[0];
  if (!company?.userId) {
    console.error(`Company ${company.id} (${company.name}) has no linked userId`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: company.userId },
    data: { password: hashedPassword, updatedAt: new Date() },
  });

  console.log(`Password reset OK for portfolio company: ${company.name} (${company.id})`);
  console.log(`Applicant login email: ${company.user?.email ?? "[unknown-email]"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

