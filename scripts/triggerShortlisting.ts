//@ts-nocheck
import 'dotenv/config';
import { ApplicationScoringService } from '../src/services/ApplicationScoringService';

async function main() {
  const applicationId = process.argv[2];

  if (!applicationId) {
    console.error('Usage: npx ts-node scripts/triggerShortlisting.ts <applicationId>');
    process.exit(1);
  }

  try {
    console.log(`🚀 Triggering shortlisting for application ${applicationId}`);
    await ApplicationScoringService.processApplicationForShortlisting(applicationId);
    console.log('✅ Shortlisting run completed');
  } catch (error: any) {
    console.error('❌ Failed to process application:', error.message);
    console.error(error);
  }
}

main();


