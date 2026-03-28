# Shared helpers for HTTP UAT against a running NVCCZ API.
# Override: $env:NVCCZ_BASE_URL, $env:NVCCZ_UAT_EMAIL, $env:NVCCZ_UAT_PASSWORD

function Get-UatBaseUrl {
    if ($env:NVCCZ_BASE_URL -and $env:NVCCZ_BASE_URL.Trim().Length -gt 0) {
        return $env:NVCCZ_BASE_URL.TrimEnd('/')
    }
    return 'http://localhost:3000'
}

function Get-UatLoginPayload {
    $email = 'admin@nts.com'
    if ($env:NVCCZ_UAT_EMAIL -and $env:NVCCZ_UAT_EMAIL.Trim().Length -gt 0) {
        $email = $env:NVCCZ_UAT_EMAIL.Trim()
    }
    $password = 'admin123'
    if ($env:NVCCZ_UAT_PASSWORD) {
        $password = $env:NVCCZ_UAT_PASSWORD
    }
    return @{ email = $email; password = $password }
}

function Get-UatAuthToken {
    param(
        [Parameter(Mandatory = $true)]
        [string] $BaseUrl
    )
    $json = (Get-UatLoginPayload) | ConvertTo-Json
    try {
        $resp = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $json -ContentType 'application/json; charset=utf-8' -ErrorAction Stop
    }
    catch {
        throw "Login request failed: $($_.Exception.Message)"
    }
    if (-not $resp.success) {
        throw "Login failed: $($resp.message)"
    }
    if (-not $resp.token) {
        throw 'Login response missing token'
    }
    return [string] $resp.token
}

function Get-UatAuthHeaders {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Token
    )
    return @{
        Authorization = "Bearer $Token"
    }
}
