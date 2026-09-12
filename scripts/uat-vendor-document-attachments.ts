/**
 * UAT 3.2 — vendor document attachments (settings + validation smoke).
 * Run: npm run uat:procurement:3.2
 */
import "dotenv/config";
import { VendorDocumentUploadSettingsService } from "../src/services/VendorDocumentUploadSettingsService";
import { VendorDocumentAttachmentService } from "../src/services/VendorDocumentAttachmentService";
import { PDF_MIME } from "../src/constants/vendorDocumentAttachment";

async function main() {
  console.log("UAT 3.2 — Vendor document attachments\n");

  const settings = await VendorDocumentUploadSettingsService.getSettings();
  console.log("[ok] settings loaded", {
    maxFileSizeBytes: settings.maxFileSizeBytes,
    allowedTypes: settings.allowedFileTypes.map((t) => t.mimeType)
  });

  const publicView = VendorDocumentUploadSettingsService.getPublicSettingsView(settings);
  if (!publicView.allowedFileTypes.some((t) => t.mimeType === PDF_MIME)) {
    throw new Error("Public settings must include PDF");
  }
  console.log("[ok] public settings include PDF");

  const pdf = Buffer.from("%PDF-1.4\nUAT test document");
  await VendorDocumentAttachmentService.validateFile(pdf, "uat.pdf", PDF_MIME);
  console.log("[ok] PDF validation passed");

  try {
    await VendorDocumentAttachmentService.validateFile(Buffer.from("bad"), "bad.pdf", PDF_MIME);
    throw new Error("Expected integrity failure");
  } catch (e: any) {
    if (!String(e.message).includes("integrity")) throw e;
    console.log("[ok] invalid PDF rejected");
  }

  console.log("\nUAT 3.2 passed.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
