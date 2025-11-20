# 📄 TERM SHEET API DOCUMENTATION

## 🆕 CREATE TERM SHEET

**Endpoint:** `POST /api/term-sheets/:applicationId`

**Method:** `multipart/form-data` (for file upload) OR `application/json` (for URL)

**Authentication:** Required (Admin/Fund Manager)

**Authorization:** `admin` or `fund_manager` role

**⚠️ IMPORTANT:** Signatures are **NOT** part of creating a term sheet. Signatures are added later when **SIGNING** the term sheet (separate endpoint).

---

### **Request Body (Form Data - Recommended):**

```javascript
// Using multipart/form-data
// Creating term sheet - NO signature fields here
FormData:
  - title: string (required)
  - investmentAmount: number (required)
  - equityPercentage: number (optional)
  - valuation: number (optional)
  - keyTerms: string (optional)
  - conditions: string (optional)
  - timeline: string (optional)
  - document: File (optional) - Term sheet document file (PDF/document)
  
// ❌ NO signature fields - signatures are added when SIGNING (see sign endpoint below)
```

**Example (JavaScript/FormData):**
```javascript
const formData = new FormData();
formData.append('title', 'Investment Term Sheet - TechStartup Ltd');
formData.append('investmentAmount', '500000');
formData.append('equityPercentage', '15.5');
formData.append('valuation', '3200000');
formData.append('keyTerms', 'Standard investment terms...');
formData.append('conditions', 'Completion of due diligence...');
formData.append('timeline', '30 days');
formData.append('document', fileInput.files[0]); // PDF or document file

fetch('/api/term-sheets/app_123', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: formData
});
```

---

### **Request Body (JSON - Alternative):**

```json
{
  "title": "Investment Term Sheet - TechStartup Ltd",
  "investmentAmount": 500000,
  "equityPercentage": 15.5,
  "valuation": 3200000,
  "keyTerms": "Standard investment terms...",
  "conditions": "Completion of due diligence...",
  "timeline": "30 days",
  "documentUrl": "https://firebase-storage-url.com/term-sheet.pdf",
  "documentFileName": "term-sheet.pdf",
  "documentSize": 2048576
}
```

**Example (cURL):**
```bash
curl -X POST http://localhost:3000/api/term-sheets/app_123 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Investment Term Sheet",
    "investmentAmount": 500000,
    "equityPercentage": 15.5,
    "valuation": 3200000,
    "keyTerms": "Standard terms",
    "conditions": "Due diligence completion",
    "timeline": "30 days"
  }'
```

---

### **Request Body Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | ✅ Yes | Term sheet title |
| `investmentAmount` | number | ✅ Yes | Investment amount |
| `equityPercentage` | number | ❌ No | Equity percentage |
| `valuation` | number | ❌ No | Company valuation |
| `keyTerms` | string | ❌ No | Key investment terms |
| `conditions` | string | ❌ No | Investment conditions |
| `timeline` | string | ❌ No | Investment timeline |
| `document` | File | ❌ No | Term sheet document file (multipart) |
| `documentUrl` | string | ❌ No | Term sheet document URL (if not uploading file) |
| `documentFileName` | string | ❌ No | Document file name (if using URL) |
| `documentSize` | number | ❌ No | Document file size in bytes (if using URL) |

**❌ Signature fields are NOT in create request** - Signatures are added when signing (see sign endpoint below)

---

## ✍️ SIGN TERM SHEET (NEW - WITH SIGNATURE)

**Endpoint:** `POST /api/term-sheets/:applicationId/sign`

**Method:** `multipart/form-data`

**Authentication:** Required

**Authorization:** 
- Applicant (for applicant signature)
- Admin/Fund Manager (for investor signature)

---

### **Request Body (Form Data):**

```javascript
// Using multipart/form-data
// This is the SIGN endpoint - separate from CREATE
FormData:
  - signature: File (required) - Signature image file (PNG, JPEG, JPG, GIF, or WEBP)
```

**⚠️ Important:** 
- The `signature` field is **REQUIRED** when signing
- This is a **separate endpoint** (`/sign`) from creating term sheet (`POST /api/term-sheets/:applicationId`)
- Signatures are added **after** term sheet is created and finalized
- **Workflow:** Create → Finalize → Sign (with signature) → Fully Signed

**Example (JavaScript/FormData):**
```javascript
const formData = new FormData();
formData.append('signature', signatureFile); // Image file from signature pad or upload

fetch('/api/term-sheets/app_123/sign', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: formData
});
```

**Example (cURL):**
```bash
curl -X POST http://localhost:3000/api/term-sheets/app_123/sign \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "signature=@/path/to/signature.png"
```

---

### **Signature File Requirements:**

- **File Type:** Image file (PNG, JPEG, JPG, GIF, or WEBP)
- **Field Name:** `signature`
- **Size Limit:** 50MB (configured in multer)
- **Storage:** Uploaded to Firebase Storage
- **Path:** `term-sheet-signatures/{applicationId}/{termSheetId}/{type}-{timestamp}-{fileName}`

---

### **How Signing Works:**

1. **Applicant Signs:**
   - Applicant uploads signature image
   - Signature stored as `applicantSignatureUrl`
   - `applicantSignedById` = applicant user ID
   - `applicantSignedAt` = current timestamp
   - Term sheet status remains `FINAL` (not fully signed yet)

2. **Investor Signs:**
   - Investor/Admin uploads signature image
   - Signature stored as `investorSignatureUrl`
   - `investorSignedById` = investor user ID
   - `investorSignedAt` = current timestamp
   - If applicant already signed → Term sheet status = `SIGNED`, `isSigned = true`
   - Application stage moves to `UNDER_BOARD_REVIEW`

3. **Fully Signed:**
   - Both signatures present → `isSigned = true`
   - Application stage → `UNDER_BOARD_REVIEW`
   - Term sheet cannot be modified

---

### **Response (Sign Term Sheet):**

```json
{
  "success": true,
  "message": "Term sheet signed successfully",
  "data": {
    "id": "ts_123",
    "applicationId": "app_123",
    "status": "FINAL", // or "SIGNED" if both signatures present
    "isSigned": false, // or true if both signatures present
    "applicantSignatureUrl": "https://firebase-storage.../applicant-signature.png",
    "applicantSignatureFileName": "signature.png",
    "applicantSignedById": "user_123",
    "applicantSignedAt": "2024-01-15T10:30:00.000Z",
    "investorSignatureUrl": null, // or URL if investor signed
    "investorSignatureFileName": null,
    "investorSignedById": null,
    "investorSignedAt": null
  }
}
```

---

## 📝 UPDATE TERM SHEET

**Endpoint:** `PUT /api/term-sheets/:applicationId`

**Method:** `multipart/form-data` OR `application/json`

**Authentication:** Required (Admin/Fund Manager)

**Note:** Cannot update if term sheet has any signatures

---

### **Request Body:**

Same as Create Term Sheet, but all fields are optional.

**⚠️ Restrictions:**
- Cannot update if `isSigned = true`
- Cannot update if term sheet has any signatures (applicant or investor)
- Signature fields cannot be updated (immutable)

---

## 📋 GET TERM SHEET

**Endpoint:** `GET /api/term-sheets/:applicationId`

**Response includes signature fields:**
```json
{
  "success": true,
  "data": {
    "id": "ts_123",
    "applicantSignatureUrl": "https://firebase-storage.../applicant-signature.png",
    "applicantSignatureFileName": "signature.png",
    "applicantSignedBy": {
      "id": "user_123",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com"
    },
    "applicantSignedAt": "2024-01-15T10:30:00.000Z",
    "investorSignatureUrl": "https://firebase-storage.../investor-signature.png",
    "investorSignatureFileName": "signature.png",
    "investorSignedBy": {
      "id": "user_456",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@fund.com"
    },
    "investorSignedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

---

## ✅ SUMMARY

**Creating Term Sheet:**
- ✅ No changes - same request body as before
- ✅ Can upload document file OR provide document URL
- ✅ No signature fields in creation

**Signing Term Sheet:**
- ✅ NEW: Requires `signature` file upload
- ✅ Automatically detects if user is applicant or investor
- ✅ Uploads signature to Firebase Storage
- ✅ Stores signature URL and metadata
- ✅ Term sheet fully signed when both signatures present

**Updating Term Sheet:**
- ✅ Cannot update if signatures exist
- ✅ Signature fields are immutable

