# Reset Vendors for VC Fund Accounting System
$baseUrl = "http://localhost:3000"

Write-Host "=== Resetting Vendors for VC Fund ===" -ForegroundColor Green

# 1. Login and get token
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
$token = $login.token
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}
Write-Host "✅ Authentication successful" -ForegroundColor Green

# 2. Get all existing vendors
Write-Host "`n2. Getting existing vendors..." -ForegroundColor Yellow
$vendors = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
Write-Host "Found $($vendors.data.Count) existing vendors" -ForegroundColor Cyan

# 3. Delete all existing vendors
Write-Host "`n3. Deleting existing vendors..." -ForegroundColor Yellow
foreach ($vendor in $vendors.data) {
    try {
        Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$($vendor.id)" -Method DELETE -Headers $headers
        Write-Host "✅ Deleted: $($vendor.name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to delete $($vendor.name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 4. Create new vendors based on VC fund requirements
Write-Host "`n4. Creating new vendors for VC fund..." -ForegroundColor Yellow

$vcVendors = @(
    # Legal Services
    @{
        name = "Chambers Legal Associates"
        taxNumber = "LGL001234"
        contactPerson = "Advocate Sarah Moyo"
        email = "sarah.moyo@chamberslegal.co.zw"
        phone = "+263 77 123 4567"
        address = "45 Samora Machel Avenue, Harare"
        paymentTerms = "Net 30"
    },
    # Audit & Accounting
    @{
        name = "Deloitte Zimbabwe"
        taxNumber = "AUD002345"
        contactPerson = "Partner John Ndlovu"
        email = "j.ndlovu@deloitte.co.zw"
        phone = "+263 78 234 5678"
        address = "12 Enterprise Road, Harare"
        paymentTerms = "Net 30"
    },
    # Banking Services
    @{
        name = "CBZ Bank Limited"
        taxNumber = "BNK003456"
        contactPerson = "Relationship Manager Tinashe Chikomba"
        email = "t.chikomba@cbz.co.zw"
        phone = "+263 79 345 6789"
        address = "95 Samora Machel Avenue, Harare"
        paymentTerms = "Net 15"
    },
    # Insurance Services
    @{
        name = "Old Mutual Zimbabwe"
        taxNumber = "INS004567"
        contactPerson = "Account Manager Grace Mutasa"
        email = "g.mutasa@oldmutual.co.zw"
        phone = "+263 71 456 7890"
        address = "67 Leopold Takawira Street, Harare"
        paymentTerms = "Net 30"
    },
    # IT & Technology
    @{
        name = "Tech Solutions Zimbabwe"
        taxNumber = "TCH005678"
        contactPerson = "CEO David Mupfumi"
        email = "d.mupfumi@techsolutions.co.zw"
        phone = "+263 72 567 8901"
        address = "23 Nelson Mandela Avenue, Harare"
        paymentTerms = "Net 30"
    },
    # Office Supplies & Equipment
    @{
        name = "Office World Zimbabwe"
        taxNumber = "OFC006789"
        contactPerson = "Sales Manager Patricia Chiwenga"
        email = "p.chiwenga@officeworld.co.zw"
        phone = "+263 73 678 9012"
        address = "89 First Street, Harare"
        paymentTerms = "Net 15"
    },
    # Travel & Accommodation
    @{
        name = "Travel Express Zimbabwe"
        taxNumber = "TRV007890"
        contactPerson = "Business Travel Manager Tendai Marufu"
        email = "t.marufu@travelexpress.co.zw"
        phone = "+263 74 789 0123"
        address = "34 Second Street, Harare"
        paymentTerms = "Net 30"
    },
    # Marketing & Communications
    @{
        name = "Brand Communications Ltd"
        taxNumber = "MKT008901"
        contactPerson = "Creative Director Lisa Mhizha"
        email = "l.mhizha@brandcomms.co.zw"
        phone = "+263 75 890 1234"
        address = "56 Third Avenue, Harare"
        paymentTerms = "Net 45"
    },
    # Tax Advisory
    @{
        name = "Zimbabwe Revenue Authority"
        taxNumber = "TAX009012"
        contactPerson = "Tax Officer Robert Mugabe"
        email = "r.mugabe@zimra.co.zw"
        phone = "+263 76 901 2345"
        address = "Kwame Nkrumah Avenue, Harare"
        paymentTerms = "Immediate"
    },
    # Investment Advisory
    @{
        name = "Morgan Stanley Zimbabwe"
        taxNumber = "INV010123"
        contactPerson = "Investment Advisor Maria Santos"
        email = "m.santos@morganstanley.co.zw"
        phone = "+263 77 012 3456"
        address = "78 Fourth Street, Harare"
        paymentTerms = "Net 30"
    },
    # Property Management
    @{
        name = "Knight Frank Zimbabwe"
        taxNumber = "PRP011234"
        contactPerson = "Property Manager Charles Moyo"
        email = "c.moyo@knightfrank.co.zw"
        phone = "+263 78 123 4567"
        address = "90 Fifth Avenue, Harare"
        paymentTerms = "Net 30"
    },
    # Utilities & Services
    @{
        name = "Zimbabwe Electricity Supply Authority"
        taxNumber = "UTL012345"
        contactPerson = "Commercial Manager Peter Dube"
        email = "p.dube@zesa.co.zw"
        phone = "+263 79 234 5678"
        address = "123 Enterprise Road, Harare"
        paymentTerms = "Net 15"
    }
)

$createdVendors = @()

foreach ($vendor in $vcVendors) {
    try {
        $vendorJson = $vendor | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method POST -Headers $headers -Body $vendorJson
        $createdVendors += $response.data
        Write-Host "✅ Created: $($vendor.name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to create $($vendor.name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 5. Verify new vendors
Write-Host "`n5. Verifying new vendors..." -ForegroundColor Yellow
$newVendors = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
Write-Host "✅ Successfully created $($newVendors.data.Count) vendors" -ForegroundColor Green

Write-Host "`n=== Vendor Categories Created ===" -ForegroundColor Cyan
Write-Host "• Legal Services (Chambers Legal Associates)" -ForegroundColor White
Write-Host "• Audit & Accounting (Deloitte Zimbabwe)" -ForegroundColor White
Write-Host "• Banking Services (CBZ Bank Limited)" -ForegroundColor White
Write-Host "• Insurance Services (Old Mutual Zimbabwe)" -ForegroundColor White
Write-Host "• IT & Technology (Tech Solutions Zimbabwe)" -ForegroundColor White
Write-Host "• Office Supplies (Office World Zimbabwe)" -ForegroundColor White
Write-Host "• Travel & Accommodation (Travel Express Zimbabwe)" -ForegroundColor White
Write-Host "• Marketing & Communications (Brand Communications Ltd)" -ForegroundColor White
Write-Host "• Tax Advisory (Zimbabwe Revenue Authority)" -ForegroundColor White
Write-Host "• Investment Advisory (Morgan Stanley Zimbabwe)" -ForegroundColor White
Write-Host "• Property Management (Knight Frank Zimbabwe)" -ForegroundColor White
Write-Host "• Utilities & Services (Zimbabwe Electricity Supply Authority)" -ForegroundColor White

Write-Host "`n=== Vendor Reset Complete ===" -ForegroundColor Green
Write-Host "All vendors are now relevant to VC fund operations!" -ForegroundColor Cyan 