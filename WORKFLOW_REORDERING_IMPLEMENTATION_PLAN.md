# 🔄 WORKFLOW REORDERING - IMPLEMENTATION PLAN

## 📋 CURRENT WORKFLOW vs NEW WORKFLOW

### **CURRENT WORKFLOW:**
```
Application → Due Diligence → Board Review → Term Sheet → Investment Implementation
                                    ↓
                          (Creates User & Portfolio Company)
```

### **NEW WORKFLOW:**
```
Application → Due Diligence → Term Sheet → Board Review → Investment Implementation
                    ↓
          (Creates User & Portfolio Company)
```

---

## 🎯 CHANGES REQUIRED

### **1. DUE DILIGENCE COMPLETION** (`DueDiligenceService.completeDueDiligence()`)

**Current Behavior:**
- Sets application stage to `UNDER_BOARD_REVIEW`
- Does NOT create user/portfolio company

**New Behavior:**
- If recommendation is `APPROVE`:
  - **Create user and portfolio company** (move from BoardReviewService)
  - Set application stage to `TERM_SHEET` or `TERM_SHEET_NEGOTIATION`
- If recommendation is `REJECT`:
  - Set application stage to `REJECTED`
- If recommendation is `CONDITIONAL`:
  - Set application stage to `TERM_SHEET` or `TERM_SHEET_NEGOTIATION` (still create user/company)

**Files to Modify:**
- `src/services/DueDiligenceService.ts` (lines 360-500)
  - Import `BoardReviewService.createUserAndPortfolioCompany()` OR move the method to a shared service
  - Change stage from `UNDER_BOARD_REVIEW` to `TERM_SHEET`
  - Add user/portfolio company creation logic

---

### **2. TERM SHEET SIGNING** (`TermSheetService.signTermSheet()`)

**Current Behavior:**
- Sets application stage to `INVESTMENT_IMPLEMENTATION`
- Requires term sheet to be `FINAL`

**New Behavior:**
- Sets application stage to `UNDER_BOARD_REVIEW` (instead of `INVESTMENT_IMPLEMENTATION`)
- Still requires term sheet to be `FINAL`
- Update email notification to reflect new stage

**Files to Modify:**
- `src/services/TermSheetService.ts` (lines 420-424)
  - Change stage from `INVESTMENT_IMPLEMENTATION` to `UNDER_BOARD_REVIEW`
  - Update notification message

---

### **3. BOARD REVIEW COMPLETION** (`BoardReviewService.completeBoardReview()`)

**Current Behavior:**
- When stage moves to `BOARD_APPROVED`:
  - Creates user and portfolio company
  - Sets application stage to `BOARD_APPROVED`
- Then application moves to `TERM_SHEET_NEGOTIATION`

**New Behavior:**
- When stage moves to `BOARD_APPROVED`:
  - **DO NOT create user/portfolio company** (already created in Due Diligence)
  - Set application stage to `INVESTMENT_IMPLEMENTATION` (instead of `TERM_SHEET_NEGOTIATION`)
- When stage moves to `BOARD_REJECTED`:
  - Set application stage to `REJECTED`
- When stage moves to `BOARD_CONDITIONAL`:
  - Handle conditional approval (may need to go back to term sheet or proceed)

**Files to Modify:**
- `src/services/BoardReviewService.ts` (lines 870-896)
  - Remove user/portfolio company creation logic
  - Change stage from `TERM_SHEET_NEGOTIATION` to `INVESTMENT_IMPLEMENTATION`
  - Update notification messages

---

### **4. TERM SHEET CREATION** (`TermSheetService.createTermSheet()`)

**Current Behavior:**
- Requires application to be in `BOARD_APPROVED` or `TERM_SHEET` stage
- Updates stage to `TERM_SHEET` if currently `BOARD_APPROVED`

**New Behavior:**
- Requires application to be in `TERM_SHEET` or `TERM_SHEET_NEGOTIATION` stage
- Should work with the new flow (after due diligence)

**Files to Modify:**
- `src/services/TermSheetService.ts` (lines 70-72)
  - Update validation to accept `TERM_SHEET` or `TERM_SHEET_NEGOTIATION` (remove `BOARD_APPROVED` check)

---

### **5. BOARD REVIEW CREATION** (`BoardReviewService.createBoardReview()`)

**Current Behavior:**
- Requires application to be in `UNDER_BOARD_REVIEW` stage

**New Behavior:**
- Still requires application to be in `UNDER_BOARD_REVIEW` stage
- But now this stage comes AFTER term sheet signing (not after due diligence)

**Files to Modify:**
- `src/services/BoardReviewService.ts` (lines 520-522)
  - No changes needed (validation is correct)

---

### **6. APPLICATION STAGE TRANSITIONS** (`ApplicationService.changeApplicationStage()`)

**Current Valid Transitions:**
```typescript
"DUE_DILIGENCE_COMPLETED": ["UNDER_BOARD_REVIEW", "REJECTED"],
"UNDER_BOARD_REVIEW": ["BOARD_APPROVED", "BOARD_REJECTED", "BOARD_CONDITIONAL"],
"BOARD_APPROVED": ["TERM_SHEET_NEGOTIATION"],
"TERM_SHEET_NEGOTIATION": ["IMPLEMENTATION"],
```

**New Valid Transitions:**
```typescript
"DUE_DILIGENCE_COMPLETED": ["TERM_SHEET", "TERM_SHEET_NEGOTIATION", "REJECTED"],
"TERM_SHEET": ["TERM_SHEET_NEGOTIATION", "UNDER_BOARD_REVIEW", "REJECTED"],
"TERM_SHEET_NEGOTIATION": ["UNDER_BOARD_REVIEW", "REJECTED"],
"UNDER_BOARD_REVIEW": ["BOARD_APPROVED", "BOARD_REJECTED", "BOARD_CONDITIONAL"],
"BOARD_APPROVED": ["INVESTMENT_IMPLEMENTATION", "REJECTED"],
"BOARD_CONDITIONAL": ["TERM_SHEET", "BOARD_REJECTED"],
"INVESTMENT_IMPLEMENTATION": ["DISBURSED", "FUNDED"],
```

**Files to Modify:**
- `src/services/ApplicationService.ts` (lines 499-509)
  - Update `validTransitions` object

---

### **7. INVESTMENT IMPLEMENTATION INITIATION** (`InvestmentImplementationService.initiateInvestmentImplementation()`)

**Current Behavior:**
- Requires application to be in `INVESTMENT_IMPLEMENTATION` stage
- Requires signed term sheet

**New Behavior:**
- Still requires application to be in `INVESTMENT_IMPLEMENTATION` stage
- Still requires signed term sheet
- But now this comes AFTER board review (not after term sheet signing)

**Files to Modify:**
- `src/services/InvestmentImplementationService.ts` (lines 214-216)
  - No changes needed (validation is correct)

---

### **8. EMAIL NOTIFICATIONS**

**Current Notifications:**
- Due diligence completed → "Due diligence completed, moving to board review"
- Board approved → "Account created, you can now sign term sheet"
- Term sheet signed → "Moving to investment implementation"

**New Notifications:**
- Due diligence completed → "Due diligence completed, account created, you can now review term sheet"
- Term sheet signed → "Term sheet signed, moving to board review"
- Board approved → "Board approved, moving to investment implementation"

**Files to Modify:**
- `src/services/DueDiligenceService.ts` - Update notification message
- `src/services/TermSheetService.ts` - Update notification message
- `src/services/BoardReviewService.ts` - Update notification message
- `src/services/EmailNotificationService.ts` - May need new email templates

---

### **9. STAGE CHANGE VALIDATION**

**Files to Check:**
- Any other services that check for specific stages
- Frontend code that displays stage-based UI
- API documentation

---

## 📝 IMPLEMENTATION STEPS

### **Step 1: Move User/Portfolio Company Creation Logic**
1. Extract `createUserAndPortfolioCompany()` from `BoardReviewService` to a shared utility service OR keep it in BoardReviewService but call it from DueDiligenceService
2. Import and call it in `DueDiligenceService.completeDueDiligence()`

### **Step 2: Update Due Diligence Completion**
1. Change stage from `UNDER_BOARD_REVIEW` to `TERM_SHEET`
2. Add user/portfolio company creation when recommendation is `APPROVE`
3. Update email notification

### **Step 3: Update Term Sheet Signing**
1. Change stage from `INVESTMENT_IMPLEMENTATION` to `UNDER_BOARD_REVIEW`
2. Update email notification

### **Step 4: Update Board Review Completion**
1. Remove user/portfolio company creation logic
2. Change stage from `TERM_SHEET_NEGOTIATION` to `INVESTMENT_IMPLEMENTATION`
3. Update email notification

### **Step 5: Update Term Sheet Creation Validation**
1. Update validation to accept `TERM_SHEET` or `TERM_SHEET_NEGOTIATION` (remove `BOARD_APPROVED`)

### **Step 6: Update Application Stage Transitions**
1. Update `validTransitions` in `ApplicationService.changeApplicationStage()`

### **Step 7: Update Email Notifications**
1. Update all email notification messages to reflect new workflow
2. Test email sending

### **Step 8: Testing**
1. Test complete workflow:
   - Application → Due Diligence (creates user/company) → Term Sheet → Board Review → Investment Implementation
2. Test edge cases:
   - Rejected applications
   - Conditional approvals
   - Existing users
3. Test stage transitions
4. Test email notifications

---

## ⚠️ POTENTIAL ISSUES & CONSIDERATIONS

### **1. Existing Data**
- Applications already in `UNDER_BOARD_REVIEW` or `BOARD_APPROVED` may need manual migration
- Applications with signed term sheets but no board review may need special handling

### **2. User/Portfolio Company Creation**
- What if user already exists? (Current logic handles this)
- What if portfolio company already exists? (Current logic handles this)
- Should we create user/company even if recommendation is `CONDITIONAL`?

### **3. Term Sheet Access**
- Users need to be able to access term sheet before board review
- This is now possible since user/company is created after due diligence

### **4. Board Review Access**
- Board review now happens after term sheet signing
- This means applicant has already agreed to terms before board reviews
- May need to clarify this in the workflow

### **5. Conditional Approvals**
- If board gives conditional approval, where does it go?
- Back to term sheet? Or proceed with conditions?

### **6. Investment Implementation**
- Still requires signed term sheet (correct)
- Still requires board approval (correct)
- Now both are satisfied before reaching this stage

---

## ✅ VALIDATION CHECKLIST

After implementation, verify:
- [ ] Due diligence completion creates user/portfolio company
- [ ] Due diligence completion moves to TERM_SHEET stage
- [ ] Term sheet can be created after due diligence
- [ ] Term sheet signing moves to UNDER_BOARD_REVIEW
- [ ] Board review can be created after term sheet signing
- [ ] Board review completion moves to INVESTMENT_IMPLEMENTATION
- [ ] Board review completion does NOT create user/company (already exists)
- [ ] Investment implementation can be initiated after board approval
- [ ] All email notifications are correct
- [ ] Stage transitions are validated correctly
- [ ] Edge cases are handled (rejections, conditionals, existing users)

---

## 🚀 READY TO IMPLEMENT?

This plan outlines all the changes needed. Should I proceed with the implementation?

