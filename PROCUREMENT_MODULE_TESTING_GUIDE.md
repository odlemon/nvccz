# Procurement Module Testing Guide

This guide provides comprehensive testing instructions for the Procurement Module API endpoints using Postman. The module covers the complete procure-to-pay (P2P) lifecycle including requisitions, purchase orders, invoices, and goods received notes.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Authentication Setup](#authentication-setup)
3. [Test Data Setup](#test-data-setup)
4. [API Endpoints Testing](#api-endpoints-testing)
5. [Complete Workflow Testing](#complete-workflow-testing)
6. [Error Handling Testing](#error-handling-testing)
7. [Integration Testing](#integration-testing)

## Prerequisites

- Postman installed
- API server running
- Valid authentication token
- Test data (vendors, currencies, departments, users)

## Authentication Setup

### 1. Login to get authentication token

**POST** `/api/auth/login`

```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user_id",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@example.com"
    }
  }
}
```

**Save the token for all subsequent requests in the Authorization header:**
- Type: Bearer Token
- Token: `{your_token_here}`

## API Endpoints Testing

### 1. Purchase Requisitions

#### Create Purchase Requisition

**POST** `/api/procurement/requisitions`

```json
{
  "title": "Office Supplies Requisition",
  "description": "Monthly office supplies for Q1 2024",
  "departmentId": "dept_id_here",
  "priority": "MEDIUM",
  "justification": "Monthly office supplies needed for operations",
  "currencyId": "currency_id_here",
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White A4 paper, 80gsm",
      "quantity": 10,
      "unitPrice": 25.50,
      "unit": "reams",
      "preferredVendorId": "vendor_id_here",
      "specifications": {
        "weight": "80gsm",
        "color": "white",
        "size": "A4"
      }
    },
    {
      "itemName": "Blue Ink Pens",
      "description": "Blue ballpoint pens",
      "quantity": 50,
      "unitPrice": 2.50,
      "unit": "pieces"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase requisition created successfully",
  "data": {
    "id": "req_id",
    "requisitionNumber": "REQ-1234567890-001",
    "title": "Office Supplies Requisition",
    "status": "DRAFT",
    "totalAmount": "525.00",
    "requestedBy": {
      "id": "user_id",
      "firstName": "Admin",
      "lastName": "User"
    },
    "items": [...]
  }
}
```

#### Get All Purchase Requisitions

**GET** `/api/procurement/requisitions`

**Query Parameters:**
- `status`: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CONVERTED_TO_PO
- `departmentId`: Filter by department
- `priority`: LOW, MEDIUM, HIGH, URGENT
- `limit`: Number of items (default: 50)
- `offset`: Skip items (default: 0)

**Example:** `/api/procurement/requisitions?status=DRAFT&limit=10`

#### Get Purchase Requisition by ID

**GET** `/api/procurement/requisitions/{id}`

#### Submit Purchase Requisition for Approval

**PUT** `/api/procurement/requisitions/{id}/submit`

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase requisition submitted for approval",
  "data": {
    "id": "req_id",
    "status": "PENDING_APPROVAL"
  }
}
```

#### Approve Purchase Requisition

**PUT** `/api/procurement/requisitions/{id}/approve`

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase requisition approved successfully",
  "data": {
    "id": "req_id",
    "status": "APPROVED",
    "approvedBy": {
      "id": "user_id",
      "firstName": "Admin",
      "lastName": "User"
    },
    "approvedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Purchase Orders

#### Create Purchase Order

**POST** `/api/procurement/purchase-orders`

```json
{
  "requisitionId": "req_id_here",
  "vendorId": "vendor_id_here",
  "priority": "MEDIUM",
  "currencyId": "currency_id_here",
  "expectedDeliveryDate": "2024-02-15T00:00:00.000Z",
  "shippingAddress": "123 Company Street, City, Country",
  "paymentTerms": "Net 30",
  "deliveryTerms": "FOB",
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White A4 paper, 80gsm",
      "quantity": 10,
      "unitPrice": 25.50,
      "unit": "reams",
      "specifications": {
        "weight": "80gsm",
        "color": "white",
        "size": "A4"
      }
    },
    {
      "itemName": "Blue Ink Pens",
      "description": "Blue ballpoint pens",
      "quantity": 50,
      "unitPrice": 2.50,
      "unit": "pieces"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase order created successfully",
  "data": {
    "id": "po_id",
    "poNumber": "PO-1234567890-001",
    "status": "DRAFT",
    "totalAmount": "603.75",
    "subtotal": "525.00",
    "taxAmount": "78.75",
    "vendor": {
      "id": "vendor_id",
      "name": "Test Vendor Ltd"
    },
    "items": [...]
  }
}
```

#### Get All Purchase Orders

**GET** `/api/procurement/purchase-orders`

**Query Parameters:**
- `status`: DRAFT, SENT, ACKNOWLEDGED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
- `vendorId`: Filter by vendor
- `priority`: LOW, MEDIUM, HIGH, URGENT

### 3. Procurement Invoices

#### Create Procurement Invoice

**POST** `/api/procurement/invoices`

```json
{
  "purchaseOrderId": "po_id_here",
  "vendorId": "vendor_id_here",
  "invoiceDate": "2024-01-15T00:00:00.000Z",
  "dueDate": "2024-02-14T00:00:00.000Z",
  "currencyId": "currency_id_here",
  "documentPath": "/uploads/invoices/inv-2024-001.pdf",
  "documentType": "PDF",
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White A4 paper, 80gsm",
      "quantity": 10,
      "unitPrice": 25.50,
      "unit": "reams"
    },
    {
      "itemName": "Blue Ink Pens",
      "description": "Blue ballpoint pens",
      "quantity": 50,
      "unitPrice": 2.50,
      "unit": "pieces"
    }
  ]
}
```

#### Process OCR Data

**POST** `/api/procurement/invoices/{invoiceId}/ocr`

```json
{
  "invoiceNumber": "INV-2024-001",
  "invoiceDate": "2024-01-15",
  "vendorName": "Test Vendor Ltd",
  "vendorAddress": "123 Vendor Street, City, Country",
  "subtotal": 525.00,
  "taxAmount": 78.75,
  "totalAmount": 603.75,
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White A4 paper, 80gsm",
      "quantity": 10,
      "unitPrice": 25.50,
      "totalPrice": 255.00,
      "unit": "reams"
    },
    {
      "itemName": "Blue Ink Pens",
      "description": "Blue ballpoint pens",
      "quantity": 50,
      "unitPrice": 2.50,
      "totalPrice": 125.00,
      "unit": "pieces"
    }
  ]
}
```

#### Perform AI Matching

**POST** `/api/procurement/invoices/{invoiceId}/ai-matching`

```json
{
  "matched": true,
  "matchScore": 95.5,
  "discrepancies": [
    {
      "type": "PRICE_VARIANCE",
      "description": "Unit price differs by $0.10",
      "severity": "LOW"
    }
  ]
}
```

#### Approve Procurement Invoice

**PUT** `/api/procurement/invoices/{id}/approve`

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement invoice approved successfully",
  "data": {
    "id": "invoice_id",
    "status": "APPROVED",
    "journalEntry": {
      "id": "je_id",
      "referenceNumber": "JE-1234567890-001",
      "status": "PENDING"
    }
  }
}
```

#### Get All Procurement Invoices

**GET** `/api/procurement/invoices`

**Query Parameters:**
- `status`: RECEIVED, PROCESSING, MATCHED, DISCREPANCY, APPROVED, PAID, REJECTED
- `vendorId`: Filter by vendor
- `matchingStatus`: PENDING, MATCHED, DISCREPANCY, MANUAL_REVIEW

### 4. Goods Received Notes

#### Create Goods Received Note

**POST** `/api/procurement/goods-received-notes`

```json
{
  "purchaseOrderId": "po_id_here",
  "items": [
    {
      "purchaseOrderItemId": "po_item_id_1",
      "quantityReceived": 10,
      "quantityAccepted": 10,
      "quantityRejected": 0,
      "qualityStatus": "PASSED",
      "qualityNotes": "All items in good condition"
    },
    {
      "purchaseOrderItemId": "po_item_id_2",
      "quantityReceived": 50,
      "quantityAccepted": 48,
      "quantityRejected": 2,
      "qualityStatus": "CONDITIONAL",
      "qualityNotes": "2 pens damaged, rest acceptable"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Goods received note created successfully",
  "data": {
    "id": "grn_id",
    "grnNumber": "GRN-1234567890-001",
    "status": "RECEIVED",
    "qualityStatus": "PENDING",
    "purchaseOrder": {
      "id": "po_id",
      "poNumber": "PO-1234567890-001",
      "status": "RECEIVED"
    },
    "items": [...]
  }
}
```


## Complete Workflow Testing

### End-to-End Procurement Process

1. **Create Requisition**
   - POST `/api/procurement/requisitions`
   - Verify status is "DRAFT"

2. **Submit Requisition for Approval**
   - PUT `/api/procurement/requisitions/{id}/submit`
   - Verify status changes to "PENDING_APPROVAL"

3. **Approve Requisition**
   - PUT `/api/procurement/requisitions/{id}/approve`
   - Verify status changes to "APPROVED"

3. **Create Purchase Order**
   - POST `/api/procurement/purchase-orders`
   - Link to approved requisition
   - Verify PO is created with correct items

4. **Create Invoice**
   - POST `/api/procurement/invoices`
   - Link to purchase order
   - Verify invoice is created

5. **Process OCR Data**
   - POST `/api/procurement/invoices/{id}/ocr`
   - Verify OCR data is processed

6. **Perform AI Matching**
   - POST `/api/procurement/invoices/{id}/ai-matching`
   - Verify matching results

7. **Approve Invoice**
   - PUT `/api/procurement/invoices/{id}/approve`
   - Verify journal entry is created

8. **Create GRN**
   - POST `/api/procurement/goods-received-notes`
   - Verify goods receipt is recorded

