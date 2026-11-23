<#
.SYNOPSIS
  Deploy BridgeWay to Azure Container Apps from the existing local checkout.

.DESCRIPTION
  Runs in the repository you already have (for example C:\Users\sampb\Documents\BridgeWay).
  It never clones the repository and never creates a Git worktree. Images are built remotely
  with `az acr build`, which uploads a temporary source archive from the system temp folder
  and deletes it afterwards. The rollout itself is scripts/deploy-production.sh, the same
  staged rollout the GitHub workflow uses.

  Safety checks: the working tree must be clean and HEAD must equal the freshly fetched
  origin/main, so production only ever receives reviewed, merged code.

.EXAMPLE
  .\scripts\Deploy-Production.ps1 -DryRun   # validate everything, change nothing in Azure
  .\scripts\Deploy-Production.ps1           # build images and run the staged rollout
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$ResourceGroup = 'BridgeWay',
    [string]$AcrName = 'bridgewayacr3560',
    [string]$ApiApp = 'bridgeway-api',
    [string]$WebApp = 'bridgeway-web',
    [string]$PublicOrigin = 'https://bridgewayrefer.com'
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

# Work from the repository that contains this script; no copy is made.
$repoRoot = (& git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'This script must live inside the BridgeWay Git repository.' }
Set-Location $repoRoot
Write-Host "[deploy] Repository: $repoRoot"

$dirty = & git status --porcelain
if ($dirty) { throw "Uncommitted changes found. Commit or move them before deploying:`n$($dirty -join "`n")" }

Invoke-Checked git @('fetch', '--quiet', 'origin', 'main')
$sha = (& git rev-parse HEAD).Trim()
$mainSha = (& git rev-parse origin/main).Trim()
if ($sha -ne $mainSha) {
    throw "HEAD ($sha) is not the latest origin/main ($mainSha). Check out main and pull before deploying."
}
Write-Host "[deploy] Commit: $sha"

foreach ($tool in 'az', 'bash') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is required but was not found on PATH." }
}
Invoke-Checked az @('account', 'show', '--query', 'name', '-o', 'tsv')

$acrLoginServer = (& az acr show --name $AcrName --resource-group $ResourceGroup --query loginServer -o tsv).Trim()
if ($LASTEXITCODE -ne 0 -or -not $acrLoginServer) { throw "Could not read Azure Container Registry $AcrName." }
foreach ($app in $ApiApp, $WebApp) {
    $mode = (& az containerapp show -n $app -g $ResourceGroup --query properties.configuration.activeRevisionsMode -o tsv).Trim()
    if ($mode -ne 'Multiple') { throw "$app is in '$mode' revision mode; the staged rollout requires Multiple." }
}
Write-Host "[deploy] Registry $acrLoginServer and apps $ApiApp, $WebApp are reachable."

if ($DryRun) {
    Invoke-Checked bash @('-n', 'scripts/deploy-production.sh')
    Write-Host '[deploy] Dry run passed. No images were built and no traffic was changed.'
    return
}

Invoke-Checked az @('acr', 'build', '--registry', $AcrName, '--image', "bridgeway-api:$sha", '--file', 'src/BridgeWay.Api/Dockerfile', '.')
Invoke-Checked az @('acr', 'build', '--registry', $AcrName, '--image', "bridgeway-web:$sha", '--file', 'src/bridgeway-web/Dockerfile', '.')

$env:SHA = $sha
$env:ACR_LOGIN_SERVER = $acrLoginServer
$env:ACR_NAME = $AcrName
$env:RESOURCE_GROUP = $ResourceGroup
$env:API_APP = $ApiApp
$env:WEB_APP = $WebApp
$env:PUBLIC_ORIGIN = $PublicOrigin
$env:DEPLOYMENT_ID = "local-$(Get-Date -Format 'yyyyMMddHHmmss')"
Invoke-Checked bash @('scripts/deploy-production.sh')
Write-Host '[deploy] Production rollout finished.'
