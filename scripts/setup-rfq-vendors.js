const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const vendors = [
  {
    name: "Logix Vine Supplies",
    email: "logixvine@gmail.com",
    contactPerson: "Logix Vine",
    phone: "+263772000001",
    address: "10 Commerce Avenue, Harare, Zimbabwe",
    paymentTerms: "NET 30"
  },
  {
    name: "Vexima Games Ltd",
    email: "veximagames@gmail.com",
    contactPerson: "Vexima Team",
    phone: "+263772000002",
    address: "42 Innovation Road, Harare, Zimbabwe",
    paymentTerms: "NET 45"
  }
];

async function main() {
  const emails = vendors.map(v => v.email);

  const deletedUsers = await prisma.user.deleteMany({
    where: { email: { in: emails } }
  });
  console.log(`Deleted ${deletedUsers.count} user(s) with emails: ${emails.join(', ')}`);

  for (const vendor of vendors) {
    await prisma.vendor.deleteMany({
      where: { email: vendor.email }
    });

    const createdVendor = await prisma.vendor.create({
      data: vendor
    });

    console.log(`Created vendor ${createdVendor.name} (${createdVendor.email})`);
  }

  console.log("RFQ vendor seed complete.");
}

main()
  .catch(err => {
    console.error("Failed to sync RFQ vendors:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

