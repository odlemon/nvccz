# Investment Module Email Notifications Implementation

## Overview

This document outlines the comprehensive email notification system implemented for the NVCCZ Investment Module. The system automatically sends email notifications to applicants at each stage of the investment process, keeping them informed about their application status.

## Email Service Configuration

### ZeptoMail Integration
- **Service**: ZeptoMail API
- **From Address**: `noreply@lysp.io`
- **From Name**: "NVCCZ Investment Team"
- **API Token**: Configured in `EmailNotificationService.ts`

### Email Service Location
- **File**: `src/services/EmailNotificationService.ts`
- **Class**: `EmailNotificationService`
- **Integration**: Imported into all relevant controllers

## Email Notification Flow

### 1. Application Received (Initial Stage)
**Trigger**: When a new investment application is submitted
**Controller**: `ApplicationController.createApplication()`
**Email Method**: `sendApplicationReceivedEmail()`

**Email Content**:
- Confirmation of application receipt
- Application ID and business details
- Next steps in the process
- Timeline expectations (2-3 weeks)

### 2. Due Diligence Started
**Trigger**: When due diligence process is initiated
**Controller**: `DueDiligenceController.initiateDueDiligence()`
**Email Method**: `sendDueDiligenceStartedEmail()`

**Email Content**:
- Notification that due diligence has begun
- Explanation of due diligence process
- What to expect during this stage
- Timeline (2-3 weeks)

### 3. Due Diligence Completed
**Trigger**: When due diligence process is completed
**Controller**: `DueDiligenceController.completeDueDiligence()`
**Email Method**: `sendDueDiligenceCompletedEmail()`

**Email Content**:
- Confirmation of due diligence completion
- Next step: Board review
- Timeline for board review (1-2 weeks)

### 4. Board Review Started
**Trigger**: When board review process begins
**Controller**: `BoardReviewController.createBoardReview()`
**Email Method**: `sendBoardReviewStartedEmail()`

**Email Content**:
- Notification that board review has started
- Explanation of board review process
- Final decision timeline (1-2 weeks)

### 5. Investment Decision
**Trigger**: When board review is completed with a decision
**Controller**: `BoardReviewController.completeBoardReview()`
**Email Method**: `sendInvestmentDecisionEmail()`

**Email Content** (varies by decision):
- **Approved**: Congratulations, next steps for implementation
- **Rejected**: Decision notification with encouragement to reapply
- **Conditional**: Conditional approval with next steps

### 6. Investment Implementation Started
**Trigger**: When investment implementation begins
**Controller**: `InvestmentImplementationController.initiateInvestmentImplementation()`
**Email Method**: `sendInvestmentImplementationStartedEmail()`

**Email Content**:
- Welcome to NVCCZ portfolio
- Implementation process overview
- Next steps and timeline
- Contact information for support

### 7. General Stage Updates
**Trigger**: For any other stage changes
**Controller**: `ApplicationController.changeApplicationStage()`
**Email Method**: `sendStageUpdateEmail()`

**Email Content**:
- Generic stage update notification
- Current status information
- Next steps

## Technical Implementation

### Email Service Structure

```typescript
export class EmailNotificationService {
  // Application received email
  static async sendApplicationReceivedEmail(data: EmailNotificationData): Promise<void>
  
  // Due diligence emails
  static async sendDueDiligenceStartedEmail(data: EmailNotificationData): Promise<void>
  static async sendDueDiligenceCompletedEmail(data: EmailNotificationData): Promise<void>
  
  // Board review emails
  static async sendBoardReviewStartedEmail(data: EmailNotificationData): Promise<void>
  static async sendInvestmentDecisionEmail(data: EmailNotificationData): Promise<void>
  
  // Implementation emails
  static async sendInvestmentImplementationStartedEmail(data: EmailNotificationData): Promise<void>
  
  // Generic stage updates
  static async sendStageUpdateEmail(data: EmailNotificationData): Promise<void>
}
```

### Email Data Interface

```typescript
export interface EmailNotificationData {
  applicantName: string;
  applicantEmail: string;
  businessName: string;
  applicationId: string;
  currentStage: string;
  additionalInfo?: any;
}
```

### Email Templates

All email templates are HTML-based with:
- **Responsive Design**: Works on desktop and mobile
- **Branding**: NVCCZ colors and styling
- **Professional Layout**: Clean, professional appearance
- **Dynamic Content**: Personalized with applicant and business information

#### Template Features:
- **Header**: NVCCZ branding with stage-specific titles
- **Content**: Stage-specific information and next steps
- **Footer**: Contact information and legal disclaimers
- **Styling**: Consistent color scheme and typography

## Integration Points

### Controllers Updated:
1. **ApplicationController.ts**
   - `createApplication()` - Application received email
   - `changeApplicationStage()` - Stage-specific emails

2. **DueDiligenceController.ts**
   - `initiateDueDiligence()` - Due diligence started email
   - `completeDueDiligence()` - Due diligence completed email

3. **BoardReviewController.ts**
   - `createBoardReview()` - Board review started email
   - `completeBoardReview()` - Investment decision email

4. **InvestmentImplementationController.ts**
   - `initiateInvestmentImplementation()` - Implementation started email

### Error Handling

All email notifications include:
- **Try-catch blocks**: Prevent email failures from breaking main processes
- **Logging**: Success and error logging for monitoring
- **Graceful degradation**: Main processes continue even if emails fail

### Logging

Email notifications are logged with:
- **Success logs**: Confirmation of email delivery
- **Error logs**: Detailed error information for debugging
- **Context**: Application ID, applicant email, and stage information

## Email Content Examples

### Application Received Email
```
Subject: Investment Application Received - NVCCZ

Dear [Applicant Name],

Thank you for submitting your investment application for [Business Name]. 
We have successfully received your application and it is now under review.

Application Details:
- Application ID: [ID]
- Business Name: [Business Name]
- Current Status: Application Received
- Date Submitted: [Date]

What happens next?
1. Initial Review - We'll assess your application completeness
2. Due Diligence - Detailed analysis of your business
3. Board Review - Investment committee evaluation
4. Final Decision - Investment approval or feedback

We typically review applications within 2-3 weeks. You will receive 
email updates at each stage of the process.

Best regards,
NVCCZ Investment Team
```

### Investment Decision Email (Approved)
```
Subject: Investment Decision Update - NVCCZ

Dear [Applicant Name],

Congratulations! We are pleased to inform you that your investment 
application has been approved. Our team will contact you shortly to 
discuss the next steps in the investment process.

Application Details:
- Application ID: [ID]
- Business Name: [Business Name]
- Decision: Investment Approved
- Decision Date: [Date]

You will receive detailed information about the investment terms, 
timeline, and implementation process.

Welcome to the NVCCZ portfolio!

Best regards,
NVCCZ Investment Team
```

## Configuration

### Environment Variables
- **ZeptoMail API Token**: Configured in the service
- **From Address**: `noreply@lysp.io`
- **From Name**: "NVCCZ Investment Team"

### Dependencies
- **zeptomail**: Email service package
- **@prisma/client**: Database access for application data

## Testing

### Manual Testing
1. Submit a new application
2. Check email delivery
3. Verify email content and formatting
4. Test all stage transitions

### Automated Testing
- Email service unit tests
- Integration tests with controllers
- Error handling tests

## Monitoring

### Email Delivery Monitoring
- Success/failure rates
- Delivery times
- Bounce rates
- Spam complaints

### Application Process Monitoring
- Stage transition tracking
- Email notification timing
- User engagement metrics

## Future Enhancements

### Potential Improvements
1. **Email Templates**: More sophisticated templates with images
2. **Personalization**: Dynamic content based on applicant profile
3. **Multi-language**: Support for multiple languages
4. **SMS Notifications**: Additional notification channels
5. **Email Preferences**: User-configurable notification settings

### Analytics Integration
- Email open rates
- Click-through rates
- User engagement metrics
- Process completion rates

## Troubleshooting

### Common Issues
1. **Email Delivery Failures**: Check ZeptoMail API status
2. **Template Rendering**: Verify HTML template syntax
3. **Data Issues**: Ensure application data is complete
4. **Rate Limiting**: Monitor API usage limits

### Debugging Steps
1. Check application logs for email errors
2. Verify email service configuration
3. Test email delivery manually
4. Review template content

## Security Considerations

### Data Protection
- Email addresses are handled securely
- No sensitive data in email content
- Compliance with data protection regulations

### Email Security
- SPF/DKIM records for email authentication
- Secure email transmission
- Protection against email spoofing

---

*This implementation provides comprehensive email notifications for the entire investment process, ensuring applicants are kept informed at every stage.*
