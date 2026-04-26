// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES } from "../src/config/vcCacMarketingExpenseCategories";

const prisma = new PrismaClient();

async function seedExpenseCategories() {
  console.log("🌱 Seeding expense categories for proper journal entries...");

  try {
    // Check if categories already exist
    const existingCategories = await prisma.expenseCategory.findMany({
      where: {
        name: {
          in: [
            "Salaries and Wages",
            "Travel and Accommodation", 
            "Operations",
            "Branding and Marketing",
            "Office Equipment"
          ]
        }
      }
    });

    if (existingCategories.length > 0) {
      console.log("✅ Expense categories already exist, skipping...");
      return;
    }

    // Create the 5 hardcoded expense categories
    // Core 5; "Branding and Marketing" is also listed in `vcCacMarketingExpenseCategories.ts` for VC CAC.
    const categories = [
      {
        name: "Salaries and Wages",
        description: "Employee salaries, wages, and compensation",
        isActive: true
      },
      {
        name: "Travel and Accommodation", 
        description: "Business travel, accommodation, and related expenses",
        isActive: true
      },
      {
        name: "Operations",
        description: "General operational expenses and overhead costs",
        isActive: true
      },
      {
        name: "Branding and Marketing",
        description: "Marketing campaigns, advertising, and branding expenses",
        isActive: true
      },
      {
        name: "Office Equipment",
        description: "Purchase and maintenance of office equipment and supplies",
        isActive: true
      }
    ];

    const extraFromVcCac = VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES.filter(
      (n) => !categories.some((c) => c.name === n)
    ).map((name) => ({
      name,
      description:
        name === "Marketing"
          ? "General marketing (VC CAC; same allowlist as Branding and Marketing)"
          : `Marketing-related (VC CAC) — ${name}`,
      isActive: true
    }));

    const allToCreate = [...categories, ...extraFromVcCac];

    console.log("📊 Creating expense categories...");

    for (const category of allToCreate) {
      const created = await prisma.expenseCategory.create({
        data: category
      });
      console.log(`✅ Created: ${created.name}`);
    }

    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║  EXPENSE CATEGORIES SEEDED SUCCESSFULLY                        ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    console.log("📋 Categories created:");
    console.log("   • Salaries and Wages → Account 5000");
    console.log("   • Travel and Accommodation → Account 5030");
    console.log("   • Operations → Account 5090");
    console.log("   • Branding and Marketing → Account 5040");
    console.log("   • Office Equipment → Account 5020");
    console.log("\n💡 These categories will now generate proper journal entries!");
    console.log("");

  } catch (error) {
    console.error("❌ Error seeding expense categories:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedExpenseCategories()
  .then(() => {
    console.log("✅ Expense categories seeding completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Expense categories seeding failed:", error);
    process.exit(1);
  });
