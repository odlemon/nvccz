# Investment Module API Documentation

This document provides comprehensive API documentation for the Investment Module, covering the complete investment workflow from application submission to board review and final investment decisions.

## Table of Contents
1. [Overview](#overview)
2. [Investment Workflow](#investment-workflow)
3. [API Endpoints](#api-endpoints)
4. [Request/Response Examples](#requestresponse-examples)
5. [Error Handling](#error-handling)
6. [Testing Guide](#testing-guide)

## Overview

The Investment Module manages the complete investment process for NVCCZ, including:
- **Application Management**: Investment application submission and tracking
- **Due Diligence Process**: Comprehensive due diligence workflow
- **Board Review Process**: Investment committee review and decision making
- **Investment Implementation**: Post-approval investment execution
- **Portfolio Management**: Ongoing portfolio company management

### Key Features
- Complete investment lifecycle management
- Multi-stage application workflow
- Board review and decision tracking
- Investment implementation tracking
- Portfolio company management
- Comprehensive reporting and analytics

## Investment Workflow

### 1. Application Stage
```
Application Submission → Initial Review → Due Diligence → Board Review → Investment Decision
```

### 2. Investment Decision Options
- **Investment Approved** → Proceeds to implementation
- **Investment Rejected** → Application closed
- **Conditional Approval** → Requires additional conditions

### 3. Post-Approval Process
```
Investment Implementation → Portfolio Management → Ongoing Monitoring
```

## API Endpoints

### **Application Management**

#### Create Investment Application
```http
POST /api/applications
```

**Request Body:**
```json
{
  "companyName": "TechStartup Ltd",
  "businessDescription": "AI-powered fintech solution",
  "investmentAmount": 500000,
  "equityOffered": 15.5,
  "valuation": 3200000,
  "stage": "EARLY_STAGE",
  "sector": "TECHNOLOGY",
  "contactPerson": "John Doe",
  "email": "john@techstartup.com",
  "phone": "+263771234567",
  "businessPlan": "base64_encoded_file_content",
  "financialProjections": "base64_encoded_file_content"
}
```

#### Get All Applications
```http
GET /api/applications
```

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)
- `stage` - Filter by application stage
- `sector` - Filter by business sector
- `status` - Filter by application status

#### Get Application by ID
```http
GET /api/applications/{applicationId}
```

#### Update Application
```http
PUT /api/applications/{applicationId}
```

#### Delete Application
```http
DELETE /api/applications/{applicationId}
```

### **Due Diligence Management**

#### Create Due Diligence
```http
POST /api/due-diligence
```

**Request Body:**
```json
{
  "applicationId": "app_123",
  "dueDiligenceType": "FINANCIAL",
  "assignedTo": "user_id",
  "priority": "HIGH",
  "deadline": "2024-02-15T00:00:00Z",
  "requirements": [
    "Financial statements for last 3 years",
    "Tax compliance certificates",
    "Audit reports"
  ],
  "notes": "Focus on revenue growth and market expansion plans"
}
```

#### Get Due Diligence by Application
```http
GET /api/due-diligence/application/{applicationId}
```

#### Update Due Diligence
```http
PUT /api/due-diligence/{dueDiligenceId}
```

#### Complete Due Diligence
```http
POST /api/due-diligence/{dueDiligenceId}/complete
```

**Request Body:**
```json
{
  "findings": "Strong financial position with consistent growth",
  "recommendations": "Proceed to board review",
  "riskAssessment": "LOW",
  "complianceStatus": "COMPLIANT",
  "attachments": ["report1.pdf", "analysis.xlsx"]
}
```

### **Board Review Management**

#### Create Board Review
```http
POST /api/board-reviews
```

**Request Body:**
```json
{
  "applicationId": "app_123",
  "investmentApproved": true,
  "recommendationReport": "Based on our analysis, we recommend approving this investment...",
  "decisionReason": "Strong market potential and solid financial projections",
  "nextSteps": "Proceed to term sheet negotiation",
  "overallScore": 85.5,
  "finalComments": "Strong recommendation for approval based on market analysis and team capabilities"
}
```

#### Get Board Review by Application
```http
GET /api/board-reviews/application/{applicationId}
```

#### Update Board Review
```http
PUT /api/board-reviews/application/{applicationId}
```

#### Complete Board Review
```http
POST /api/board-reviews/application/{applicationId}/complete
```

#### Get All Board Reviews
```http
GET /api/board-reviews
```

**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `status` - Filter by review status
- `decision` - Filter by investment decision

#### Get My Board Reviews
```http
GET /api/board-reviews/my
```

#### Get Board Review Summary
```http
GET /api/board-reviews/summary
```

### **Investment Implementation**

#### Create Investment Implementation
```http
POST /api/investment-implementation
```

**Request Body:**
```json
{
  "applicationId": "app_123",
  "investmentAmount": 500000,
  "equityPercentage": 15.5,
  "implementationDate": "2024-03-01T00:00:00Z",
  "fundId": "fund_123",
  "terms": {
    "boardSeats": 1,
    "votingRights": true,
    "antiDilution": true
  },
  "milestones": [
    {
      "description": "Product launch",
      "targetDate": "2024-06-01T00:00:00Z",
      "successMetrics": "10,000 active users"
    }
  ]
}
```

#### Get Investment Implementation
```http
GET /api/investment-implementation/{implementationId}
```

#### Update Investment Implementation
```http
PUT /api/investment-implementation/{implementationId}
```

#### Get All Investment Implementations
```http
GET /api/investment-implementation
```

### **Portfolio Management**

#### Create Portfolio Company
```http
POST /api/portfolio-companies
```

**Request Body:**
```json
{
  "companyName": "TechStartup Ltd",
  "sector": "TECHNOLOGY",
  "investmentDate": "2024-03-01T00:00:00Z",
  "investmentAmount": 500000,
  "equityPercentage": 15.5,
  "valuation": 3200000,
  "contactPerson": "John Doe",
  "email": "john@techstartup.com",
  "phone": "+263771234567",
  "address": "123 Tech Street, Harare",
  "website": "https://techstartup.com"
}
```

#### Get Portfolio Companies
```http
GET /api/portfolio-companies
```

#### Get Portfolio Company by ID
```http
GET /api/portfolio-companies/{companyId}
```

#### Update Portfolio Company
```http
PUT /api/portfolio-companies/{companyId}
```

### **Fund Management**

#### Create Fund
```http
POST /api/funds
```

**Request Body:**
```json
{
  "fundName": "NVCCZ Growth Fund I",
  "fundType": "GROWTH",
  "targetSize": 10000000,
  "committedCapital": 5000000,
  "launchDate": "2024-01-01T00:00:00Z",
  "closeDate": "2026-12-31T00:00:00Z",
  "managementFee": 2.0,
  "carriedInterest": 20.0,
  "description": "Growth capital fund focusing on technology startups"
}
```

#### Get All Funds
```http
GET /api/funds
```

#### Get Fund by ID
```http
GET /api/funds/{fundId}
```

#### Update Fund
```http
PUT /api/funds/{fundId}
```

### **Term Sheet Management**

#### Create Term Sheet
```http
POST /api/term-sheets
```

**Request Body:**
```json
{
  "applicationId": "app_123",
  "investmentAmount": 500000,
  "equityPercentage": 15.5,
  "preMoneyValuation": 2700000,
  "postMoneyValuation": 3200000,
  "liquidationPreference": "1x",
  "antiDilution": "Weighted Average",
  "boardSeats": 1,
  "votingRights": true,
  "dragAlong": true,
  "tagAlong": true,
  "informationRights": true,
  "registrationRights": true,
  "expiryDate": "2024-04-01T00:00:00Z"
}
```

#### Get Term Sheet by Application
```http
GET /api/term-sheets/application/{applicationId}
```

#### Update Term Sheet
```http
PUT /api/term-sheets/{termSheetId}
```

#### Approve Term Sheet
```http
POST /api/term-sheets/{termSheetId}/approve
```

## Request/Response Examples

### **Application Creation Response**
```json
{
  "success": true,
  "message": "Application created successfully",
  "data": {
    "id": "app_123",
    "companyName": "TechStartup Ltd",
    "businessDescription": "AI-powered fintech solution",
    "investmentAmount": 500000,
    "equityOffered": 15.5,
    "valuation": 3200000,
    "stage": "EARLY_STAGE",
    "sector": "TECHNOLOGY",
    "status": "SUBMITTED",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### **Board Review Creation Response**
```json
{
  "success": true,
  "message": "Board review created successfully",
  "data": {
    "id": "br_123",
    "applicationId": "app_123",
    "investmentApproved": true,
    "recommendationReport": "Based on our analysis, we recommend approving this investment...",
    "decisionReason": "Strong market potential and solid financial projections",
    "nextSteps": "Proceed to term sheet negotiation",
    "overallScore": 85.5,
    "finalComments": "Strong recommendation for approval based on market analysis and team capabilities",
    "status": "COMPLETED",
    "createdAt": "2024-02-01T14:30:00Z",
    "completedAt": "2024-02-01T16:45:00Z"
  }
}
```

### **Investment Implementation Response**
```json
{
  "success": true,
  "message": "Investment implementation created successfully",
  "data": {
    "id": "impl_123",
    "applicationId": "app_123",
    "investmentAmount": 500000,
    "equityPercentage": 15.5,
    "implementationDate": "2024-03-01T00:00:00Z",
    "fundId": "fund_123",
    "status": "ACTIVE",
    "createdAt": "2024-02-15T09:00:00Z"
  }
}
```

## Error Handling

### **Common Error Responses**

#### 400 Bad Request
```json
{
  "success": false,
  "message": "Invalid request data",
  "error": "Validation failed",
  "details": {
    "field": "investmentAmount",
    "message": "Investment amount must be greater than 0"
  }
}
```

#### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized access",
  "error": "Invalid or expired token"
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied",
  "error": "Insufficient permissions for this operation"
}
```

#### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found",
  "error": "Application with ID 'app_123' not found"
}
```

#### 409 Conflict
```json
{
  "success": false,
  "message": "Resource conflict",
  "error": "Board review already exists for this application"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "Database connection failed"
}
```

## Testing Guide

### **Prerequisites**
1. Server running on `http://localhost:3000`
2. Valid JWT token for authentication
3. Test data setup (users, applications, etc.)

### **Test Scenarios**

#### 1. Complete Investment Workflow Test
```bash
# 1. Create application
curl -X POST http://localhost:3000/api/applications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "companyName": "Test Company",
    "businessDescription": "Test business",
    "investmentAmount": 100000,
    "equityOffered": 10.0,
    "valuation": 1000000
  }'

# 2. Create due diligence
curl -X POST http://localhost:3000/api/due-diligence \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "applicationId": "app_id",
    "dueDiligenceType": "FINANCIAL",
    "priority": "HIGH"
  }'

# 3. Complete due diligence
curl -X POST http://localhost:3000/api/due-diligence/dd_id/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "findings": "Positive findings",
    "recommendations": "Proceed to board review",
    "riskAssessment": "LOW"
  }'

# 4. Create board review
curl -X POST http://localhost:3000/api/board-reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "applicationId": "app_id",
    "investmentApproved": true,
    "recommendationReport": "Approved for investment",
    "overallScore": 85.0
  }'

# 5. Create investment implementation
curl -X POST http://localhost:3000/api/investment-implementation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "applicationId": "app_id",
    "investmentAmount": 100000,
    "equityPercentage": 10.0,
    "implementationDate": "2024-03-01T00:00:00Z"
  }'
```

#### 2. Board Review Decision Test
```bash
# Test Investment Approval
curl -X POST http://localhost:3000/api/board-reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "applicationId": "app_123",
    "investmentApproved": true,
    "recommendationReport": "Strong recommendation for approval",
    "overallScore": 90.0
  }'

# Test Investment Rejection
curl -X POST http://localhost:3000/api/board-reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "applicationId": "app_456",
    "investmentRejected": true,
    "recommendationReport": "Risk factors outweigh benefits",
    "overallScore": 30.0
  }'

# Test Conditional Approval
curl -X POST http://localhost:3000/api/board-reviews \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "applicationId": "app_789",
    "conditionalApproval": true,
    "recommendationReport": "Conditional approval with requirements",
    "conditions": "Provide updated financial projections",
    "overallScore": 65.0
  }'
```

### **Test Data Setup**
```bash
# Create test fund
curl -X POST http://localhost:3000/api/funds \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "fundName": "Test Fund",
    "fundType": "GROWTH",
    "targetSize": 1000000,
    "launchDate": "2024-01-01T00:00:00Z"
  }'
```

## Authentication

All API endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

## Rate Limiting

API requests are rate-limited to prevent abuse:
- **General endpoints**: 100 requests per minute
- **File upload endpoints**: 10 requests per minute
- **Search endpoints**: 50 requests per minute

## Pagination

List endpoints support pagination:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10, max: 100)

**Response format:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

## File Uploads

File uploads are supported for:
- Business plans
- Financial projections
- Due diligence documents
- Board review attachments

**Upload format:**
```json
{
  "file": "base64_encoded_content",
  "fileName": "document.pdf",
  "fileType": "application/pdf"
}
```

## Webhooks

The system supports webhooks for:
- Application status changes
- Board review completions
- Investment implementation updates
- Portfolio company milestones

**Webhook payload:**
```json
{
  "event": "application.status_changed",
  "data": {
    "applicationId": "app_123",
    "oldStatus": "SUBMITTED",
    "newStatus": "UNDER_DUE_DILIGENCE",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

## Support

For technical support or questions about the Investment Module API:
- **Email**: support@nvccz.co.zw
- **Documentation**: http://localhost:3000/api-docs
- **Status Page**: http://status.nvccz.co.zw

---

*This documentation is automatically generated and updated with each API version release.*


