// Script to check applicant status and portfolio company
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function checkApplicantStatus() {
  const email = 'blessingmwalein@gmail.com';
  
  try {
    console.log(`🔍 Checking applicant: ${email}\n`);
    
    // Find application
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: email
      },
      include: {
        documents: {
          select: {
            id: true,
            documentType: true,
            fileName: true,
            isSubmitted: true
          }
        },
        fund: {
          select: {
            id: true,
            name: true,
            status: true
          }
        },
        termSheet: {
          select: {
            id: true,
            status: true,
            isSigned: true,
            signedAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!application) {
      console.log('❌ No application found for this email address.');
      return;
    }

    console.log('📋 APPLICATION DETAILS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Application ID: ${application.id}`);
    console.log(`Applicant Name: ${application.applicantName}`);
    console.log(`Applicant Email: ${application.applicantEmail}`);
    console.log(`Business Name: ${application.businessName}`);
    console.log(`Current Stage: ${application.currentStage}`);
    console.log(`Screening Outcome: ${application.screeningOutcome || 'N/A'}`);
    console.log(`Initial Screening Score: ${application.initialScreeningScore || 'N/A'}`);
    console.log(`Requested Amount: $${Number(application.requestedAmount).toLocaleString()}`);
    console.log(`Industry: ${application.industry || 'N/A'}`);
    console.log(`Business Stage: ${application.businessStage || 'N/A'}`);
    console.log(`Submitted At: ${application.submittedAt ? new Date(application.submittedAt).toLocaleString() : 'N/A'}`);
    console.log(`Created At: ${new Date(application.createdAt).toLocaleString()}`);
    console.log(`Updated At: ${new Date(application.updatedAt).toLocaleString()}`);
    
    if (application.fund) {
      console.log(`\nFund: ${application.fund.name} (${application.fund.status})`);
    }
    
    if (application.termSheet) {
      console.log(`\nTerm Sheet: ${application.termSheet.status} ${application.termSheet.isSigned ? '(SIGNED)' : '(NOT SIGNED)'}`);
      if (application.termSheet.signedAt) {
        console.log(`Signed At: ${new Date(application.termSheet.signedAt).toLocaleString()}`);
      }
    }
    
    console.log(`\nDocuments: ${application.documents.length} uploaded`);
    application.documents.forEach((doc, index) => {
      console.log(`  ${index + 1}. ${doc.documentType} - ${doc.fileName} (${doc.isSubmitted ? 'Submitted' : 'Pending'})`);
    });

    // Check for portfolio company
    console.log('\n\n🏢 PORTFOLIO COMPANY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // First, check if there's a user with this email
    const user = await prisma.user.findUnique({
      where: {
        email: email
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (user) {
      console.log(`✅ User found: ${user.firstName} ${user.lastName} (ID: ${user.id})`);
      
      // Check for portfolio company by userId
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: {
          userId: user.id
        },
        include: {
          fund: {
            select: {
              id: true,
              name: true
            }
          },
          investmentImplementation: {
            select: {
              id: true,
              status: true,
              fundsDisbursed: true,
              contractsSigned: true
            }
          }
        }
      });

      if (portfolioCompany) {
        console.log(`\n✅ Portfolio Company Found!`);
        console.log(`Company ID: ${portfolioCompany.id}`);
        console.log(`Company Name: ${portfolioCompany.name}`);
        console.log(`Status: ${portfolioCompany.status}`);
        console.log(`Industry: ${portfolioCompany.industry || 'N/A'}`);
        console.log(`Registration Number: ${portfolioCompany.registrationNumber || 'N/A'}`);
        console.log(`Created At: ${new Date(portfolioCompany.createdAt).toLocaleString()}`);
        
        if (portfolioCompany.fund) {
          console.log(`\nFund: ${portfolioCompany.fund.name}`);
        }
        
        if (portfolioCompany.investmentImplementation) {
          console.log(`\nInvestment Implementation:`);
          console.log(`  Status: ${portfolioCompany.investmentImplementation.status}`);
          console.log(`  Contracts Signed: ${portfolioCompany.investmentImplementation.contractsSigned ? 'Yes' : 'No'}`);
          console.log(`  Funds Disbursed: ${portfolioCompany.investmentImplementation.fundsDisbursed ? 'Yes' : 'No'}`);
        }
      } else {
        console.log(`\n❌ No portfolio company found for this user.`);
        
        // Check if portfolio company is linked to the application instead
        const portfolioCompanyByApp = await prisma.portfolioCompany.findFirst({
          where: {
            user: {
              email: email
            }
          },
          include: {
            fund: {
              select: {
                id: true,
                name: true
              }
            },
            investmentImplementation: {
              select: {
                id: true,
                status: true,
                fundsDisbursed: true,
                contractsSigned: true
              }
            }
          }
        });
        
        if (portfolioCompanyByApp) {
          console.log(`\n✅ Portfolio Company Found (via application)!`);
          console.log(`Company ID: ${portfolioCompanyByApp.id}`);
          console.log(`Company Name: ${portfolioCompanyByApp.name}`);
          console.log(`Status: ${portfolioCompanyByApp.status}`);
          console.log(`Industry: ${portfolioCompanyByApp.industry || 'N/A'}`);
          console.log(`Registration Number: ${portfolioCompanyByApp.registrationNumber || 'N/A'}`);
          console.log(`Created At: ${new Date(portfolioCompanyByApp.createdAt).toLocaleString()}`);
          
          if (portfolioCompanyByApp.fund) {
            console.log(`\nFund: ${portfolioCompanyByApp.fund.name}`);
          }
          
          if (portfolioCompanyByApp.investmentImplementation) {
            console.log(`\nInvestment Implementation:`);
            console.log(`  Status: ${portfolioCompanyByApp.investmentImplementation.status}`);
            console.log(`  Contracts Signed: ${portfolioCompanyByApp.investmentImplementation.contractsSigned ? 'Yes' : 'No'}`);
            console.log(`  Funds Disbursed: ${portfolioCompanyByApp.investmentImplementation.fundsDisbursed ? 'Yes' : 'No'}`);
          }
        } else {
          // Check if there's an investment implementation linked to this application
          const investmentImpl = await prisma.investmentImplementation.findFirst({
            where: {
              applicationId: application.id
            },
            include: {
              portfolioCompany: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  userId: true
                }
              }
            }
          });
          
          if (investmentImpl && investmentImpl.portfolioCompany) {
            console.log(`\n✅ Investment Implementation Found!`);
            console.log(`Implementation ID: ${investmentImpl.id}`);
            console.log(`Status: ${investmentImpl.status}`);
            console.log(`\nPortfolio Company:`);
            console.log(`  ID: ${investmentImpl.portfolioCompany.id}`);
            console.log(`  Name: ${investmentImpl.portfolioCompany.name}`);
            console.log(`  Status: ${investmentImpl.portfolioCompany.status}`);
            console.log(`  User ID: ${investmentImpl.portfolioCompany.userId}`);
          } else {
            console.log(`\n⚠️  Application is at INVESTMENT_IMPLEMENTATION stage but no portfolio company found.`);
            console.log(`   This might indicate a data inconsistency.`);
          }
        }
      }
    } else {
      console.log(`❌ No user account found for this email.`);
      console.log(`   (This is normal if the applicant hasn't been approved yet)`);
    }

    // Check application stages history
    console.log('\n\n📊 APPLICATION STAGE HISTORY:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const stageHistory = await prisma.applicationStage.findMany({
      where: {
        applicationId: application.id
      },
      orderBy: {
        startDate: 'asc'
      }
    });

    if (stageHistory.length > 0) {
      stageHistory.forEach((stage, index) => {
        console.log(`${index + 1}. ${stage.stageName} - ${stage.status}`);
        console.log(`   Start: ${stage.startDate ? new Date(stage.startDate).toLocaleString() : 'N/A'}`);
        console.log(`   End: ${stage.endDate ? new Date(stage.endDate).toLocaleString() : 'N/A'}`);
        if (stage.notes) {
          console.log(`   Notes: ${stage.notes.substring(0, 100)}...`);
        }
      });
    } else {
      console.log('No stage history found.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkApplicantStatus();

