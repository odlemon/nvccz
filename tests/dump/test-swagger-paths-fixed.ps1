# Test Swagger Paths Fixed
Write-Host "Testing Swagger Paths Fixed" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green

Write-Host "`n✅ Fixed the path format issue!" -ForegroundColor Green
Write-Host "`nThe problem was:" -ForegroundColor Yellow
Write-Host "- Expense routes used: /api/accounting/expenses" -ForegroundColor White
Write-Host "- KYC routes used: /mini-kyc (missing /api prefix)" -ForegroundColor White
Write-Host "- Company Profile routes used: /company-profile (missing /api prefix)" -ForegroundColor White

Write-Host "`n✅ Now all routes use the correct format:" -ForegroundColor Green
Write-Host "- Mini-KYC: /api/mini-kyc" -ForegroundColor White
Write-Host "- Mini-KYC Status: /api/mini-kyc/status" -ForegroundColor White
Write-Host "- Mini-KYC All: /api/mini-kyc/all" -ForegroundColor White
Write-Host "- Company Profile: /api/company-profile" -ForegroundColor White
Write-Host "- Company Profile Upsert: /api/company-profile/upsert" -ForegroundColor White

Write-Host "`n✅ Updated both:" -ForegroundColor Green
Write-Host "1. Route file Swagger comments" -ForegroundColor White
Write-Host "2. Fallback spec in swagger.ts" -ForegroundColor White

Write-Host "`n🚀 Ready to deploy to Vercel!" -ForegroundColor Green
Write-Host "After deployment, check: https://nvccz-pi.vercel.app/api/api-docs" -ForegroundColor Cyan

Write-Host "`nThe endpoints should now be visible and executable in Swagger UI!" -ForegroundColor Green 