param([string]$ResourceGroup = 'BridgeWay', [string]$Account = 'bridgeway-dev-nosql', [string]$Database = 'bridgeway-dev')
$ErrorActionPreference = 'Stop'
$cliDirectory = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin'
if (Test-Path -LiteralPath $cliDirectory) { $env:PATH = $cliDirectory + ';' + $env:PATH }
function AzJson([string[]]$Arguments) {
    $result = & az @Arguments -o json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw ('Azure command failed: ' + ($Arguments -join ' ')) }
    if ($result) { return ($result | ConvertFrom-Json) }
}
function OptionalThroughput([string[]]$Arguments) {
    $ErrorActionPreference = 'Continue'
    $output = & az @Arguments -o json --only-show-errors 2>&1
    if ($LASTEXITCODE -eq 0) { return ($output | ConvertFrom-Json).resource }
    if (($output | Out-String) -notmatch 'NotFound|not found|does not exist') { throw 'Could not inspect throughput.' }
    return $null
}
$identity = AzJson @('account','show')
$accountInfo = AzJson @('cosmosdb','show','-g',$ResourceGroup,'-n',$Account)
if (!$accountInfo.id.StartsWith('/subscriptions/' + $identity.id + '/')) { throw 'The active subscription does not own this account.' }
Write-Host ('Verified subscription: ' + $identity.name + ' (' + $identity.id + ')')
if (!$accountInfo.enableFreeTier -or $accountInfo.capacity.totalThroughputLimit -ne 1000) { throw 'Expected free tier and a 1000 RU/s account cap. Review account configuration.' }
$databases = @(AzJson @('cosmosdb','sql','database','list','-g',$ResourceGroup,'-a',$Account))
$used = 0
foreach ($db in $databases) {
    # Throughput returns NotFound for databases without shared throughput.
    $shared = OptionalThroughput @('cosmosdb','sql','database','throughput','show','-g',$ResourceGroup,'-a',$Account,'-n',$db.name)
    if ($shared) {
        $used += if ($shared.autoscaleSettings) { $shared.autoscaleSettings.maxThroughput } else { $shared.throughput }
    }
    foreach ($container in @(AzJson @('cosmosdb','sql','container','list','-g',$ResourceGroup,'-a',$Account,'-d',$db.name))) {
        $dedicated = OptionalThroughput @('cosmosdb','sql','container','throughput','show','-g',$ResourceGroup,'-a',$Account,'-d',$db.name,'-n',$container.name)
        if ($dedicated) {
            $used += if ($dedicated.autoscaleSettings) { $dedicated.autoscaleSettings.maxThroughput } else { $dedicated.throughput }
        }
    }
}
if ($databases.name -notcontains $Database) { $null = AzJson @('cosmosdb','sql','database','create','-g',$ResourceGroup,'-a',$Account,'-n',$Database) }
$containers = @(AzJson @('cosmosdb','sql','container','list','-g',$ResourceGroup,'-a',$Account,'-d',$Database))
foreach ($target in @(@{Name='card-directory'; Key='/id'}, @{Name='business-operations'; Key='/businessId'})) {
    $existing = $containers | Where-Object name -eq $target.Name
    if ($existing) {
        if (($existing.resource.partitionKey.paths -join ',') -ne $target.Key) { throw ('Wrong partition key for ' + $target.Name + '; no destructive changes made.') }
        Write-Host ('Reusing ' + $target.Name)
        continue
    }
    if ($used + 400 -gt $accountInfo.capacity.totalThroughputLimit) { throw 'Creating this container would exceed the account allowance.' }
    $createArgs = @('cosmosdb','sql','container','create','-g',$ResourceGroup,'-a',$Account,'-d',$Database,'-n',$target.Name,'--partition-key-path',$target.Key,'--throughput','400')
    if ($target.Name -eq 'business-operations') { $createArgs += @('--ttl','-1') }
    $null = AzJson $createArgs; $used += 400
    Write-Host ('Created ' + $target.Name + ' with manual 400 RU/s')
}
Write-Host "Account provisioned maximum: $used RU/s of 1000 RU/s. No keys were retrieved."
