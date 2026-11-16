[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$profilePath = $PROFILE
$profileDirectory = Split-Path -Parent $profilePath
if (-not (Test-Path $profileDirectory)) { New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null }
if (-not (Test-Path $profilePath)) { New-Item -ItemType File -Path $profilePath -Force | Out-Null }

$markerStart = '# >>> BridgeWay deploy command >>>'
$markerEnd = '# <<< BridgeWay deploy command <<<'
$existing = Get-Content -LiteralPath $profilePath -Raw
$block = @"
$markerStart
function deploy {
    param([Parameter(Position = 0)][string] `$Target = 'all')
    if (`$Target -notin @('all','web','api','status','rollback','help')) {
        Write-Error "Unknown deploy target '`$Target'. Use deploy help."
        return
    }
    & '$repoRoot\scripts\deploy.ps1' -Target `$Target
}
$markerEnd
"@
$pattern = '(?s)' + [regex]::Escape($markerStart) + '.*?' + [regex]::Escape($markerEnd)
if ($existing -match $pattern) {
    $updated = [regex]::Replace($existing,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{ param($match) $block })
} else {
    $separator = if ($existing.Length -gt 0 -and -not $existing.EndsWith("`n")) { "`r`n" } else { '' }
    $updated = $existing + $separator + $block + "`r`n"
}
Set-Content -LiteralPath $profilePath -Value $updated -Encoding utf8
Write-Host "Installed deploy command in $profilePath. Restart VS Code or open a new PowerShell terminal."
