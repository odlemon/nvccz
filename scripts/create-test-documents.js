// Script to create test PDF documents for application submission
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function createPDF(title, paragraphs, filename) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(__dirname, '..', 'test-documents', filename);
    
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
const testDocsDir = path.join(__dirname, '..', 'test-documents');
if (!fs.existsSync(testDocsDir)) {
  fs.mkdirSync(testDocsDir, { recursive: true });
}

// Business Plan PDF
const businessPlanContent = [
  { type: 'heading', text: 'Executive Summary' },
  { type: 'text', text: 'TechStart Inc. is an innovative technology startup focused on developing AI-powered solutions for small and medium businesses. We are seeking $75,000 in seed funding to accelerate product development and market entry. Our platform addresses critical pain points faced by small businesses in Zimbabwe, including lack of automation, limited access to business intelligence, and inefficient operations.' },
  { type: 'heading', text: 'Business Model' },
  { type: 'text', text: 'Our business operates on a Software-as-a-Service (SaaS) model, providing small businesses with access to advanced AI-powered tools through a monthly subscription. We target 500+ small businesses in our first year, with a projected revenue of $150,000. Our pricing model is designed to be affordable and accessible, with entry-level plans starting at $50 per month.' },
  { type: 'heading', text: 'Market Opportunity' },
  { type: 'text', text: 'The small business AI solutions market is experiencing significant growth, with a 25% annual growth rate. Our target market includes over 50,000 small businesses in Zimbabwe that could benefit from our solutions. The increasing digitalization of business operations and the need for data-driven decision making creates a substantial opportunity for our platform.' },
  { type: 'heading', text: 'Financial Projections' },
  { type: 'text', text: 'We project Year 1 revenue of $150,000, growing to $400,000 in Year 2, and reaching $2 million by Year 5. Our break-even point is projected at Month 18, with positive cash flow beginning in Year 2. These projections are based on conservative customer acquisition rates and realistic pricing assumptions.' },
  { type: 'heading', text: 'Team' },
  { type: 'text', text: 'Our founding team combines extensive experience in technology and business development. We have a technical team of three developers with expertise in AI and cloud technologies. Additionally, we have assembled an advisory board of industry experts who provide strategic guidance and market insights.' },
  { type: 'heading', text: 'Use of Funds' },
  { type: 'text', text: 'The requested $75,000 will be allocated as follows: $40,000 for product development and enhancement, $20,000 for marketing and sales initiatives, and $15,000 for operational expenses. This funding will enable us to complete product development, launch our marketing campaign, and acquire our first 100 customers.' },
  { type: 'text', text: 'This business plan demonstrates strong potential for growth and scalability, positioning TechStart Inc. as a leader in the AI solutions market for small businesses in Zimbabwe.' }
];

// Proof of Concept PDF
const pocContent = [
  { type: 'heading', text: 'Concept Validation' },
  { type: 'text', text: 'We have successfully developed a working prototype of our AI-powered business management platform that has been tested with 10 pilot customers over a period of three months. The prototype demonstrates all core functionalities and has received positive feedback from early adopters.' },
  { type: 'heading', text: 'Key Features Demonstrated' },
  { type: 'text', text: 'Our platform includes automated business analytics that provide real-time insights into business performance. The AI-powered customer insights feature helps businesses understand their customer base and identify trends. Our predictive financial modeling tool enables businesses to forecast cash flow and make informed financial decisions. Additionally, the automated reporting feature saves businesses significant time by generating comprehensive reports automatically.' },
  { type: 'heading', text: 'Pilot Results' },
  { type: 'text', text: 'Our pilot program involved 10 small businesses across different sectors. The results have been highly positive, with a 90% customer satisfaction rate. On average, businesses reported saving 15 hours per week through automation, and we achieved an 85% customer retention rate. These results validate the market demand and effectiveness of our solution.' },
  { type: 'heading', text: 'Technical Feasibility' },
  { type: 'text', text: 'The core technology stack has been proven through our prototype development. We have designed a scalable architecture that can handle growth from hundreds to thousands of users. Our cloud infrastructure is ready for deployment, and we have implemented robust security measures to protect customer data and ensure compliance with data protection regulations.' },
  { type: 'heading', text: 'Next Steps' },
  { type: 'text', text: 'Following successful validation, our next steps include full product development to transform the prototype into a production-ready platform. We will focus on market expansion through targeted marketing campaigns and develop a comprehensive customer acquisition strategy. We are also exploring partnership opportunities with business associations and technology providers to accelerate growth.' },
  { type: 'text', text: 'This proof of concept demonstrates that our solution is viable, addresses real market needs, and has strong potential for commercial success.' }
];

// Market Research PDF
const marketResearchContent = [
  { type: 'heading', text: 'Market Size' },
  { type: 'text', text: 'Our total addressable market consists of over 50,000 small businesses in Zimbabwe. The serviceable market, which includes businesses that have the infrastructure and need for our solution, is estimated at 15,000 businesses. Our target market for Year 1 is 5,000 businesses that are actively seeking digital transformation solutions.' },
  { type: 'heading', text: 'Market Trends' },
  { type: 'text', text: 'The market is experiencing strong growth trends. Cloud solution adoption is growing at 30% year-over-year, with small businesses increasingly recognizing the benefits of cloud-based tools. There is a growing need for automation, with 40% of businesses identifying it as a priority. Digital transformation initiatives are growing at 25% annually, and AI adoption is rising at a 20% growth rate, indicating strong market readiness for our solution.' },
  { type: 'heading', text: 'Competitive Analysis' },
  { type: 'text', text: 'The market has three major direct competitors, but none of them specifically target the Zimbabwe small business market with localized solutions. Our key differentiation is affordability, localization to the Zimbabwe market, and ease of use. We have a competitive advantage as first-movers in this specific market segment, and we project capturing 10% market share in Year 1.' },
  { type: 'heading', text: 'Customer Segments' },
  { type: 'text', text: 'Our primary customer segments include retail businesses, which represent 40% of our target market, service providers at 30%, manufacturing SMEs at 20%, and other sectors comprising the remaining 10%. Each segment has specific needs that our platform addresses through customizable features and industry-specific templates.' },
  { type: 'heading', text: 'Pricing Strategy' },
  { type: 'text', text: 'We have developed a tiered pricing strategy to accommodate different business sizes and needs. Our entry tier is priced at $50 per month per business, targeting small businesses just starting their digital journey. The professional tier at $150 per month includes advanced features for growing businesses. Enterprise tier pricing is customized based on specific requirements and scale.' },
  { type: 'heading', text: 'Growth Projections' },
  { type: 'text', text: 'Based on market analysis and our customer acquisition strategy, we project acquiring 100 customers in Year 1, growing to 400 customers in Year 2, and reaching 1,000 customers by Year 3. These projections are conservative and based on realistic market penetration assumptions and our marketing budget constraints.' },
  { type: 'text', text: 'This market research shows strong demand and growth potential, validating our business strategy and positioning us for success in the Zimbabwe market.' }
];

// Projected Cash Flows PDF
const cashFlowsContent = [
  { type: 'heading', text: 'Year 1 Financial Projection' },
  { type: 'text', text: 'In Year 1, we project revenue of $150,000 based on 100 customers at an average revenue per customer of $1,500 annually. Operating costs are estimated at $120,000, including salaries, infrastructure, marketing, and administrative expenses. This results in a net cash flow of $30,000 for the first year.' },
  { type: 'heading', text: 'Year 2 Financial Projection' },
  { type: 'text', text: 'Year 2 shows significant growth with revenue reaching $400,000 as we expand to 400 customers. Operating costs increase to $280,000 due to expanded operations and team growth. Net cash flow improves to $120,000, demonstrating improved profitability and scalability of the business model.' },
  { type: 'heading', text: 'Year 3 Financial Projection' },
  { type: 'text', text: 'Year 3 continues our growth trajectory with revenue of $800,000 from 1,000 customers. Operating costs are $520,000, reflecting continued investment in product development and market expansion. Net cash flow reaches $280,000, showing strong profitability and positive momentum.' },
  { type: 'heading', text: 'Year 4 and Year 5 Projections' },
  { type: 'text', text: 'Years 4 and 5 show continued strong growth with revenues reaching $1.2 million and $2 million respectively. Operating costs scale proportionally while maintaining healthy margins. Net cash flows of $480,000 and $800,000 demonstrate the long-term viability and profitability of the business.' },
  { type: 'heading', text: 'Key Assumptions' },
  { type: 'text', text: 'Our financial projections are based on conservative assumptions. Customer acquisition starts at 100 in Year 1 and grows at 300% annually. Average revenue per customer is $1,500 per year. Operating margins improve from 20% to 40% over the 5-year period as we achieve economies of scale. Our break-even point is projected at Month 18.' },
  { type: 'heading', text: 'Cash Flow Breakdown' },
  { type: 'text', text: 'The initial months 1-6 will show negative cash flow as we invest in product development and customer acquisition. Months 7-12 represent our break-even period where revenues begin to cover operating costs. From Month 13 onwards, we project positive and growing cash flow as customer base expands and operational efficiency improves.' },
  { type: 'heading', text: 'Funding Requirements' },
  { type: 'text', text: 'We are seeking an initial investment of $75,000 to fund product development, marketing initiatives, and operational expenses. The funds will be used strategically to accelerate growth and achieve our break-even point. Based on our projections, we expect to deliver a 300% return on investment over the 5-year period, making this an attractive investment opportunity.' },
  { type: 'text', text: 'These projections demonstrate strong financial viability and growth potential, positioning TechStart Inc. as a profitable and scalable business venture.' }
];

async function createAllDocuments() {
  console.log('📄 Creating test PDF documents...\n');
  
  try {
    await createPDF('BUSINESS PLAN\nTechStart Inc. Investment Application', businessPlanContent, 'BUSINESS_PLAN.pdf');
    await createPDF('PROOF OF CONCEPT\nTechStart Inc. - AI Business Solutions Platform', pocContent, 'PROOF_OF_CONCEPT.pdf');
    await createPDF('MARKET RESEARCH REPORT\nAI Solutions for Small Businesses - Zimbabwe Market', marketResearchContent, 'MARKET_RESEARCH.pdf');
    await createPDF('PROJECTED CASH FLOWS\nTechStart Inc. - 5 Year Financial Projection', cashFlowsContent, 'PROJECTED_CASH_FLOWS.pdf');
    
    console.log('\n✅ All test documents created successfully!');
    console.log(`📁 Location: ${testDocsDir}`);
    console.log('\n📋 Documents created:');
    console.log('  - BUSINESS_PLAN.pdf');
    console.log('  - PROOF_OF_CONCEPT.pdf');
    console.log('  - MARKET_RESEARCH.pdf');
    console.log('  - PROJECTED_CASH_FLOWS.pdf');
    console.log('\n💡 You can now use these files for testing in Postman!');
    console.log('   Note: Open these files in a PDF viewer (not text editor) to see the readable content.');
  } catch (error) {
    console.error('❌ Error creating documents:', error);
    process.exit(1);
  }
}

createAllDocuments();

