# VETRA hotfix for the staff-page TypeScript errors introduced by the permissions patch.
# Run from the repository root. Creates a backup, changes only app/staff/page.tsx, deletes nothing.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $repo 'package.json')) -or -not (Test-Path (Join-Path $repo '.git'))) {
  throw 'Run this script from the VETRA repository root (the folder containing package.json and .git).'
}
$branch = (& git -C $repo branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not read the current Git branch.' }
if ($branch -ne 'feature/accessability') {
  throw "Safety stop: current branch is '$branch'. Switch to feature/accessability before running this hotfix."
}

$relativePath = 'app/staff/page.tsx'
$path = Join-Path $repo $relativePath
if (-not (Test-Path $path)) { throw "Missing $relativePath" }
$content = [System.IO.File]::ReadAllText($path) -replace "`r`n?", "`n"
$original = $content

$pattern = '(?s)  async function removeStaff\(person: StaffMember\) \{.*?\n  \}'
$matches = [regex]::Matches($content, $pattern)
$replacement = @'
  async function removeStaff(person: StaffMember) {
    if (!can("staff", "delete")) {
      setError(language === "ar" ? "لا تملك صلاحية حذف الموظفين." : "You do not have permission to delete staff.");
      return;
    }
    if (!window.confirm(t.confirmRemove)) return;
    setError("");
    setNotice("");
    try {
      const { data: sessionData, error: sessionError } = await vetraCore.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionError || !token) throw new Error(t.loadError);

      // Delete/suspend and remove the staff-directory row through the authorized server API.
      // This path works whether or not the staff member has a login account.
      const response = await fetch("/api/staff/accounts", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: person.id }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || t.loadError);

      setStaff((current) => current.filter((item) => item.id !== person.id));
      setNotice(t.removed);
    } catch (deleteFailure) {
      setError(deleteFailure instanceof Error ? deleteFailure.message : t.loadError);
    }
  }
'@
if ($matches.Count -eq 1) {
  $content = [regex]::Replace($content, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement }, 1)
} elseif ($matches.Count -eq 0 -and $content.Contains('const db = await getClinicDb();') -and $content.Contains('.eq("id", person.id).eq("clinic_id", clinicId);')) {
  throw 'Could not safely identify the exact removeStaff function block. No files were changed.'
} elseif ($matches.Count -ne 1) {
  throw "Expected one removeStaff function, found $($matches.Count). No files were changed."
}

# Fix the render guard so denied users do not remain on a loading screen.
$oldGuard = '  if (!permissionsLoaded || loading) {'
$newGuard = '  if (!permissionsLoaded || authorized === null || (authorized && loading)) {'
if ($content.Contains($oldGuard)) { $content = $content.Replace($oldGuard, $newGuard) }

if ($content -match 'async function removeStaff\(person: StaffMember\)[\s\S]*?getClinicDb\(' -or
    $content -match 'async function removeStaff\(person: StaffMember\)[\s\S]*?clinicId\);') {
  throw 'Validation failed: removeStaff still contains the undefined identifiers. No files were written.'
}
if ($content -notmatch 'if \\(!permissionsLoaded \\|\\| authorized === null \\|\\| \\(authorized && loading\\)\\)') {
  # Accept the already-correct guard if it was formatted across multiple lines.
  if ($content -notmatch 'authorized === null' -or $content -notmatch 'authorized && loading') {
    throw 'Validation failed: the staff page does not have the expected authorization/loading guard. No files were written.'
  }
}
if ($content -eq $original) {
  Write-Host 'No changes needed; the staff-page hotfix appears already applied.' -ForegroundColor Green
  exit 0
}

$backupRoot = Join-Path $repo ('.vetra-permissions-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$backupPath = Join-Path $backupRoot $relativePath
New-Item -ItemType Directory -Path (Split-Path $backupPath -Parent) -Force | Out-Null
Copy-Item -LiteralPath $path -Destination $backupPath -Force

# Keep CRLF if the source file originally used Windows newlines.
$originalRaw = [System.IO.File]::ReadAllText($path)
if ($originalRaw.Contains("`r`n")) { $content = $content -replace '(?<!\r)\n', "`r`n" }
[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host 'Staff-page hotfix applied. No files were deleted.' -ForegroundColor Green
Write-Host "Backup: $backupPath" -ForegroundColor Cyan
Write-Host 'Next run:' -ForegroundColor Yellow
Write-Host '  npx tsc --noEmit'
Write-Host '  npm run build'
