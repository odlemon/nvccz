# Request Body for FAILING Application Test

This application will likely score **< 50%** and be **REJECTED** by the AI.

## Postman Request Setup

**Method:** `POST`  
**URL:** `https://nvccz-pi.vercel.app/api/applications`  
**Headers:** None required (public endpoint)  
**Body Type:** `form-data`

## Form Data Fields

### Required Fields:
```
applicantName: Test Applicant Fail
applicantEmail: test.fail@example.com
businessName: Poor Business Idea Inc.
requestedAmount: 200000
```

### Optional Fields (set to ensure rejection):
```
applicantPhone: +1234567890
applicantAddress: 123 Poor Street, Bad City, Country
businessDescription: We want to start a business but have no clear plan or proof of concept. We think it will work somehow.
industry: Technology
businessStage: IDEA
foundingDate: 2024-01-01
```

### Files (upload these 4 documents from `test-documents-failing/`):
- `BUSINESS_PLAN.pdf` - Vague, no details, unrealistic
- `PROOF_OF_CONCEPT.pdf` - No proof, untested concept
- `MARKET_RESEARCH.pdf` - No research, vague analysis
- `PROJECTED_CASH_FLOWS.pdf` - Unrealistic projections, $200k request

### Document Types (Optional - will auto-detect):
```
documentTypes: ["BUSINESS_PLAN", "PROOF_OF_CONCEPT", "MARKET_RESEARCH", "PROJECTED_CASH_FLOWS"]
```

## Why This Will Fail:

1. **Requested Amount:** $200,000 (outside $20k-$150k range) - **15% penalty**
2. **Business Stage:** IDEA (less mature than STARTUP/OPERATIONAL) - **10% penalty**
3. **Innovation:** Low - vague business idea - **15% penalty**
4. **Growth Potential:** Unclear - no market research - **15% penalty**
5. **Scalability:** Unproven - no proof of concept - **15% penalty**
6. **Sustainability:** Uncertain - no clear business model - **10% penalty**
7. **Proven Concept:** No proof - untested idea - **10% penalty**
8. **Strategic Parameters:** Not clearly aligned - **10% penalty**

**Expected Score:** < 30% (well below 50% threshold)

## Expected Response:

1. **Initial Response (201 Created):**
   ```json
   {
     "success": true,
     "message": "Application created successfully",
     "data": {
       "id": "...",
       "currentStage": "PENDING_SHORTLISTING",
       ...
     }
   }
   ```

2. **Background Processing:**
   - AI will analyze the application
   - Score will be < 50%
   - Application will be REJECTED
   - Rejection email will be sent with AI reasoning

3. **Email Content:**
   - Subject: "Application Update - NVCCZ"
   - Will include AI-generated rejection reasoning
   - Will show application score (< 50%)
   - Will provide feedback on why it was rejected

## Testing Checklist:

- [ ] Application created successfully
- [ ] Status starts as "PENDING_SHORTLISTING"
- [ ] AI processes application in background (check server logs)
- [ ] Application status changes to "REJECTED"
- [ ] Rejection email sent with AI reasoning
- [ ] Email contains detailed feedback from AI
- [ ] Email shows score below 50% threshold

