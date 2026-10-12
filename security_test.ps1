$ErrorActionPreference = "Stop"

$proxyBase = "http://127.0.0.1:8080"
$djangoBase = "http://127.0.0.1:8000"

# Ensure curl is available.
if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    throw "curl.exe was not found. Install or enable curl on Windows."
}

# Send an HTTP request and return its status code.
function Get-HttpStatus {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,

        [string]$Method = "GET",

        [string[]]$Headers = @()
    )

    $curlArgs = @(
        "-s",
        "-o", "NUL",
        "-w", "%{http_code}",
        "--max-time", "5",
        "-X", $Method
    )

    foreach ($header in $Headers) {
        $curlArgs += @("-H", $header)
    }

    $output = & curl.exe @curlArgs $Url 2>$null
    $curlExitCode = $LASTEXITCODE

    # Return 0 if the server could not be reached.
    if ($curlExitCode -ne 0) {
        return 0
    }

    $statusText = ($output | Out-String).Trim()
    $status = 0

    if ([int]::TryParse($statusText, [ref]$status)) {
        return $status
    }

    return 0
}

$results = [System.Collections.Generic.List[object]]::new()

# --------------------------------------------------
# TEST 1: A real API endpoint works through the proxy
# --------------------------------------------------

$status = Get-HttpStatus "$proxyBase/api/posts/"

$results.Add([pscustomobject]@{
    Test     = "API accessible through proxy"
    Expected = 200
    Actual   = $status
    Passed   = ($status -eq 200)
})

# --------------------------------------------------
# TEST 2: Direct Django access without the internal key
# --------------------------------------------------

$status = Get-HttpStatus "$djangoBase/api/posts/"

$results.Add([pscustomobject]@{
    Test     = "Direct Django access without key"
    Expected = 403
    Actual   = $status
    Passed   = ($status -eq 403)
})

# --------------------------------------------------
# TEST 3: A fake internal key must be rejected
# --------------------------------------------------

$status = Get-HttpStatus `
    "$djangoBase/api/posts/" `
    "GET" `
    @("X-Gatekeeper-Internal-Key: invalid-test-key")

$results.Add([pscustomobject]@{
    Test     = "Invalid internal key rejected"
    Expected = 403
    Actual   = $status
    Passed   = ($status -eq 403)
})

# --------------------------------------------------
# TEST 4: Unsupported HTTP method must be rejected
# --------------------------------------------------

$status = Get-HttpStatus `
    "$proxyBase/api/posts/" `
    "PATCH"

$results.Add([pscustomobject]@{
    Test     = "Unsupported PATCH method"
    Expected = 405
    Actual   = $status
    Passed   = ($status -eq 405)
})

# --------------------------------------------------
# TEST 5: Non-API proxy routes must be rejected
# --------------------------------------------------

$status = Get-HttpStatus "$proxyBase/not-an-api-route"

$results.Add([pscustomobject]@{
    Test     = "Non-API route rejected"
    Expected = 404
    Actual   = $status
    Passed   = ($status -eq 404)
})

# --------------------------------------------------
# TEST 6: Unknown API endpoint should return 404
# --------------------------------------------------

$status = Get-HttpStatus `
    "$proxyBase/api/security-test-nonexistent/"

$results.Add([pscustomobject]@{
    Test     = "Unknown API endpoint"
    Expected = 404
    Actual   = $status
    Passed   = ($status -eq 404)
})

# --------------------------------------------------
# TEST 7: Rate limiting should block excessive requests
# --------------------------------------------------

$rateStatuses = @()

for ($i = 1; $i -le 35; $i++) {
    $rateStatuses += Get-HttpStatus "$proxyBase/api/posts/"
}

$rateLimitedCount = @(
    $rateStatuses | Where-Object { $_ -eq 429 }
).Count

$results.Add([pscustomobject]@{
    Test     = "IP rate limiting"
    Expected = "At least one 429"
    Actual   = "$rateLimitedCount requests blocked"
    Passed   = ($rateLimitedCount -gt 0)
})

# --------------------------------------------------
# DISPLAY RESULTS
# --------------------------------------------------

Write-Host ""
Write-Host "GATEKEEPER SECURITY TEST RESULTS" -ForegroundColor Cyan
Write-Host ""

$results | Format-Table -AutoSize

$failed = @(
    $results | Where-Object { -not $_.Passed }
).Count

$passed = $results.Count - $failed

Write-Host ""
Write-Host "Passed: $passed / $($results.Count)" -ForegroundColor Green
Write-Host "Failed: $failed / $($results.Count)" `
    -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

if ($failed -gt 0) {
    exit 1
}

Write-Host ""
Write-Host "All security checks passed." -ForegroundColor Green