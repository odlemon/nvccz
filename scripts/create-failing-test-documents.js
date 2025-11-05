// Script to create test PDF documents that will FAIL (score < 50%)
// These documents have poor content that will result in rejection

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function createPDF(title, paragraphs, filename) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(__dirname, '..', 'test-documents-failing', filename);
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const doc = new PDFDocument({
      margins: { top: 50, bottom: 50, left: 72, right: 72 }
    });
    
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    
    // Title
    doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(2);
    
    // Content paragraphs
    doc.fontSize(12).font('Helvetica');
    
    paragraphs.forEach((paragraph, index) => {
      if (paragraph.type === 'heading') {
        doc.fontSize(14).font('Helvetica-Bold').text(paragraph.text);
        doc.moveDown(0.5);
      } else if (paragraph.type === 'subheading') {
        doc.fontSize(12).font('Helvetica-Bold').text(paragraph.text);
        doc.moveDown(0.5);
      } else {
        doc.fontSize(12).font('Helvetica').text(paragraph.text, {
          align: 'left',
          paragraphGap: 5
        });
        doc.moveDown(1);
      }
    });
    
    // Finalize PDF
    doc.end();
    
    stream.on('finish', () => {
      console.log(`✅ Created: ${filename}`);
      resolve();
    });
    
    stream.on('error', (error) => {
      console.error(`❌ Error creating ${filename}:`, error);
      reject(error);
    });
  });
}

// Create test documents directory
const testDocsDir = path.join(__dirname, '..', 'test-documents-failing');
if (!fs.existsSync(testDocsDir)) {
  fs.mkdirSync(testDocsDir, { recursive: true });
}

// BUSINESS PLAN - Poor content (vague, no details, unrealistic)
const businessPlanContent = [
  { type: 'heading', text: 'Executive Summary' },
  { type: 'text', text: 'We want to start a business. We think it will make money. We need funding to get started.' },
  { type: 'text', text: 'The business will be about selling things online. We believe there is a market for this.' },
  { type: 'heading', text: 'Business Model' },
  { type: 'text', text: 'We will sell products. People will buy them. We will make profit.' },
  { type: 'text', text: 'We are not sure about pricing yet. We will figure it out later.' },
  { type: 'heading', text: 'Market Opportunity' },
  { type: 'text', text: 'There are many customers out there. We think we can reach them somehow.' },
  { type: 'text', text: 'We have not done much research. We just think it will work.' },
  { type: 'heading', text: 'Financial Projections' },
  { type: 'text', text: 'We expect to make a lot of money. Maybe $1 million in the first year. We are not sure how but we will try.' },
  { type: 'text', text: 'We have not calculated expenses properly. We will figure it out as we go.' },
  { type: 'heading', text: 'Team' },
  { type: 'text', text: 'We are a small team. We do not have much experience. We are learning as we go.' },
  { type: 'heading', text: 'Funding Requirements' },
  { type: 'text', text: 'We need $200,000 to start. We will use it for various things. We are not entirely sure what yet.' },
  { type: 'text', text: 'We think this will be enough to get started and make money.' }
];

// PROOF OF CONCEPT - Poor content (no proof, no concept)
const pocContent = [
  { type: 'heading', text: 'Concept Overview' },
  { type: 'text', text: 'We have an idea. We have not tested it yet. We think it might work.' },
  { type: 'text', text: 'We do not have a prototype. We have not built anything yet.' },
  { type: 'heading', text: 'Features' },
  { type: 'text', text: 'The product will have features. We are not sure what features yet.' },
  { type: 'text', text: 'We will add features based on what customers want.' },
  { type: 'heading', text: 'Technical Feasibility' },
  { type: 'text', text: 'We think it is technically possible. We have not tried to build it yet.' },
  { type: 'text', text: 'We will need to learn more about technology. We are not experts.' },
  { type: 'heading', text: 'Pilot Results' },
  { type: 'text', text: 'We have not run a pilot yet. We need funding first to test it.' },
  { type: 'text', text: 'We believe once we have funding, we can test and it will work.' }
];

// MARKET RESEARCH - Poor content (no research, vague)
const marketResearchContent = [
  { type: 'heading', text: 'Market Overview' },
  { type: 'text', text: 'The market is big. There are many potential customers. We think we can reach them.' },
  { type: 'text', text: 'We have not done detailed research. We looked at some websites and think there is opportunity.' },
  { type: 'heading', text: 'Market Size' },
  { type: 'text', text: 'The market is worth a lot of money. We do not know the exact number but it is big.' },
  { type: 'text', text: 'We think we can capture a small portion of this market.' },
  { type: 'heading', text: 'Competitive Analysis' },
  { type: 'text', text: 'There are competitors. We have not analyzed them in detail. We think we can compete somehow.' },
  { type: 'text', text: 'We are not sure what makes us different yet. We will figure it out.' },
  { type: 'heading', text: 'Customer Segments' },
  { type: 'text', text: 'Our customers are people who might want our product. We have not identified specific segments yet.' },
  { type: 'text', text: 'We will target everyone who might be interested.' },
  { type: 'heading', text: 'Pricing Strategy' },
  { type: 'text', text: 'We will price competitively. We are not sure what the right price is yet.' },
  { type: 'text', text: 'We will adjust prices based on what customers are willing to pay.' }
];

// PROJECTED CASH FLOWS - Poor content (unrealistic, no basis)
const cashFlowsContent = [
  { type: 'heading', text: 'Financial Projections Overview' },
  { type: 'text', text: 'We expect to make a lot of money. These projections are estimates based on our assumptions.' },
  { type: 'text', text: 'We have not validated these numbers. They are rough estimates.' },
  { type: 'heading', text: 'Year 1 Projections' },
  { type: 'text', text: 'Revenue: $500,000. We are not sure how we will achieve this but we think it is possible.' },
  { type: 'text', text: 'Expenses: $100,000. We have not calculated this in detail. These are rough estimates.' },
  { type: 'text', text: 'Net Profit: $400,000. This seems reasonable to us.' },
  { type: 'heading', text: 'Year 2-5 Projections' },
  { type: 'text', text: 'We expect revenue to grow each year. We are not sure by how much but it will grow.' },
  { type: 'text', text: 'By year 5, we expect to be making millions. We are confident this will happen.' },
  { type: 'heading', text: 'Assumptions' },
  { type: 'text', text: 'We assume everything will go well. We assume customers will buy our product.' },
  { type: 'text', text: 'We assume we can execute our plan. We assume market conditions will be favorable.' },
  { type: 'text', text: 'These assumptions are optimistic. We have not validated them with data.' },
  { type: 'heading', text: 'Funding Requirements' },
  { type: 'text', text: 'We are requesting $200,000 which is above the $20k-$150k range. We need this much to start.' },
  { type: 'text', text: 'We will use the funds for various expenses. We have not broken down the costs in detail.' }
];

async function createAllDocuments() {
  console.log('📄 Creating FAILING test PDF documents (these will score < 50%)...\n');
  
  try {
    await createPDF('BUSINESS PLAN\nPoor Business Idea Inc.', businessPlanContent, 'BUSINESS_PLAN.pdf');
    await createPDF('PROOF OF CONCEPT\nPoor Business Idea Inc. - Untested Concept', pocContent, 'PROOF_OF_CONCEPT.pdf');
    await createPDF('MARKET RESEARCH REPORT\nPoor Business Idea - No Research', marketResearchContent, 'MARKET_RESEARCH.pdf');
    await createPDF('PROJECTED CASH FLOWS\nPoor Business Idea Inc. - Unrealistic Projections', cashFlowsContent, 'PROJECTED_CASH_FLOWS.pdf');
    
    console.log('\n✅ All FAILING test documents created successfully!');
    console.log(`📁 Location: ${testDocsDir}`);
    console.log('\n📋 Documents created:');
    console.log('  - BUSINESS_PLAN.pdf (vague, no details)');
    console.log('  - PROOF_OF_CONCEPT.pdf (no proof, untested)');
    console.log('  - MARKET_RESEARCH.pdf (no research, vague)');
    console.log('  - PROJECTED_CASH_FLOWS.pdf (unrealistic, $200k request)');
    console.log('\n💡 These documents will likely score < 50% and be REJECTED');
    console.log('   Requested amount: $200,000 (outside $20k-$150k range)');
    console.log('   Business stage: IDEA (less mature)');
    console.log('   Content: Vague, no proof, unrealistic projections');
  } catch (error) {
    console.error('❌ Error creating documents:', error);
    process.exit(1);
  }
}

createAllDocuments();

