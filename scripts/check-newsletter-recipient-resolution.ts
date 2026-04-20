import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  getNewsletterRecipientConfig,
  listNewsletterBaseAudienceUsers,
  resolveNewsletterRecipients,
} from "../src/utils/newsletterInternalRecipients";

async function main() {
  const cfg = await getNewsletterRecipientConfig();
  const users = await listNewsletterBaseAudienceUsers();
  const excludeId = users[0]?.id || "";
  const resolved = excludeId
    ? await resolveNewsletterRecipients(excludeId)
    : { userRecipients: [], extraEmailRecipients: [], config: cfg };

  console.log(
    JSON.stringify(
      {
        config: cfg,
        eligibleInternalUsers: users.length,
        sampleExcludeUserId: excludeId || null,
        resolvedUserRecipients: resolved.userRecipients.length,
        resolvedExtraEmailRecipients: resolved.extraEmailRecipients.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

