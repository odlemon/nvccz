const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createCompanyProfileForApplication(applicationId) {
  try {
    console.log(`Creating company profile for application: ${applicationId}`);
    
    // Get the application details
    const application = await prisma.application.findUnique({
      where: { id: applicationId }
    });

    if (!application) {
      console.error(`Application with ID ${applicationId} not found`);
      return;
    }

    console.log('Application found:', {
      id: application.id,
      applicantName: application.applicantName,
      applicantEmail: application.applicantEmail,
      businessName: application.businessName,
      industry: application.industry
    });

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: application.applicantEmail }
    });

    if (existingUser) {
      console.log(`User with email ${application.applicantEmail} already exists, skipping user creation`);
      console.log('Existing user ID:', existingUser.id);
      return;
    }

    // Create user account
    const password = "password123";
    const hashedPassword = await bcrypt.hash(password, 12);

    // Get or create applicant role
    let applicantRole = await prisma.role.findUnique({
      where: { name: "applicant" }
    });

    if (!applicantRole) {
      applicantRole = await prisma.role.create({
        data: {
          name: "applicant",
          description: "Applicant user role - can create and manage company profiles",
          permissions: {
            "portfolio_company": ["read", "write"],
            "profile": ["read", "write"],
            "applications": ["read", "write"],
            "term_sheets": ["read", "write"]
          }
        }
      });
      console.log('Created applicant role:', applicantRole.id);
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        firstName: application.applicantName.split(' ')[0] || application.applicantName,
        lastName: application.applicantName.split(' ').slice(1).join(' ') || '',
        email: application.applicantEmail,
        password: hashedPassword,
        roleId: applicantRole.id
      }
    });

    console.log('Created user account:', {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: password
    });

    // Create portfolio company
    const portfolioCompany = await prisma.portfolioCompany.create({
      data: {
        userId: user.id,
        name: application.businessName,
        registrationNumber: `REG-${Date.now()}`,
        industry: application.industry,
        foundingDate: application.foundingDate || new Date(),
        address: application.applicantAddress,
        website: null,
        description: application.businessDescription,
        logoUrl: null,
        status: "PENDING",
        companySize: application.businessStage === 'STARTUP' ? 'SMALL' :
                    application.businessStage === 'OPERATIONAL' ? 'MEDIUM' : 'SMALL',
        employeeCount: null,
        annualRevenue: null,
        fundingStage: "SEED",
        contactPerson: application.applicantName,
        contactPhone: application.applicantPhone,
        contactEmail: application.applicantEmail,
        socialMedia: {}
      }
    });

    console.log('Created portfolio company:', {
      id: portfolioCompany.id,
      name: portfolioCompany.name,
      userId: portfolioCompany.userId,
      industry: portfolioCompany.industry,
      status: portfolioCompany.status
    });

    // Create notification
    await prisma.applicationNotification.create({
      data: {
        applicationId: application.id,
        recipientEmail: application.applicantEmail,
        recipientPhone: application.applicantPhone,
        notificationType: "ACCOUNT_CREATED",
        title: "Account Created",
        message: `Your account has been created successfully. You can now log in to view and sign the term sheet. Your password is: ${password}. Please change your password after logging in.`
      }
    });

    console.log('Created notification for account creation');

    console.log('\n=== SUMMARY ===');
    console.log(`✅ User Account Created:`);
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Password: ${password}`);
    console.log(`   - Role: ${applicantRole.name}`);
    
    console.log(`\n✅ Portfolio Company Created:`);
    console.log(`   - ID: ${portfolioCompany.id}`);
    console.log(`   - Name: ${portfolioCompany.name}`);
    console.log(`   - Industry: ${portfolioCompany.industry}`);
    console.log(`   - Status: ${portfolioCompany.status}`);
    
    console.log(`\n✅ Notification Sent`);
    console.log(`\n🎉 Company profile creation completed successfully!`);
    console.log(`\n📝 Login Credentials:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: ${password}`);

  } catch (error) {
    console.error('Error creating company profile:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get application ID from command line argument
const applicationId = process.argv[2];

if (!applicationId) {
  console.error('Please provide an application ID as an argument');
  console.log('Usage: node create-company-profile.js <applicationId>');
  process.exit(1);
}

// Run the script
createCompanyProfileForApplication(applicationId);
