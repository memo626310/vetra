[CmdletBinding()]
param([switch]$InstallTask, [switch]$UninstallTask)
$ErrorActionPreference = "Stop"
$TaskName = "VETRA Daily Database Backup"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackupRoot = Join-Path $env:USERPROFILE "DocumentsVetraBackups"
$RetentionDays = 30
function Read-DotEnv([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $values }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^s*([A-Za-z_][A-Za-z0-9_]*)s*=s*(.*?)s*$') {
      $value = $Matches[2]
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
      $values[$Matches[1]] = $value
    }
  }
  return $values
}
function Get-Required([hashtable]$Values, [string]$Name) {
  $value = [string]$Values[$Name]
  if ([string]::IsNullOrWhiteSpace($value) -or $value.StartsWith("REPLACE_WITH_")) { throw "Missing local backup setting: $Name" }
  return $value
}
function Get-ProjectRef([string]$Url) {
  $uri = [Uri]$Url
  $prefix = $uri.Host.Split('.')[0]
  if ([string]::IsNullOrWhiteSpace($prefix)) { throw "Could not determine Supabase project reference from URL." }
  return $prefix
}
if ($UninstallTask) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Output "Removed scheduled task: $TaskName"
  exit 0
}
$local = Read-DotEnv (Join-Path $RepoRoot ".env.local")
$backup = Read-DotEnv (Join-Path $RepoRoot ".env.backup.local")
foreach ($key in $backup.Keys) { $local[$key] = $backup[$key] }
$pgDump = [string]$local["VETRA_PG_DUMP_PATH"]
if (-not $pgDump) { $pgCommand = Get-Command pg_dump -ErrorAction SilentlyContinue
  if ($pgCommand) { $pgDump = $pgCommand.Source } }
if (-not $pgDump -or -not (Test-Path -LiteralPath $pgDump)) { throw "PostgreSQL pg_dump is required. Install PostgreSQL command-line tools or set VETRA_PG_DUMP_PATH." }
$pgRestore = [string]$local["VETRA_PG_RESTORE_PATH"]
if (-not $pgRestore) { $restoreCommand = Get-Command pg_restore -ErrorAction SilentlyContinue
  if ($restoreCommand) { $pgRestore = $restoreCommand.Source } }
if (-not $pgRestore -or -not (Test-Path -LiteralPath $pgRestore)) { throw "PostgreSQL pg_restore is required to verify each archive." }
if ($InstallTask) {
  Get-Required $local "VETRA_CORE_DB_PASSWORD" | Out-Null
  Get-Required $local "VETRA_SHARED_DATABASE_PASSWORD" | Out-Null
  Get-ProjectRef (Get-Required $local "NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL") | Out-Null
  Get-Required $local "VETRA_SHARED_DATABASE_PROJECT_REF" | Out-Null
  $trigger = New-ScheduledTaskTrigger -Daily -At "2:00 AM"
  $taskArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $taskArgs
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN$env:USERNAME" -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
  Write-Output "Installed daily 2:00 AM task; it runs when this Windows account is logged in."
  exit 0
}
$corePassword = Get-Required $local "VETRA_CORE_DB_PASSWORD"
$tenantPassword = Get-Required $local "VETRA_SHARED_DATABASE_PASSWORD"
$coreRef = Get-ProjectRef (Get-Required $local "NEXT_PUBLIC_VETRA_CORE_SUPABASE_URL")
$tenantRef = Get-Required $local "VETRA_SHARED_DATABASE_PROJECT_REF"
$coreHost = if ($local["VETRA_CORE_DB_HOST"]) { [string]$local["VETRA_CORE_DB_HOST"] } else { "db.$coreRef.supabase.co" }
$tenantHost = if ($local["VETRA_SHARED_DATABASE_HOST"]) { [string]$local["VETRA_SHARED_DATABASE_HOST"] } else { "db.$tenantRef.supabase.co" }
$corePort = if ($local["VETRA_CORE_DB_PORT"]) { [int]$local["VETRA_CORE_DB_PORT"] } else { 5432 }
$tenantPort = if ($local["VETRA_SHARED_DATABASE_PORT"]) { [int]$local["VETRA_SHARED_DATABASE_PORT"] } else { 5432 }
$coreUser = if ($local["VETRA_CORE_DB_USER"]) { [string]$local["VETRA_CORE_DB_USER"] } else { "postgres" }
$tenantUser = if ($local["VETRA_SHARED_DATABASE_USER"]) { [string]$local["VETRA_SHARED_DATABASE_USER"] } else { "postgres" }
if ($local["VETRA_BACKUP_ROOT"]) { $BackupRoot = [string]$local["VETRA_BACKUP_ROOT"] }
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$stage = Join-Path $BackupRoot ".$stamp.incomplete"
$final = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Path $stage | Out-Null
$log = Join-Path $BackupRoot "backup.log"
$env:PGSSLMODE = "require"
function Invoke-DatabaseDump([string]$Name, [string]$HostName, [int]$Port, [string]$User, [string]$Password, [string]$ProjectRef) {
  $file = Join-Path $stage "$Name.dump"
  $env:PGPASSWORD = $Password
  try {
    & $pgDump --host $HostName --port $Port --username $User --dbname postgres --no-password --format=custom --no-owner --no-acl --file $file
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed for $Name (exit code $LASTEXITCODE)." }
  } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  & $pgRestore --list $file *> $null
  if ($LASTEXITCODE -ne 0) { throw "Backup archive verification failed for $Name." }
  return [ordered]@{ database = $Name; projectRef = $ProjectRef; archive = "$Name.dump"; format = "PostgreSQL custom archive" }
}
try {
  $manifest = @{
    createdAt = (Get-Date).ToString("o")
    app = "VETRA"
    retentionDays = $RetentionDays
    databases = @(
      (Invoke-DatabaseDump "core" $coreHost $corePort $coreUser $corePassword $coreRef)
      (Invoke-DatabaseDump "clinic-shared" $tenantHost $tenantPort $tenantUser $tenantPassword $tenantRef)
    )
    note = "Database archives only; Supabase Storage file contents are not included."
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage "manifest.json") -Encoding UTF8
  Move-Item -LiteralPath $stage -Destination $final
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) SUCCESS $stamp"
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $BackupRoot -Directory | Where-Object { $_.Name -match '^d{4}-d{2}-d{2}_d{2}-d{2}-d{2}$' -and $_.LastWriteTime -lt $cutoff } | Remove-Item -Recurse -Force
  Write-Output "Backup completed and verified: $final"
} catch {
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) FAILED $($_.Exception.Message)"
  throw
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
}
