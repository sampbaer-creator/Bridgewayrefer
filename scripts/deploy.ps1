[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('all', 'web', 'api', 'status', 'rollback', 'help')]
    [string] $Target = 'all'
)

$ErrorActionPreference = 'Stop'
$SubscriptionId = '91a3efb2-bb44-43ae-872c-5b15b81689cd'
$ResourceGroup = 'BridgeWay'
$AcrName = 'bridgewayacr3560'
$AcrServer = 'bridgewayacr3560.azurecr.io'
$ApiApp = 'bridgeway-api'
$WebApp = 'bridgeway-web'
$PublicOrigin = 'https://bridgewayrefer.com'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:DeployResults = @()

function Invoke-Native {
    param([string] $File, [string[]] $Arguments)
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE." }
}

function Get-AzValue {
    param([string[]] $Arguments)
    $output = & az @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI query failed: az $($Arguments -join ' ')." }
    return ($output | ConvertFrom-Json)
}

function Test-Http {
    param([string] $Uri, [int] $Attempts = 1)
    for ($i = 0; $i -lt $Attempts; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Uri -TimeoutSec 25 -MaximumRedirection 5 -UseBasicParsing
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { return $true }
        } catch { }
        if ($i + 1 -lt $Attempts) { Start-Sleep -Seconds 10 }
    }
    return $false
}

function Test-JsonHealth {
    param([string] $Uri, [string] $ExpectedStatus)
    try {
        $response = Invoke-RestMethod -Uri $Uri -TimeoutSec 25 -UseBasicParsing
        return ($response.status -eq $ExpectedStatus)
    } catch { return $false }
}

function Show-Status {
    foreach ($app in @($ApiApp, $WebApp)) {
        Write-Host "`n$app"
        $revisions = Get-AzValue @('containerapp','revision','list','--name',$app,'--resource-group',$ResourceGroup,'--output','json')
        foreach ($revision in $revisions) {
            $weight = $revision.properties.trafficWeight
            Write-Host ("  {0} | {1} | {2} | traffic {3}% | {4}" -f $revision.name,$revision.properties.healthState,($(if($revision.properties.active){'active'}else{'inactive'})),$(if($null -eq $weight){0}else{$weight}),$revision.properties.template.containers[0].image)
        }
        $traffic = Get-AzValue @('containerapp','ingress','traffic','show','--name',$app,'--resource-group',$ResourceGroup,'--output','json')
        Write-Host '  Traffic targets:'
        foreach ($route in $traffic) { Write-Host ("    {0}: {1}%" -f $route.revisionName,$route.weight) }
    }
    $webOk = Test-Http "$PublicOrigin/"
    $apiOk = Test-JsonHealth "$PublicOrigin/health/cosmos" 'connected'
    Write-Host "Website: $(if($webOk){'healthy'}else{'FAILED'}) ($PublicOrigin/)"
    Write-Host "API/Cosmos health via website: $(if($apiOk){'healthy'}else{'FAILED'}) ($PublicOrigin/health/cosmos)"
}

function Assert-Preflight {
    foreach ($tool in @('az','dotnet','node','npm')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Required command '$tool' was not found on PATH." }
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "Required command 'git' was not found on PATH." }
    $account = Get-AzValue @('account','show','--output','json')
    if ($account.id -ne $SubscriptionId) { throw "Azure CLI is using subscription $($account.id), expected $SubscriptionId. Run az account set --subscription $SubscriptionId and retry." }
    $null = Get-AzValue @('group','show','--name',$ResourceGroup,'--output','json')
    $acr = Get-AzValue @('acr','show','--name',$AcrName,'--resource-group',$ResourceGroup,'--output','json')
    if ($acr.loginServer -ne $AcrServer) { throw "Unexpected ACR login server '$($acr.loginServer)'." }
    foreach ($app in @($ApiApp,$WebApp)) {
        $appInfo = Get-AzValue @('containerapp','show','--name',$app,'--resource-group',$ResourceGroup,'--output','json')
        if ($appInfo.properties.configuration.activeRevisionsMode -ne 'Multiple') { throw "$app is not in multiple revision mode; staged deployment is unavailable. No Azure settings were changed." }
    }
}

function Assert-ProductionBranch {
    $branch = & git -C $RepoRoot branch --show-current
    if ($LASTEXITCODE -ne 0) { throw 'Could not determine the current Git branch.' }
    if ($branch -ne 'main') { throw "Current branch is '$branch'. Production deploys require main. Review and push your feature branch, then use the approved production merge workflow before deploying." }
    $status = & git -C $RepoRoot status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Git working tree.' }
    if ($status) { throw 'Working tree has uncommitted changes. Review, commit, and push the intended changes before deploying.' }
    $aheadBehind = & git -C $RepoRoot rev-list --left-right --count 'origin/main...HEAD'
    if ($LASTEXITCODE -ne 0) { throw 'Could not compare with origin/main. Fetch the remote and retry.' }
    $counts = ($aheadBehind -split '\s+')
    if ($counts.Count -lt 2 -or $counts[0] -ne '0') { throw 'Local main is behind origin/main. Fetch and fast-forward before deploying.' }
}

function Invoke-Rollback {
    Assert-Preflight
    foreach ($app in @($ApiApp,$WebApp)) {
        Write-Host "`n$app healthy revisions:"
        $revisions = Get-AzValue @('containerapp','revision','list','--name',$app,'--resource-group',$ResourceGroup,'--query',"[?properties.healthState=='Healthy'].{name:name,created:properties.createdTime,traffic:properties.trafficWeight,image:properties.template.containers[0].image}",'--output','json')
        $revisions | Format-Table -AutoSize
    }
    $appName = Read-Host 'Enter exactly bridgeway-web or bridgeway-api to choose a rollback target'
    if ($appName -notin @($ApiApp,$WebApp)) { throw 'Rollback cancelled: app name did not match.' }
    $all = Get-AzValue @('containerapp','revision','list','--name',$appName,'--resource-group',$ResourceGroup,'--query',"[?properties.healthState=='Healthy'].{name:name,created:properties.createdTime,traffic:properties.trafficWeight,image:properties.template.containers[0].image}",'--output','json')
    $targetRevision = Read-Host 'Enter the exact healthy revision name to receive 100% traffic'
    if ($targetRevision -notin @($all.name)) { throw 'Rollback cancelled: revision is not currently healthy for that app.' }
    $confirm = Read-Host "Type ROLLBACK to route $appName to $targetRevision"
    if ($confirm -cne 'ROLLBACK') { Write-Host 'Rollback cancelled.'; return }
    Invoke-Native 'az' @('containerapp','ingress','traffic','set','--name',$appName,'--resource-group',$ResourceGroup,'--revision-weight',"$targetRevision=100",'--output','none')
    Start-Sleep -Seconds 15
    Show-Status
}

function Invoke-Deploy {
    param([string[]] $Apps)
    Assert-ProductionBranch
    Assert-Preflight
    if ($Apps -contains $ApiApp) { Invoke-Native 'dotnet' @('test','tests/BridgeWay.Api.Tests','--configuration','Release') }
    Push-Location (Join-Path $RepoRoot 'src/bridgeway-web')
    try {
        if ($Apps -contains $WebApp) {
            Invoke-Native 'npm' @('ci')
            Invoke-Native 'npm' @('run','build')
            Invoke-Native 'npx' @('playwright','install','chromium')
            Invoke-Native 'npx' @('playwright','test')
        }
    } finally { Pop-Location }

    $commit = & git -C $RepoRoot rev-parse --short=12 HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not determine the current Git commit.' }
    $tag = '{0}-{1}-{2}' -f (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'),$commit,(Get-Random -Minimum 1000 -Maximum 9999)
    $built = @()
    foreach ($app in $Apps) {
        $repo = if ($app -eq $ApiApp) {'bridgeway-api'} else {'bridgeway-web'}
        $dockerfile = if ($app -eq $ApiApp) {'src/BridgeWay.Api/Dockerfile'} else {'src/bridgeway-web/Dockerfile'}
        $image = "$AcrServer/${repo}:$tag"
        $built += [pscustomobject]@{ App=$app; Repo=$repo; Image=$image; Tag=$tag }
    }
    $previousEncoding = $env:PYTHONIOENCODING
    try {
        # Azure CLI streams non-ASCII ACR build logs; force UTF-8 on Windows PowerShell consoles.
        $env:PYTHONIOENCODING = 'utf-8'
        foreach ($item in $built) {
            $dockerfile = if ($item.App -eq $ApiApp) {'src/BridgeWay.Api/Dockerfile'} else {'src/bridgeway-web/Dockerfile'}
            $buildArgs = @('acr','build','--registry',$AcrName,'--image',"$($item.Repo):$tag",'--file',$dockerfile)
            if ($item.App -eq $WebApp) { $buildArgs += @('--build-arg','BRIDGEWAYREFER_API_ORIGIN=https://bridgewayrefer.com') }
            $buildArgs += $RepoRoot
            Invoke-Native 'az' $buildArgs
        }
    } finally {
        if ($null -eq $previousEncoding) { Remove-Item Env:PYTHONIOENCODING -ErrorAction SilentlyContinue }
        else { $env:PYTHONIOENCODING = $previousEncoding }
    }
    foreach ($item in $built) {
        $digest = & az acr repository show --name $AcrName --image "$($item.Repo):$tag" --query digest --output tsv
        if ($LASTEXITCODE -ne 0 -or -not $digest) { throw "Image validation failed for $($item.Image); it will not be deployed." }
        $item | Add-Member -NotePropertyName Digest -NotePropertyValue $digest
    }

    $suffix = ('d' + (Get-Date).ToUniversalTime().ToString('MMddHHmm') + (Get-Random -Minimum 10 -Maximum 99)).ToLowerInvariant()
    $previous = @{}
    foreach ($app in $Apps) {
        $previous[$app] = Get-AzValue @('containerapp','revision','list','--name',$app,'--resource-group',$ResourceGroup,'--query','[?properties.trafficWeight>`0`].{name:name,weight:properties.trafficWeight}','--output','json')
        if (-not $previous[$app]) { throw "No currently serving revision exists for $app; refusing to proceed." }
    }
    $staged = @()
    $promotionStarted = $false
    try {
        foreach ($item in $built) {
            $update = @('containerapp','update','--name',$item.App,'--resource-group',$ResourceGroup,'--image',$item.Image,'--revision-suffix',$suffix,'--output','none')
            Invoke-Native 'az' $update
            $rev = "$($item.App)--$suffix"
            $staged += [pscustomobject]@{ App=$item.App; Revision=$rev; Item=$item }
            $healthy = $false
            for ($attempt=0; $attempt -lt 60; $attempt++) {
                $state = & az containerapp revision show --name $item.App --resource-group $ResourceGroup --revision $rev --query properties.healthState --output tsv 2>$null
                if ($LASTEXITCODE -eq 0 -and $state -eq 'Healthy') { $healthy=$true; break }
                if ($state -eq 'Unhealthy') { break }
                Start-Sleep -Seconds 10
            }
            if (-not $healthy) { throw "Revision $rev did not become healthy (state: $state)." }
            Invoke-Native 'az' @('containerapp','revision','label','add','--name',$item.App,'--resource-group',$ResourceGroup,'--revision',$rev,'--label','candidate','--yes','--output','none')
        }
        $apiCandidate = $staged | Where-Object App -eq $ApiApp | Select-Object -First 1
        $webCandidate = $staged | Where-Object App -eq $WebApp | Select-Object -First 1
        if ($webCandidate) {
            $webAppInfo = Get-AzValue @('containerapp','show','--name',$WebApp,'--resource-group',$ResourceGroup,'--output','json')
            $envDomain = ($webAppInfo.properties.configuration.ingress.fqdn -split '\.',2)[1]
            $candidateHost = "$WebApp---candidate.$envDomain"
            if (-not (Test-Http "https://$candidateHost/" 3)) { throw 'Staged frontend health check failed.' }
        }
        if ($apiCandidate -and $webCandidate) {
            if (-not (Test-JsonHealth "https://$candidateHost/health/cosmos" 'connected')) { throw 'Candidate frontend to staged API/Cosmos health check failed.' }
        }

        foreach ($candidate in $staged) {
            $promotionStarted = $true
            Invoke-Native 'az' @('containerapp','ingress','traffic','set','--name',$candidate.App,'--resource-group',$ResourceGroup,'--revision-weight',"$($candidate.Revision)=100",'--output','none')
        }
        Start-Sleep -Seconds 20
        $webOk = Test-Http "$PublicOrigin/" 3
        $apiOk = Test-JsonHealth "$PublicOrigin/health/cosmos" 'connected'
        if (($webCandidate -and -not $webOk) -or ($apiCandidate -and -not $apiOk)) { throw "Post-promotion public health check failed (web=$webOk, API/Cosmos=$apiOk)." }
        foreach ($candidate in $staged) {
            $script:DeployResults += [pscustomobject]@{ App=$candidate.App; Image=$candidate.Item.Image; Revision=$candidate.Revision }
        }
    } catch {
        Write-Warning "Deployment failed: $($_.Exception.Message). Restoring previous traffic weights."
        if ($promotionStarted) {
            foreach ($app in $Apps) {
                $weights = @(); foreach ($entry in $previous[$app]) { $weights += @('--revision-weight',"$($entry.name)=$($entry.weight)") }
                & az containerapp ingress traffic set --name $app --resource-group $ResourceGroup @weights --output none
                if ($LASTEXITCODE -ne 0) { Write-Warning "Could not restore traffic for $app. Inspect with 'deploy status'." }
            }
        } else {
            foreach ($candidate in $staged) {
                & az containerapp revision deactivate --name $candidate.App --resource-group $ResourceGroup --revision $candidate.Revision --output none 2>$null
            }
        }
        throw
    }
    Show-DeploymentSummary
}

function Show-DeploymentSummary {
    Write-Host "`nDeployment results:"
    foreach ($item in $script:DeployResults) {
        $state = & az containerapp revision show --name $item.App --resource-group $ResourceGroup --revision $item.Revision --query properties.healthState --output tsv 2>$null
        Write-Host ("{0}: {1}; revision {2}; health {3}" -f $item.App,$item.Image,$item.Revision,$state)
    }
    Show-Status
}

switch ($Target) {
    'help' { Write-Host "deploy [web|api|status|rollback|help]`n  deploy      Test, build and deploy both apps`n  deploy web  Deploy frontend only`n  deploy api  Deploy backend only`n  deploy status  Show revisions, traffic and production health`n  deploy rollback  Inspect revisions and confirm rollback`n  deploy help  Show this help" }
    'status' { Assert-Preflight; Show-Status }
    'rollback' { Invoke-Rollback }
    'web' { Invoke-Deploy @($WebApp) }
    'api' { Invoke-Deploy @($ApiApp) }
    default { Invoke-Deploy @($ApiApp,$WebApp) }
}
