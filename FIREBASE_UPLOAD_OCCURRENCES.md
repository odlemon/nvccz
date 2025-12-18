# Firebase Upload Occurrences - Complete Analysis

This document lists **ALL** locations in the codebase where files are uploaded to Firebase Storage.

## 📋 Summary

**Total Upload Methods Found:** 6 unique upload methods
**Total Upload Locations:** 16+ direct calls across the codebase

---

## 🔧 Core Firebase Configuration

**File:** `src/services/FirebaseStorageService.ts`

**Firebase Config (Hardcoded):**
```typescript
const firebaseConfig = {
  apiKey: "AIzaSyAjxju0tSJoLtKnwOVqLRTMkVkpZ_iEstw",
  authDomain: "otcebp.firebaseapp.com",
  projectId: "otcebp",
  storageBucket: "otcebp.appspot.com",
  messagingSenderId: "904504797201",
  appId: "1:904504797201:web:091e69c41ba296362fe9b0",
  measurementId: "G-RS3VTZWQ3D"
};
```

**Storage Paths Used:**
- `cashbook-imports/{userId}/{batchId}/{fileName}`
- `financial-reports/{portfolioCompanyId}/{reportId}/{fileName}`
- `application-documents/{applicationId}/{documentType}/{timestamp}-{fileName}`
- `term-sheets/{termSheetId}/{documentType}/{timestamp}-{fileName}`
- `term-sheet-signatures/{applicationId}/{termSheetId}/{signatureType}-{timestamp}-{fileName}`

---

## 📤 Upload Methods in FirebaseStorageService

### 1. `uploadImportFile()` - Line 26
**Purpose:** Upload CSV files for cashbook imports
**Storage Path:** `cashbook-imports/{userId}/{batchId}/{fileName}`
**Used By:**
- `src/services/CashbookImportService.ts` (line 70)
- `src/controllers/ProcurementController.ts` (line 904)

### 2. `uploadFinancialReport()` - Line 60
**Purpose:** Upload financial report documents for portfolio companies
**Storage Path:** `financial-reports/{portfolioCompanyId}/{reportId}/{fileName}`
**Used By:**
- `src/services/FinancialReportService.ts` (line 41)
- `src/controllers/ApplicantPortalController.ts` (line 167)

### 3. `uploadApplicationDocument()` - Line 87
**Purpose:** Upload application documents (business plans, proof of concept, etc.)
**Storage Path:** `application-documents/{applicationId}/{documentType}/{timestamp}-{fileName}`
**Used By:**
- `src/controllers/ApplicationController.ts` (lines 124, 261, 307)
- `src/controllers/ActivityController.ts` (line 200)

### 4. `uploadTermSheetDocument()` - Line 120
**Purpose:** Upload term sheet documents
**Storage Path:** `term-sheets/{termSheetId}/{documentType}/{timestamp}-{fileName}`
**Used By:**
- `src/controllers/TermSheetController.ts` (line 112)

### 5. `uploadTermSheetSignature()` - Line 174
**Purpose:** Upload term sheet signatures (applicant/investor)
**Storage Path:** `term-sheet-signatures/{applicationId}/{termSheetId}/{signatureType}-{timestamp}-{fileName}`
**Used By:**
- `src/services/TermSheetService.ts` (line 475)

### 6. Direct `uploadBytes()` calls (NOT using service)
**Location:** `src/services/CashbookBatchImportService.ts`
- Line 63: Direct Firebase upload for CSV imports
- Line 976: Direct Firebase upload for CSV exports
- Line 1090: Direct Firebase upload for CSV exports

---

## 📁 Detailed File-by-File Breakdown

### 1. `src/services/FirebaseStorageService.ts`
**Lines:** 1-242
- **Purpose:** Centralized Firebase Storage service
- **Upload Methods:** 5 methods (see above)
- **Firebase Config:** Hardcoded at lines 8-16
- **Storage Initialization:** Line 20

### 2. `src/services/CashbookBatchImportService.ts`
**Lines with Uploads:**
- **Line 5:** Import Firebase storage functions
- **Line 10-18:** Duplicate Firebase config (same as FirebaseStorageService)
- **Line 21:** Storage initialization
- **Line 62-64:** Direct `uploadBytes()` call for CSV imports
- **Line 976:** Direct `uploadBytes()` call for CSV export
- **Line 1090:** Direct `uploadBytes()` call for CSV export

**Note:** This file has its own Firebase initialization instead of using FirebaseStorageService.

### 3. `src/services/CashbookImportService.ts`
**Lines with Uploads:**
- **Line 70:** Calls `FirebaseStorageService.uploadImportFile()`

### 4. `src/controllers/ApplicationController.ts`
**Lines with Uploads:**
- **Line 124:** `uploadApplicationDocument()` - When creating application with documents
- **Line 261:** `uploadApplicationDocument()` - When uploading documents to existing application
- **Line 307:** `uploadApplicationDocument()` - When uploading documents without applicationId (temp upload)

**Route:** `POST /api/applications/upload-documents` (public endpoint)

### 5. `src/controllers/ActivityController.ts`
**Lines with Uploads:**
- **Line 200:** `uploadApplicationDocument()` - Uploads activity documents for tasks/goals
- **Storage Path Used:** `application-documents/activity-task-{taskId}-{timestamp}/ACTIVITY_DOCUMENT/{fileName}`

### 6. `src/controllers/TermSheetController.ts`
**Lines with Uploads:**
- **Line 112:** `uploadTermSheetDocument()` - Uploads term sheet documents

### 7. `src/services/TermSheetService.ts`
**Lines with Uploads:**
- **Line 475:** `uploadTermSheetSignature()` - Uploads term sheet signatures

### 8. `src/services/FinancialReportService.ts`
**Lines with Uploads:**
- **Line 41:** `uploadFinancialReport()` - Uploads financial reports

### 9. `src/controllers/ApplicantPortalController.ts`
**Lines with Uploads:**
- **Line 167:** `uploadFinancialReport()` - Uploads financial reports via applicant portal

### 10. `src/controllers/ProcurementController.ts`
**Lines with Uploads:**
- **Line 904:** `uploadImportFile()` - Uploads procurement import files

---

## 🔍 Additional Files with Firebase References

### Test/Script Files:
- `scripts/test-cashbook-import.ts` (line 50) - Uses `uploadImportFile()`

### Documentation:
- `CASHBOOK_IMPORT_SYSTEM_COMPLETE.md` - References Firebase uploads
- `src/config/swagger.ts` - Documents Firebase upload endpoints

---

## ⚠️ Key Issues to Address

1. **Duplicate Firebase Config:**
   - `FirebaseStorageService.ts` has Firebase config (lines 8-16)
   - `CashbookBatchImportService.ts` has duplicate Firebase config (lines 10-18)
   - **Action Needed:** Centralize Firebase config

2. **Direct uploadBytes() Calls:**
   - `CashbookBatchImportService.ts` uses direct `uploadBytes()` instead of service methods
   - **Action Needed:** Refactor to use FirebaseStorageService methods

3. **Hardcoded Firebase Credentials:**
   - All Firebase config is hardcoded in multiple files
   - **Action Needed:** Move to centralized config (similar to email config)

4. **Storage Path Inconsistencies:**
   - Activity documents use `application-documents` path but with different structure
   - **Action Needed:** Standardize storage paths

---

## 📊 Upload Statistics

| Upload Type | Count | Files |
|------------|-------|-------|
| Application Documents | 4 | ApplicationController (3), ActivityController (1) |
| Cashbook Imports | 4 | CashbookImportService (1), CashbookBatchImportService (3), ProcurementController (1) |
| Financial Reports | 2 | FinancialReportService (1), ApplicantPortalController (1) |
| Term Sheet Documents | 1 | TermSheetController (1) |
| Term Sheet Signatures | 1 | TermSheetService (1) |

**Total Direct Upload Calls:** 13+

---

## 🎯 Next Steps for Migration

When changing Firebase configuration or storage provider:

1. **Update FirebaseStorageService.ts** - Main service file
2. **Update CashbookBatchImportService.ts** - Has duplicate config
3. **Update all controller files** - ApplicationController, ActivityController, TermSheetController, ApplicantPortalController, ProcurementController
4. **Update all service files** - CashbookImportService, FinancialReportService, TermSheetService
5. **Update test/script files** - test-cashbook-import.ts

---

## 📝 Notes

- All uploads use the same Firebase project: `otcebp`
- Storage bucket: `otcebp.appspot.com`
- Most uploads go through `FirebaseStorageService`, but `CashbookBatchImportService` has direct calls
- Activity documents reuse `uploadApplicationDocument()` but with different path structure


