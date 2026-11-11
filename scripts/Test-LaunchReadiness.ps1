param([string]$Origin = 'https://bridgewayrefer.com')
$ErrorActionPreference = 'Stop'
$Origin = $Origin.TrimEnd('/')
$failures = 0
$paths = @('/', '/contact', '/pricing', '/privacy', '/terms', '/security', '/robots.txt', '/sitemap.xml', '/icon.svg', '/share.png', '/health/cosmos')
foreach ($path in $paths) {
    try {
        $response = Invoke-WebRequest -Uri ($Origin + $path) -MaximumRedirection 5
        if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode)" }
        Write-Output "PASS $path"
        if ($path -eq '/' -and ($response.Content -notmatch 'name="description"' -or $response.Content -notmatch 'rel="canonical"')) { throw 'Homepage metadata missing' }
        if ($path -eq '/health/cosmos' -and (($response.Content | ConvertFrom-Json).status -ne 'connected')) { throw 'Cosmos is not connected' }
    } catch { $failures++; Write-Output "FAIL $path : $($_.Exception.Message)" }
}
try {
    # Do not print the full authorization URL, which includes state and nonce.
    $client = [System.Net.Http.HttpClient]::new([System.Net.Http.HttpClientHandler]@{ AllowAutoRedirect = $false })
    $response = $client.GetAsync($Origin + '/staff/login').GetAwaiter().GetResult()
    $location = $response.Headers.Location
    if ([int]$response.StatusCode -ne 302 -or $null -eq $location) { throw 'Expected Microsoft authorization redirect' }
    $expected = [uri]::EscapeDataString($Origin + '/signin-oidc')
    if ($location.Query -notlike "*redirect_uri=$expected&*") { throw 'Microsoft callback does not use the requested public origin' }
    Write-Output 'PASS canonical authentication callback'
} catch { $failures++; Write-Output "FAIL authentication: $($_.Exception.Message)" }
finally { if ($client) { $client.Dispose() } }
Write-Output 'Still required: external-user sign-in, permitted staff update, controlled referral, actual alert receipt, and Stripe test lifecycle.'
if ($failures -gt 0) { exit 1 }
