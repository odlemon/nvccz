# Mini-KYC Structure Update Summary

## Overview
This document summarizes the major changes made to the Mini-KYC system to support the new request body structure with `ID` and `Preferences` fields.

## Changes Made

### 1. Database Schema Changes
- **File**: `prisma/schema.prisma`
- **Change**: Updated `MiniKyc` model to store preferences as JSON array of strings
- **Migration**: Created migration `update-mini-kyc-preferences-to-string-array`

### 2. Service Layer Changes
- **File**: `src/services/MiniKycService.ts`
- **Changes**:
  - Updated `CreateMiniKycRequest` interface to use `ID` and `Preferences` fields
  - Updated `UpdateMiniKycRequest` interface to use `ID` and `Preferences` fields
  - Modified `createOrUpdateMiniKyc` method to accept the new request structure
  - Modified `updateMiniKyc` method to accept the new request structure
  - Removed dependency on authenticated user ID from request body

### 3. Controller Layer Changes
- **File**: `src/controllers/MiniKycController.ts`
- **Changes**:
  - Updated `createOrUpdateMiniKyc` to extract `ID` and `Preferences` from request body
  - Updated `updateMiniKyc` to extract `ID` and `Preferences` from request body
  - Updated `getMiniKyc` to accept `userId` as query parameter
  - Updated `deleteMiniKyc` to accept `userId` as query parameter
  - Added validation for required fields and data types

### 4. API Documentation Changes
- **File**: `src/routes/miniKycRoutes.ts`
- **Changes**:
  - Updated Swagger documentation for all endpoints
  - Changed request body schemas to reflect new structure
  - Updated response schemas to show preferences as array of strings
  - Added query parameters for GET and DELETE endpoints
  - Updated endpoint summaries and descriptions

## New Request Body Structure

### POST /api/mini-kyc (Create/Update)
```json
{
  "ID": "user-id-here",
  "Preferences": ["preference1", "preference2", "preference3"]
}
```

### PUT /api/mini-kyc (Update)
```json
{
  "ID": "user-id-here",
  "Preferences": ["updated-preference1", "updated-preference2"]
}
```

### GET /api/mini-kyc (Get)
- **Query Parameter**: `userId=user-id-here`

### DELETE /api/mini-kyc (Delete)
- **Query Parameter**: `userId=user-id-here`

## Response Structure
```json
{
  "success": true,
  "message": "Mini-KYC created/updated successfully",
  "data": {
    "id": "kyc-id",
    "userId": "user-id",
    "preferences": ["preference1", "preference2", "preference3"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## Validation Rules
1. **ID Field**: Required, must be a string
2. **Preferences Field**: Required, must be an array of strings
3. **userId Query Parameter**: Required for GET and DELETE operations

## Migration Impact
- **Database**: The migration changes the `preferences` field from JSON object to JSON array
- **Existing Data**: Existing data will be preserved but may need to be migrated to the new format
- **Backward Compatibility**: The API is not backward compatible due to the structural changes

## Testing
A comprehensive test script has been created: `test-mini-kyc-new-structure.ps1`
This script tests:
- Creating/updating KYC with new structure
- Getting KYC data
- Updating KYC data
- Validation of required fields
- Error handling

## Breaking Changes
1. **Request Body**: Changed from `{ preferences: object }` to `{ ID: string, Preferences: string[] }`
2. **Authentication**: No longer relies on authenticated user ID from JWT token
3. **API Endpoints**: GET and DELETE now require `userId` query parameter
4. **Data Type**: Preferences are now stored as array of strings instead of JSON object

## Recommendations
1. **Client Updates**: All client applications need to be updated to use the new request structure
2. **Data Migration**: Consider migrating existing KYC data to the new format if needed
3. **Testing**: Thoroughly test all KYC-related functionality with the new structure
4. **Documentation**: Update any external API documentation to reflect these changes
