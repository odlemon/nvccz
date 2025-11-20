# 🎯 MILESTONE-BASED DISBURSEMENT IMPLEMENTATION

## 📋 Overview

The system now supports **two disbursement modes**:
1. **ONE_TIME** (default) - Single disbursement of the full amount
2. **MILESTONE_BASED** - Multiple disbursements over time based on milestones

## 🆕 New Features

### 1. **Disbursement Mode Selection**
- Set when creating investment implementation
- Options: `ONE_TIME` or `MILESTONE_BASED`
- Default: `ONE_TIME` (backward compatible)

### 2. **Total Committed Amount Tracking**
- For milestone-based disbursements, set `totalCommittedAmount`
- System tracks:
  - **Total Committed**: Amount committed for the investment
  - **Total Disbursed**: Sum of all approved/disbursed amounts
  - **Remaining Committed**: Committed - Disbursed

### 3. **Validation & Safety**
- Prevents over-disbursement in milestone mode
- Validates remaining committed amount before each disbursement
- Still validates fund has sufficient remaining amount

## 📊 Database Changes

### New Fields in `InvestmentImplementation`:
- `disbursementMode`: `String` (default: "ONE_TIME")
- `totalCommittedAmount`: `Decimal(15, 2)` (nullable)

## 🔧 API Changes

### 1. **Create Investment Implementation**

**Endpoint:** `POST /api/investment-implementations`

**New Request Body Fields:**
```json
{
  "portfolioCompanyId": "pc_123",
  "applicationId": "app_123",
  "fundId": "fund_123",
  "implementationPlan": "...",
  "notes": "...",
  "disbursementMode": "MILESTONE_BASED",  // NEW: Optional, defaults to "ONE_TIME"
  "totalCommittedAmount": 30000           // NEW: Required if MILESTONE_BASED
}
```

**Validation:**
- If `disbursementMode = "MILESTONE_BASED"`, `totalCommittedAmount` is required
- `totalCommittedAmount` must be > 0

---

### 2. **Create Fund Disbursement** (Updated)

**Endpoint:** `POST /api/investment-implementations/disbursements`

**Request Body:** (unchanged)
```json
{
  "investmentImplementationId": "impl_123",
  "milestoneId": "milestone_123",  // Optional
  "amount": 5000,
  "disbursementDate": "2024-01-15T00:00:00Z",
  "disbursementType": "MILESTONE",  // INITIAL, MILESTONE, FINAL
  "notes": "First milestone payment"
}
```

**New Validation:**
- For **ONE_TIME**: Works as before (validates fund has sufficient amount)
- For **MILESTONE_BASED**: 
  - Validates fund has sufficient amount ✅
  - Validates remaining committed amount ✅
  - Prevents over-disbursement ✅

**Example Error Messages:**
- `"Insufficient remaining committed amount. Remaining: $5,000.00, Requested: $10,000.00"`
- `"Total committed amount must be set for milestone-based disbursements"`

---

### 3. **Get Disbursement Summary** (NEW)

**Endpoint:** `GET /api/investment-implementations/:investmentImplementationId/disbursement-summary`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalCommittedAmount": 30000,
    "totalDisbursedAmount": 10000,
    "remainingCommittedAmount": 20000,
    "disbursementCount": 2,
    "disbursementMode": "MILESTONE_BASED",
    "disbursements": [
      {
        "id": "disb_1",
        "amount": "5000.00",
        "status": "APPROVED",
        "disbursementType": "INITIAL",
        "disbursementDate": "2024-01-15T00:00:00Z"
      },
      {
        "id": "disb_2",
        "amount": "5000.00",
        "status": "APPROVED",
        "disbursementType": "MILESTONE",
        "disbursementDate": "2024-02-15T00:00:00Z"
      }
    ]
  }
}
```

## 📝 Usage Examples

### Example 1: Milestone-Based Disbursement

**Step 1: Create Investment Implementation**
```bash
POST /api/investment-implementations
{
  "portfolioCompanyId": "pc_123",
  "applicationId": "app_123",
  "fundId": "fund_123",
  "disbursementMode": "MILESTONE_BASED",
  "totalCommittedAmount": 30000
}
```

**Step 2: Create First Disbursement (5k)**
```bash
POST /api/investment-implementations/disbursements
{
  "investmentImplementationId": "impl_123",
  "amount": 5000,
  "disbursementDate": "2024-01-15T00:00:00Z",
  "disbursementType": "INITIAL"
}
```

**Step 3: Approve First Disbursement**
```bash
POST /api/investment-implementations/disbursements/disb_1/approve
```

**Step 4: Check Summary**
```bash
GET /api/investment-implementations/impl_123/disbursement-summary
# Returns: remainingCommittedAmount: 25000
```

**Step 5: Create Second Disbursement (5k)**
```bash
POST /api/investment-implementations/disbursements
{
  "investmentImplementationId": "impl_123",
  "amount": 5000,
  "disbursementDate": "2024-02-15T00:00:00Z",
  "disbursementType": "MILESTONE"
}
```

**Step 6: Try to Over-Disburse (Will Fail)**
```bash
POST /api/investment-implementations/disbursements
{
  "investmentImplementationId": "impl_123",
  "amount": 30000,  # More than remaining (20k)
  "disbursementDate": "2024-03-15T00:00:00Z",
  "disbursementType": "MILESTONE"
}
# Error: "Insufficient remaining committed amount. Remaining: $20,000.00, Requested: $30,000.00"
```

---

### Example 2: One-Time Disbursement (Existing Behavior)

**Step 1: Create Investment Implementation**
```bash
POST /api/investment-implementations
{
  "portfolioCompanyId": "pc_123",
  "applicationId": "app_123",
  "fundId": "fund_123"
  # disbursementMode defaults to "ONE_TIME"
}
```

**Step 2: Create Full Disbursement**
```bash
POST /api/investment-implementations/disbursements
{
  "investmentImplementationId": "impl_123",
  "amount": 30000,
  "disbursementDate": "2024-01-15T00:00:00Z",
  "disbursementType": "INITIAL"
}
```

**Works exactly as before - no changes to existing functionality!**

## ✅ Backward Compatibility

- **Existing implementations** continue to work (defaults to `ONE_TIME`)
- **Existing disbursements** are unaffected
- **No breaking changes** to existing APIs
- **New fields are optional** (except when using milestone mode)

## 🚀 Setup Instructions

1. **Update Database:**
   ```bash
   node update-db-milestone-disbursements.js
   ```

2. **Generate Prisma Client:**
   ```bash
   npx prisma generate
   ```

3. **Restart Server:**
   ```bash
   npm run dev
   ```

## 📊 Tracking & Reporting

The system now tracks:
- ✅ Total committed amount per investment
- ✅ Total disbursed amount (sum of approved/disbursed)
- ✅ Remaining committed amount
- ✅ Number of disbursements
- ✅ Disbursement mode (ONE_TIME vs MILESTONE_BASED)
- ✅ Full history of all disbursements

## 🔒 Safety Features

1. **Prevents Over-Disbursement**: Cannot disburse more than committed amount
2. **Fund Validation**: Still validates fund has sufficient remaining amount
3. **Status Tracking**: Only counts APPROVED/DISBURSED amounts in calculations
4. **Mode Validation**: Ensures totalCommittedAmount is set for milestone mode

## 🎯 Use Cases

**Milestone-Based:**
- Monthly payments (e.g., 5k/month for 6 months = 30k total)
- Milestone-based releases (e.g., 10k on product launch, 10k on first sale)
- Phased investments (e.g., 20k initial, 10k after 6 months)

**One-Time:**
- Full upfront payment
- Single disbursement of entire amount
- Traditional investment structure

