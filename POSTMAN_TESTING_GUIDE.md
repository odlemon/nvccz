# Postman Testing Guide - Application Submission

## Single-Step Application Submission (Recommended)

The application creation endpoint now accepts files directly. Upload files and form data in one request.

### Endpoint
**POST** `https://nvccz-pi.vercel.app/api/applications`  
(or `http://localhost:3004/api/applications` for local)

### Setup in Postman

1. **Method**: POST
2. **URL**: `https://nvccz-pi.vercel.app/api/applications`
3. **Body Tab**: Select `form-data`

### Form Fields

Add these fields in Postman (set type to `Text` for form fields, `File` for files):

| Key | Type | Value |
|-----|------|-------|
| `applicantName` | Text | John Doe |
| `applicantEmail` | Text | john.doe@example.com |
| `applicantPhone` | Text | +1234567890 |
| `applicantAddress` | Text | 123 Main Street, Harare, Zimbabwe |
| `businessName` | Text | TechStart Inc. |
| `businessDescription` | Text | A technology startup focused on AI solutions |
| `industry` | Text | Technology |
| `businessStage` | Text | STARTUP |
| `foundingDate` | Text | 2023-01-15 |
| `requestedAmount` | Text | 75000 |
| `documentTypes` | Text | `["BUSINESS_PLAN", "PROOF_OF_CONCEPT", "MARKET_RESEARCH", "PROJECTED_CASH_FLOWS"]` |
| `files` | **File** | Select file 1 (e.g., business-plan.pdf) |
| `files` | **File** | Select file 2 (e.g., proof-of-concept.pdf) |
| `files` | **File** | Select file 3 (e.g., market-research.pdf) |
| `files` | **File** | Select file 4 (e.g., cash-flows.xlsx) |

### Important Notes

1. **Multiple Files**: Add multiple `files` fields in Postman. For each file:
   - Click the key field dropdown
   - Select **File** type
   - Click **Select Files** and choose your file

2. **Document Types Order**: The `documentTypes` JSON array must match the order of files:
   - First file = first document type
   - Second file = second document type
   - etc.

3. **Required Documents** (minimum 4):
   - `BUSINESS_PLAN` (PDF/DOCX)
   - `PROOF_OF_CONCEPT` (PDF/DOCX)
   - `MARKET_RESEARCH` (PDF/DOCX)
   - `PROJECTED_CASH_FLOWS` (XLSX/PDF)

4. **Allowed File Types**:
   - PDF (.pdf)
   - Word (.doc, .docx)
   - Excel (.xls, .xlsx)
   - Images (.jpg, .jpeg, .png)
   - Max size: 50MB per file

### Example Request

```
POST /api/applications
Content-Type: multipart/form-data

applicantName: "John Doe"
applicantEmail: "john.doe@example.com"
applicantPhone: "+263771234567"
applicantAddress: "Harare, Zimbabwe"
businessName: "TechStart Inc."
businessDescription: "A technology startup focused on AI solutions"
industry: "Technology"
businessStage: "STARTUP"
foundingDate: "2023-01-15"
requestedAmount: "75000"
documentTypes: ["BUSINESS_PLAN", "PROOF_OF_CONCEPT", "MARKET_RESEARCH", "PROJECTED_CASH_FLOWS"]
files: [business-plan.pdf]
files: [proof-of-concept.pdf]
files: [market-research.pdf]
files: [cash-flows.xlsx]
```

### What Happens After Submission

1. ✅ Files are automatically uploaded to Firebase Storage
2. ✅ Application is created with status `PENDING_SHORTLISTING`
3. ✅ You receive a confirmation email
4. ✅ Background process starts:
   - ChatGPT scores your application (0-100%)
   - If score ≥ 50%: Status → `SHORTLISTED` + shortlisted email
   - If score < 50%: Status → `REJECTED` + rejection email

### Expected Response

```json
{
  "success": true,
  "message": "Application created successfully",
  "data": {
    "id": "clx1234567890",
    "applicantName": "John Doe",
    "applicantEmail": "john.doe@example.com",
    "businessName": "TechStart Inc.",
    "currentStage": "PENDING_SHORTLISTING",
    "documents": [
      {
        "id": "doc1",
        "documentType": "BUSINESS_PLAN",
        "fileName": "business-plan.pdf",
        "isRequired": true,
        "isSubmitted": true
      },
      ...
    ]
  }
}
```

### Testing Tips

1. **File Order Matters**: Ensure your `documentTypes` array matches the file upload order
2. **Requested Amount**: Use amounts between $20,000-$150,000 for best scoring
3. **Check Email**: You'll receive emails at the provided email address
4. **Check Status**: Use `GET /api/applications/{id}/status` to check application status

### Alternative: Two-Step Process (Still Supported)

If you prefer to upload files separately first:

1. **Step 1**: `POST /api/applications/upload-documents` (upload files)
2. **Step 2**: `POST /api/applications` (create application with document URLs)

But the single-step process above is recommended! 🚀

