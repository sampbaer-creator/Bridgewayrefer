param([ValidateSet('all','api','web')][string]$Service = 'all')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repo
$azureCli = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin'
if (Test-Path -LiteralPath $azureCli) { $env:PATH = $azureCli + ';' + $env:PATH }
if ($Service -eq 'api') {
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:Cosmos__Endpoint = 'https://bridgeway-dev-nosql.documents.azure.com:443/'
    $env:Bridgewayrefer__PublicOrigin = 'http://localhost:3000'
    $env:Bridgewayrefer__AcceptReferrals = 'true'
    Remove-Item Env:Cosmos__Key -ErrorAction SilentlyContinue
    dotnet run --no-build --project src/BridgeWay.Api --urls http://127.0.0.1:5180
    exit $LASTEXITCODE
}
if ($Service -eq 'web') {
    $env:BRIDGEWAYREFER_API_ORIGIN = 'http://127.0.0.1:5180'
    Set-Location -LiteralPath (Join-Path $repo 'src\bridgeway-web')
    npm.cmd run dev -- --hostname 127.0.0.1
    exit $LASTEXITCODE
}
& az account show --query '{name:name,id:id}' -o json
if ($LASTEXITCODE -ne 0) { throw 'Sign in with az login first.' }
dotnet build src/BridgeWay.Api --verbosity quiet
if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
if (!(Test-Path -LiteralPath (Join-Path $repo 'src\bridgeway-web\node_modules'))) {
    npm.cmd ci --prefix src/bridgeway-web
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency install failed.' }
}
$logs = Join-Path $repo '.local'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
foreach ($name in @('api','web')) {
    $port = if ($name -eq 'api') { 5180 } else { 3000 }
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { Write-Host "$name already listens on $port; left running."; continue }
    $launchArgs = @('-NoProfile','-File',('"' + $PSCommandPath + '"'),'-Service',$name)
    $child = Start-Process powershell.exe -ArgumentList $launchArgs -WorkingDirectory $repo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs "$name.log") -RedirectStandardError (Join-Path $logs "$name.error.log")
    $child.Id | Set-Content -LiteralPath (Join-Path $logs "$name.pid")
}
Write-Host 'API: http://127.0.0.1:5180/health/cosmos'
Write-Host 'Admin: http://localhost:3000/admin (create a business and issue a card there)'
Write-Host 'Dashboard: http://localhost:3000/staff'
Write-Host 'Logs: .local (ignored by Git). Staff sign-in uses the Entra settings in user secrets.'
