/**
 * Send branded portfolio / application lifecycle sample emails
 * so design can be reviewed in a real inbox.
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/send-test-application-lifecycle-emails.ts
 */
import "dotenv/config";
import { EmailNotificationService } from "../src/services/EmailNotificationService";

const TO = process.env.TEST_APPLICATION_EMAIL_TO || "nyashakarata1@gmail.com";

async function main() {
  const base = {
    applicantName: "Nyasha Karata",
    applicantEmail: TO,
    businessName: "NTS Analytics",
    applicationId: `TEST-${Date.now()}`,
    currentStage: "SCREENING_PENDING",
  };

  console.log(`Sending branded APPLICATION RECEIVED email to ${TO}...`);
  await EmailNotificationService.sendApplicationReceivedEmail(base);
  console.log("✓ Received email sent");

  console.log(`Sending branded APPLICATION SHORTLISTED email to ${TO}...`);
  await EmailNotificationService.sendApplicationShortlistedEmail({
    ...base,
    currentStage: "SCREENING",
    additionalInfo: { score: 72 },
  });
  console.log("✓ Shortlisted email sent");

  console.log(`Sending branded DUE DILIGENCE STARTED email to ${TO}...`);
  await EmailNotificationService.sendDueDiligenceStartedEmail({
    ...base,
    currentStage: "ACTIVE_DD",
  });
  console.log("✓ Due diligence started email sent");

  console.log(`Sending branded STAGE UPDATE email to ${TO}...`);
  await EmailNotificationService.sendStageUpdateEmail({
    ...base,
    currentStage: "ACTIVE_DD",
  });
  console.log("✓ Stage update email sent");

  console.log("\nDone. Check the inbox (and spam) for branded letterhead samples.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
