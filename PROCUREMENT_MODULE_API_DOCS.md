

---

## Approval Configuration

The approval system uses a single configuration that defines approval steps for all procurement stages. This allows organizations to configure different approval workflows for each stage type.

### Create Approval Configuration

**POST** `/api/procurement-approval-configs`

Creates a new procurement approval configuration that defines approval steps for all procurement stages.

**Request Body:**
```json
{
  "name": "Main Procurement Approval Config",
  "description": "Default approval configuration for all procurement stages",
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Department Head Approval",
          "stepType": "DEPARTMENT",
          "departmentId": "dept_id",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "Finance Manager Approval",
          "stepType": "ROLE",
          "roleId": "finance_manager_role_id",
          "isRequired": true,
          "canDelegate": true,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    },
    {
      "stageType": "PURCHASE_ORDER",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Manager Approval",
          "stepType": "DEPARTMENT",
          "departmentId": "dept_id",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "CEO Approval",
          "stepType": "USER",
          "userId": "ceo_user_id",
          "isRequired": true,
          "canDelegate": true,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    },
    {
      "stageType": "INVOICE",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Approval",
          "stepType": "ROLE",
          "roleId": "finance_role_id",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    },
    {
      "stageType": "GRN",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Warehouse Manager Approval",
          "stepType": "ROLE",
          "roleId": "warehouse_manager_role_id",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Procurement approval configuration created successfully",
  "data": {
    "id": "config_id",
    "name": "Main Procurement Approval Config",
    "description": "Default approval configuration for all procurement stages",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "stages": [
      {
        "id": "stage_id",
        "stageType": "PURCHASE_REQUISITION",
        "stepNumber": 1,
        "stepName": "Department Head Approval",
        "stepType": "DEPARTMENT",
        "department": {
          "id": "dept_id",
          "name": "Finance Department"
        }
      }
    ]
  }
}
```

### Get All Approval Configurations

**GET** `/api/procurement-approval-configs`

Retrieves all procurement approval configurations.

**Response:**
```json
{
  "success": true,
  "message": "Procurement approval configurations retrieved successfully",
  "data": [
    {
      "id": "config_id",
      "name": "Main Procurement Approval Config",
      "description": "Default approval configuration for all procurement stages",
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "stages": [...]
    }
  ]
}
```

### Get Active Approval Configuration

**GET** `/api/procurement-approval-configs/active`

Retrieves the currently active approval configuration.

**Response:**
```json
{
  "success": true,
  "message": "Active procurement approval configuration retrieved successfully",
  "data": {
    "id": "config_id",
    "name": "Main Procurement Approval Config",
    "isActive": true,
    "stages": [...]
  }
}
```

### Get Approval Steps for Stage

**GET** `/api/procurement-approval-configs/stages/{stageType}/steps`

Retrieves approval steps for a specific stage type.

**Parameters:**
- `stageType` (path): Stage type (`PURCHASE_REQUISITION`, `PURCHASE_ORDER`, `INVOICE`, `GRN`)

**Response:**
```json
{
  "success": true,
  "message": "Approval steps for PURCHASE_REQUISITION retrieved successfully",
  "data": [
    {
      "id": "step_id",
      "stepNumber": 1,
      "stepName": "Department Head Approval",
      "stepType": "DEPARTMENT",
      "department": {
        "id": "dept_id",
        "name": "Finance Department"
      }
    }
  ]
}
```

---

## Purchase Requisitions

### Create Purchase Requisition

**POST** `/api/procurement/requisitions`

Creates a new purchase requisition. The system will automatically trigger the approval workflow based on the active configuration.

**Request Body:**
```json
{
  "title": "Office Supplies Request",
  "description": "Monthly office supplies for the finance department",
  "departmentId": "dept_id",
  "priority": "MEDIUM",
  "justification": "Monthly office supplies needed for daily operations",
  "currencyId": "currency_id",
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White A4 paper, 80gsm",
      "quantity": 10,
      "unitPrice": 15.50,
      "unit": "ream",
      "preferredVendorId": "vendor_id",
      "specifications": {
        "brand": "Any",
        "color": "White",
        "weight": "80gsm"
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Purchase requisition created successfully",
  "data": {
    "id": "req_id",
    "requisitionNumber": "PR-2024-001",
    "title": "Office Supplies Request",
    "status": "DRAFT",
    "totalAmount": 155.00,
    "items": [...],
    "approvalRequest": {
      "id": "approval_req_id",
      "status": "PENDING",
      "currentStep": 1,
      "totalSteps": 2
    }
  }
}
```

### Get All Purchase Requisitions

**GET** `/api/procurement/requisitions`

Retrieves all purchase requisitions with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by status (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CONVERTED_TO_PO`)
- `departmentId` (optional): Filter by department
- `requestedById` (optional): Filter by requester
- `priority` (optional): Filter by priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`)
- `limit` (optional): Number of items to return (default: 50)
- `offset` (optional): Number of items to skip (default: 0)

**Response:**
```json
{
  "success": true,
  "message": "Purchase requisitions retrieved successfully",
  "data": [
    {
      "id": "req_id",
      "requisitionNumber": "PR-2024-001",
      "title": "Office Supplies Request",
      "status": "PENDING_APPROVAL",
      "totalAmount": 155.00,
      "requestedBy": {
        "id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@company.com"
      },
      "approvalRequest": {
        "id": "approval_req_id",
        "status": "PENDING",
        "currentStep": 1,
        "totalSteps": 2
      }
    }
  ]
}
```

### Get Purchase Requisition by ID

**GET** `/api/procurement/requisitions/{id}`

Retrieves a specific purchase requisition with full details.

**Response:**
```json
{
  "success": true,
  "message": "Purchase requisition retrieved successfully",
  "data": {
    "id": "req_id",
    "requisitionNumber": "PR-2024-001",
    "title": "Office Supplies Request",
    "status": "PENDING_APPROVAL",
    "totalAmount": 155.00,
    "items": [...],
    "requestedBy": {...},
    "approvalRequest": {
      "id": "approval_req_id",
      "status": "PENDING",
      "currentStep": 1,
      "totalSteps": 2,
      "approvals": [
        {
          "id": "approval_id",
          "status": "PENDING",
          "approver": {
            "id": "approver_id",
            "firstName": "Jane",
            "lastName": "Smith",
            "email": "jane.smith@company.com"
          },
          "stage": {
            "stepNumber": 1,
            "stepName": "Department Head Approval",
            "stepType": "DEPARTMENT"
          }
        }
      ]
    }
  }
}
```

### Submit Purchase Requisition for Approval

**PUT** `/api/procurement/requisitions/{id}/submit`

Submits a purchase requisition for approval. This triggers the approval workflow based on the active configuration.

**Response:**
```json
{
  "success": true,
  "message": "Requisition submitted for approval",
  "data": {
    "id": "req_id",
    "status": "PENDING_APPROVAL",
    "approvalRequest": {
      "id": "approval_req_id",
      "status": "PENDING",
      "currentStep": 1,
      "totalSteps": 2
    }
  }
}
```

### Approve Purchase Requisition

**PUT** `/api/procurement/requisitions/{id}/approve`

Approves a purchase requisition. This is typically called by the approval workflow system.

**Response:**
```json
{
  "success": true,
  "message": "Requisition approved successfully",
  "data": {
    "id": "req_id",
    "status": "APPROVED",
    "approvedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Purchase Orders

### Create Purchase Order

**POST** `/api/procurement/purchase-orders`

Creates a new purchase order. The system will automatically trigger the approval workflow based on the active configuration.

**Request Body:**
```json
{
  "requisitionId": "req_id",
  "vendorId": "vendor_id",
  "priority": "MEDIUM",
  "currencyId": "currency_id",
  "expectedDeliveryDate": "2024-02-01T00:00:00.000Z",
  "shippingAddress": "123 Main St, City, State 12345",
  "paymentTerms": "Net 30",
  "deliveryTerms": "FOB Destination",
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White A4 paper, 80gsm",
      "quantity": 10,
      "unitPrice": 15.50,
      "unit": "ream",
      "specifications": {
        "brand": "Any",
        "color": "White",
        "weight": "80gsm"
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Purchase order created successfully",
  "data": {
    "id": "po_id",
    "purchaseOrderNumber": "PO-2024-001",
    "status": "DRAFT",
    "totalAmount": 155.00,
    "vendor": {
      "id": "vendor_id",
      "name": "Office Supplies Inc"
    },
    "approvalRequest": {
      "id": "approval_req_id",
      "status": "PENDING",
      "currentStep": 1,
      "totalSteps": 2
    }
  }
}
```

### Get All Purchase Orders

**GET** `/api/procurement/purchase-orders`

Retrieves all purchase orders with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by status (`DRAFT`, `SENT`, `ACKNOWLEDGED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`)
- `vendorId` (optional): Filter by vendor
- `priority` (optional): Filter by priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`)
- `limit` (optional): Number of items to return (default: 50)
- `offset` (optional): Number of items to skip (default: 0)

**Response:**
```json
{
  "success": true,
  "message": "Purchase orders retrieved successfully",
  "data": [
    {
      "id": "po_id",
      "purchaseOrderNumber": "PO-2024-001",
      "status": "SENT",
      "totalAmount": 155.00,
      "vendor": {
        "id": "vendor_id",
        "name": "Office Supplies Inc"
      },
      "approvalRequest": {
        "id": "approval_req_id",
        "status": "APPROVED",
        "currentStep": 2,
        "totalSteps": 2
      }
    }
  ]
}
```

---

## Procurement Invoices

### Create Procurement Invoice

**POST** `/api/procurement/invoices`

Creates a new procurement invoice. The system will automatically trigger the approval workflow based on the active configuration.

**Request Body:**
```json
{
  "purchaseOrderId": "po_id",
  "vendorId": "vendor_id",
  "invoiceDate": "2024-01-01T00:00:00.000Z",
  "dueDate": "2024-01-31T00:00:00.000Z",
  "currencyId": "currency_id",
  "documentPath": "/uploads/invoices/invoice_001.pdf",
  "documentType": "PDF",
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White A4 paper, 80gsm",
      "quantity": 10,
      "unitPrice": 15.50,
      "unit": "ream"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Procurement invoice created successfully",
  "data": {
    "id": "invoice_id",
    "invoiceNumber": "INV-2024-001",
    "status": "RECEIVED",
    "totalAmount": 155.00,
    "vendor": {
      "id": "vendor_id",
      "name": "Office Supplies Inc"
    },
    "approvalRequest": {
      "id": "approval_req_id",
      "status": "PENDING",
      "currentStep": 1,
      "totalSteps": 1
    }
  }
}
```

### Process OCR Data

**POST** `/api/procurement/invoices/{invoiceId}/ocr`

Processes OCR data for an invoice to extract structured information.

**Request Body:**
```json
{
  "invoiceNumber": "INV-001",
  "invoiceDate": "2024-01-01",
  "vendorName": "Office Supplies Inc",
  "vendorAddress": "123 Business St, City, State 12345",
  "subtotal": 150.00,
  "taxAmount": 15.00,
  "totalAmount": 165.00,
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White A4 paper, 80gsm",
      "quantity": 10,
      "unitPrice": 15.00,
      "totalPrice": 150.00,
      "unit": "ream"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "OCR data processed successfully",
  "data": {
    "id": "invoice_id",
    "ocrData": {
      "invoiceNumber": "INV-001",
      "invoiceDate": "2024-01-01",
      "vendorName": "Office Supplies Inc",
      "totalAmount": 165.00,
      "items": [...]
    }
  }
}
```

### Perform AI Matching

**POST** `/api/procurement/invoices/{invoiceId}/ai-matching`

Performs AI matching between invoice and purchase order to detect discrepancies.

**Request Body:**
```json
{
  "matched": true,
  "matchScore": 95,
  "discrepancies": [
    {
      "type": "PRICE_DIFFERENCE",
      "description": "Unit price differs by $0.50",
      "severity": "LOW"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "AI matching completed successfully",
  "data": {
    "id": "invoice_id",
    "matchingStatus": "MATCHED",
    "matchScore": 95,
    "discrepancies": [...]
  }
}
```

### Approve Procurement Invoice

**PUT** `/api/procurement/invoices/{id}/approve`

Approves a procurement invoice. This is typically called by the approval workflow system.

**Response:**
```json
{
  "success": true,
  "message": "Invoice approved successfully",
  "data": {
    "id": "invoice_id",
    "status": "APPROVED",
    "approvedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get All Procurement Invoices

**GET** `/api/procurement/invoices`

Retrieves all procurement invoices with optional filtering.

**Query Parameters:**
- `status` (optional): Filter by status (`RECEIVED`, `PROCESSING`, `MATCHED`, `DISCREPANCY`, `APPROVED`, `PAID`, `REJECTED`)
- `vendorId` (optional): Filter by vendor
- `matchingStatus` (optional): Filter by matching status (`PENDING`, `MATCHED`, `DISCREPANCY`, `MANUAL_REVIEW`)
- `limit` (optional): Number of items to return (default: 50)
- `offset` (optional): Number of items to skip (default: 0)

**Response:**
```json
{
  "success": true,
  "message": "Procurement invoices retrieved successfully",
  "data": [
    {
      "id": "invoice_id",
      "invoiceNumber": "INV-2024-001",
      "status": "APPROVED",
      "totalAmount": 155.00,
      "vendor": {
        "id": "vendor_id",
        "name": "Office Supplies Inc"
      },
      "matchingStatus": "MATCHED",
      "matchScore": 95
    }
  ]
}
```

---

## Goods Received Notes

### Create Goods Received Note

**POST** `/api/procurement/goods-received-notes`

Creates a goods received note for received items. The system will automatically trigger the approval workflow based on the active configuration.

**Request Body:**
```json
{
  "purchaseOrderId": "po_id",
  "items": [
    {
      "purchaseOrderItemId": "po_item_id",
      "quantityReceived": 10,
      "quantityAccepted": 9,
      "quantityRejected": 1,
      "qualityStatus": "PASSED",
      "qualityNotes": "One ream damaged during shipping"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Goods received note created successfully",
  "data": {
    "id": "grn_id",
    "grnNumber": "GRN-2024-001",
    "status": "PENDING_APPROVAL",
    "purchaseOrder": {
      "id": "po_id",
      "purchaseOrderNumber": "PO-2024-001"
    },
    "approvalRequest": {
      "id": "approval_req_id",
      "status": "PENDING",
      "currentStep": 1,
      "totalSteps": 1
    }
  }
}
```

---

## Approval Workflow

### Create Approval Request

**POST** `/api/procurement-approval-configs/requests`

Creates an approval request for a specific procurement stage.

**Request Body:**
```json
{
  "configId": "config_id",
  "stageType": "PURCHASE_REQUISITION",
  "entityId": "req_id",
  "entityData": {
    "title": "Office Supplies Request",
    "totalAmount": 155.00,
    "department": "Finance"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Approval request created successfully",
  "data": {
    "id": "approval_req_id",
    "stageType": "PURCHASE_REQUISITION",
    "entityId": "req_id",
    "status": "PENDING",
    "currentStep": 1,
    "totalSteps": 2,
    "requestedBy": {
      "id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@company.com"
    }
  }
}
```

### Get Approval Requests for User

**GET** `/api/procurement-approval-configs/requests/my`

Retrieves approval requests for the current user.

**Query Parameters:**
- `status` (optional): Filter by status (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`)

**Response:**
```json
{
  "success": true,
  "message": "Approval requests retrieved successfully",
  "data": [
    {
      "id": "approval_req_id",
      "stageType": "PURCHASE_REQUISITION",
      "entityId": "req_id",
      "status": "PENDING",
      "currentStep": 1,
      "totalSteps": 2,
      "requestedBy": {...},
      "approvals": [
        {
          "id": "approval_id",
          "status": "PENDING",
          "approver": {
            "id": "approver_id",
            "firstName": "Jane",
            "lastName": "Smith",
            "email": "jane.smith@company.com"
          },
          "stage": {
            "stepNumber": 1,
            "stepName": "Department Head Approval",
            "stepType": "DEPARTMENT"
          }
        }
      ]
    }
  ]
}
```

### Process Approval

**PUT** `/api/procurement-approval-configs/requests/{requestId}/stages/{stageId}/approve`

Processes an approval (approve/reject) for a specific stage. When approving, a digital signature can be included for authentication and audit purposes.

**Request Body:**
```json
{
  "status": "APPROVED",
  "comments": "Approved for purchase",
  "delegatedToId": "optional_delegate_user_id",
  "signatureData": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." // Base64 signature image (optional)
}
```

**Parameters:**
- `status` (required): `APPROVED` or `REJECTED`
- `comments` (optional): Approval comments
- `delegatedToId` (optional): User ID to delegate approval to
- `signatureData` (optional): Base64 encoded signature image (required for approvals)

**Response:**
```json
{
  "success": true,
  "message": "Approval approved successfully",
  "data": {
    "id": "approval_id",
    "status": "APPROVED",
    "comments": "Approved for purchase",
    "signatureData": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "approvedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**API Interaction Flow:**
1. **Frontend captures signature** using a canvas-based signature pad
2. **Converts signature to base64** format
3. **Sends approval request** with signature data
4. **Backend validates** the approval and signature
5. **Saves approval** with signature to database
6. **Triggers next step** in approval workflow

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "User not authenticated"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Configuration Examples

### Example 1: Simple Approval Flow
```json
{
  "name": "Simple Approval",
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Manager Approval",
          "stepType": "DEPARTMENT",
          "departmentId": "dept_id"
        }
      ]
    }
  ]
}
```

### Example 2: Multi-Step Approval Flow
```json
{
  "name": "Multi-Step Approval",
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Department Head",
          "stepType": "DEPARTMENT",
          "departmentId": "dept_id"
        },
        {
          "stepNumber": 2,
          "stepName": "Finance Manager",
          "stepType": "ROLE",
          "roleId": "finance_role_id"
        },
        {
          "stepNumber": 3,
          "stepName": "CEO Approval",
          "stepType": "USER",
          "userId": "ceo_user_id"
        }
      ]
    }
  ]
}
```

### Example 3: Amount-Based Approval
```json
{
  "name": "Amount-Based Approval",
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Manager Approval",
          "stepType": "DEPARTMENT",
          "departmentId": "dept_id",
          "amountThreshold": 1000
        },
        {
          "stepNumber": 2,
          "stepName": "CEO Approval",
          "stepType": "USER",
          "userId": "ceo_user_id",
          "amountThreshold": 5000
        }
      ]
    }
  ]
}
```

---

## Integration Notes

1. **Automatic Approval Triggering**: When creating procurement documents (requisitions, orders, invoices, GRNs), the system automatically triggers the approval workflow based on the active configuration.

2. **Stage-Specific Steps**: Each procurement stage can have different approval steps configured.

3. **Approver Types**: The system supports four types of approvers:
   - `USER`: Specific user approval
   - `ROLE`: All users with specific role
   - `DEPARTMENT`: All users in specific department
   - `AMOUNT_THRESHOLD`: Dynamic approvers based on amount

4. **Delegation Support**: Approvers can delegate approvals to other users when allowed.

5. **Sequential/Parallel Approval**: Each step can be configured for sequential or parallel approval processing.

6. **Auto-Approval**: Steps can be configured to auto-approve under certain conditions.

---

## Complete Process Flow

### Overview
The procurement module implements a comprehensive Procure-to-Pay (P2P) workflow with dynamic approval configurations and digital signatures. The entire process is designed to be configurable, auditable, and secure.

### 1. System Setup and Configuration

#### Step 1: Create Approval Configuration
**API Call:** `POST /api/procurement-approval-configs`

**Purpose:** Set up the approval workflow for all procurement stages

**Process:**
1. **Admin creates configuration** with approval steps for each stage
2. **System validates** the configuration structure
3. **Configuration becomes active** and controls all future approvals

**Example Configuration:**
```json
{
  "name": "Main Procurement Approval",
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Department Head Approval",
          "stepType": "DEPARTMENT",
          "departmentId": "dept_id"
        },
        {
          "stepNumber": 2,
          "stepName": "Finance Manager Approval", 
          "stepType": "ROLE",
          "roleId": "finance_role_id"
        }
      ]
    }
  ]
}
```

### 2. Purchase Requisition Process

#### Step 1: Create Purchase Requisition
**API Call:** `POST /api/procurement/requisitions`

**Process Flow:**
1. **User creates requisition** with items and details
2. **System calculates** total amount and validates data
3. **Requisition saved** in DRAFT status
4. **User can edit** requisition before submission

**API Interaction:**
```javascript
// Frontend creates requisition
const response = await fetch('/api/procurement/requisitions', {
  method: 'POST',
  body: JSON.stringify({
    title: "Office Supplies Request",
    items: [...],
    departmentId: "dept_id"
  })
});
```

#### Step 2: Submit for Approval
**API Call:** `PUT /api/procurement/requisitions/{id}/submit`

**Process Flow:**
1. **User submits** requisition for approval
2. **System gets active configuration** for PURCHASE_REQUISITION stage
3. **System creates approval request** with all required steps
4. **System creates approval records** for first step approvers
5. **Requisition status** changes to PENDING_APPROVAL

**API Interaction:**
```javascript
// Frontend submits requisition
const response = await fetch(`/api/procurement/requisitions/${reqId}/submit`, {
  method: 'PUT'
});
// System automatically triggers approval workflow
```

### 3. Approval Workflow Process

#### Step 1: Approver Receives Notification
**Process Flow:**
1. **System identifies approvers** based on configuration
2. **Approvers receive notifications** (email, dashboard, etc.)
3. **Approvers can view** pending approvals

#### Step 2: Approver Reviews and Signs
**API Call:** `PUT /api/procurement-approval-configs/requests/{requestId}/stages/{stageId}/approve`

**Process Flow:**
1. **Approver opens** approval request
2. **Approver reviews** requisition details
3. **Approver adds comments** (optional)
4. **Approver provides digital signature** using signature pad
5. **Frontend captures signature** as base64 image
6. **System processes approval** with signature

**API Interaction:**
```javascript
// Frontend captures signature
const signatureData = signaturePad.toDataURL(); // Base64 image

// Frontend sends approval with signature
const response = await fetch(`/api/procurement-approval-configs/requests/${requestId}/stages/${stageId}/approve`, {
  method: 'PUT',
  body: JSON.stringify({
    status: 'APPROVED',
    comments: 'Approved for purchase',
    signatureData: signatureData
  })
});
```

#### Step 3: System Processes Approval
**Backend Process:**
1. **System validates** approval request and signature
2. **System saves approval** with signature data
3. **System checks** if step is complete
4. **System moves to next step** or completes workflow
5. **System updates** requisition status

### 4. Multi-Step Approval Flow

#### Sequential Approval Process:
```
Step 1: Department Head Approval
├── Approver receives notification
├── Approver reviews and signs
├── System validates signature
├── System moves to Step 2

Step 2: Finance Manager Approval  
├── Approver receives notification
├── Approver reviews and signs
├── System validates signature
├── System completes workflow

Final: Requisition Approved
├── Status changes to APPROVED
├── System notifies requester
├── System enables PO creation
```

### 5. Purchase Order Creation

#### Step 1: Create Purchase Order
**API Call:** `POST /api/procurement/purchase-orders`

**Process Flow:**
1. **User creates PO** from approved requisition
2. **System triggers approval workflow** for PURCHASE_ORDER stage
3. **System creates approval request** with PO-specific steps
4. **Approval process repeats** with PO approvers

**API Interaction:**
```javascript
// Frontend creates PO
const response = await fetch('/api/procurement/purchase-orders', {
  method: 'POST',
  body: JSON.stringify({
    requisitionId: "req_id",
    vendorId: "vendor_id",
    items: [...]
  })
});
// System automatically triggers PO approval workflow
```

### 6. Invoice Processing

#### Step 1: Create Invoice
**API Call:** `POST /api/procurement/invoices`

**Process Flow:**
1. **User creates invoice** from PO
2. **System triggers approval workflow** for INVOICE stage
3. **System processes OCR** data (if provided)
4. **System performs AI matching** with PO
5. **System creates approval request** for invoice approval

#### Step 2: OCR Processing
**API Call:** `POST /api/procurement/invoices/{invoiceId}/ocr`

**Process Flow:**
1. **System extracts** structured data from invoice image
2. **System validates** extracted data
3. **System updates** invoice with OCR data

#### Step 3: AI Matching
**API Call:** `POST /api/procurement/invoices/{invoiceId}/ai-matching`

**Process Flow:**
1. **System compares** invoice with PO
2. **System identifies** discrepancies
3. **System calculates** match score
4. **System flags** items for manual review if needed

### 7. Goods Received Note (GRN)

#### Step 1: Create GRN
**API Call:** `POST /api/procurement/goods-received-notes`

**Process Flow:**
1. **User creates GRN** for received items
2. **System triggers approval workflow** for GRN stage
3. **System validates** received quantities
4. **System creates approval request** for GRN approval

### 8. Complete Workflow Integration

#### End-to-End Process:
```
1. Configuration Setup
   ├── Admin creates approval configuration
   ├── System activates configuration
   └── Configuration controls all workflows

2. Purchase Requisition
   ├── User creates requisition
   ├── User submits for approval
   ├── System triggers approval workflow
   ├── Approvers review and sign
   ├── System processes approvals
   └── Requisition approved

3. Purchase Order
   ├── User creates PO from requisition
   ├── System triggers PO approval workflow
   ├── PO approvers review and sign
   ├── System processes PO approvals
   └── PO approved and sent to vendor

4. Invoice Processing
   ├── User creates invoice
   ├── System processes OCR data
   ├── System performs AI matching
   ├── System triggers invoice approval
   ├── Invoice approvers review and sign
   └── Invoice approved for payment

5. Goods Received
   ├── User creates GRN
   ├── System triggers GRN approval
   ├── GRN approvers review and sign
   └── GRN approved and items received
```

### 9. Error Handling and Validation

#### Common Error Scenarios:
1. **Invalid signature format** - System rejects approval
2. **Missing required approvers** - System prevents workflow progression
3. **Configuration errors** - System validates before activation
4. **Network failures** - System retries and provides feedback

#### Validation Process:
1. **Signature format validation** - Base64 image format
2. **Approver authorization** - User must be assigned to step
3. **Workflow state validation** - Approval must be in correct state
4. **Data integrity checks** - All required fields present

This comprehensive process flow ensures a secure and configurable procurement system with digital signatures for all approvals.

This comprehensive API documentation covers all aspects of the procurement module with the new dynamic approval configuration system and digital signature integration.
