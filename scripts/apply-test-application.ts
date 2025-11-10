//@ts-nocheck
import 'dotenv/config';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TARGET_EMAIL = 'khayalamizim@gmail.com';

async function main() {
  try {
    console.log('📨 Submitting application for', TARGET_EMAIL);

    const documentsDir = path.resolve(__dirname, '..', process.argv[2] || 'test-documents');
    const files = [
      { name: 'BUSINESS_PLAN', file: 'BUSINESS_PLAN.pdf' },
      { name: 'PROOF_OF_CONCEPT', file: 'PROOF_OF_CONCEPT.pdf' },
      { name: 'MARKET_RESEARCH', file: 'MARKET_RESEARCH.pdf' },
      { name: 'PROJECTED_CASH_FLOWS', file: 'PROJECTED_CASH_FLOWS.pdf' }
    ];

    const form = new FormData();
    form.append('applicantName', 'Khaya Lami');
    form.append('applicantEmail', TARGET_EMAIL);
    form.append('applicantPhone', '+263774000000');
    form.append('applicantAddress', '123 road');
    form.append('businessName', 'Khayalami');
    form.append('businessDescription', 'Khaya');
    form.append('industry', 'Finance');
    form.append('businessStage', 'STARTUP');
    form.append('foundingDate', '2025-11-02');
    form.append('requestedAmount', '40000');

    const documentTypes = files.map(doc => doc.name);
    form.append('documentTypes', JSON.stringify(documentTypes));

    for (const doc of files) {
      const filePath = path.join(documentsDir, doc.file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing document file: ${filePath}`);
      }
      form.append('files', fs.createReadStream(filePath), {
        filename: doc.file,
        contentType: 'application/pdf'
      });
    }

    const response = await axios.post(`${BASE_URL}/api/applications`, form, {
      headers: form.getHeaders()
    });

    console.log('✅ Application submitted');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    if (error.response) {
      console.error('❌ Submission failed with status', error.response.status);
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ Submission error:', error.message);
      if (error.code) {
        console.error('Error code:', error.code);
      }
      if (error.config?.url) {
        console.error('Request URL:', error.config.url);
      }
      if (error.stack) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

main();


