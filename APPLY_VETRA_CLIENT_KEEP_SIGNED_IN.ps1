$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
$loginPath = Join-Path $root 'app\client-interface\login\page.tsx'
$portalPath = Join-Path $root 'app\client-interface\page.tsx'
$dashboardPath = Join-Path $root 'app\client-interface\[id]\page.tsx'

foreach ($path in @($loginPath, $portalPath, $dashboardPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required file not found: $path`nRun this script from your VETRA project root. No files were changed."
    }
}

$login = [System.IO.File]::ReadAllText($loginPath, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
$portal = [System.IO.File]::ReadAllText($portalPath, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
$dashboard = [System.IO.File]::ReadAllText($dashboardPath, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
$originalLogin = $login
$originalPortal = $portal
$originalDashboard = $dashboard

# 1) Add checkbox state to the client login page.
$stateAnchor = '  const [clientCode, setClientCode] = useState("");'
if (-not $login.Contains('const [keepSignedIn, setKeepSignedIn] = useState(false);')) {
    if (-not $login.Contains($stateAnchor)) { throw 'Could not find the clientCode state anchor in login/page.tsx. No files were changed.' }
    $login = $login.Replace($stateAnchor, $stateAnchor + "`n  const [keepSignedIn, setKeepSignedIn] = useState(false);")
}

# 2) Change successful login to store identity in localStorage only when checked,
#    otherwise store it in sessionStorage for the current browser session.
$storageStartText = 'window.localStorage.removeItem("vetra-client-id");'
$storageEndText = 'router.replace(`/client-interface/${client.id}`);'
if (-not $login.Contains('const ownerSessionStorage = keepSignedIn')) {
    $storageStart = $login.IndexOf($storageStartText, [System.StringComparison]::Ordinal)
    if ($storageStart -lt 0) { throw 'Could not find the client login storage block. No files were changed.' }
    $lineStart = $login.LastIndexOf("`n", $storageStart)
    if ($lineStart -lt 0) { $lineStart = 0 } else { $lineStart++ }
    $storageEnd = $login.IndexOf($storageEndText, $storageStart, [System.StringComparison]::Ordinal)
    if ($storageEnd -lt 0) { throw 'Could not find the post-login redirect. No files were changed.' }
    $storageEnd += $storageEndText.Length

    $newStorageBlock = @'
      const ownerSessionStorage = keepSignedIn ? window.localStorage : window.sessionStorage;
      const otherStorage = keepSignedIn ? window.sessionStorage : window.localStorage;
      const ownerSessionKeys = ["vetra-client-id", "vetra-client-code", "vetra-client-phone"];

      ownerSessionKeys.forEach((key) => {
        otherStorage.removeItem(key);
      });

      ownerSessionStorage.setItem("vetra-client-id", client.id);
      ownerSessionStorage.setItem("vetra-client-code", client.client_code);
      ownerSessionStorage.setItem("vetra-client-phone", normalizedPhone);

      router.replace(`/client-interface/${client.id}`);
'@
    $login = $login.Substring(0, $lineStart) + $newStorageBlock.TrimEnd([char[]]@("`r", "`n")) + $login.Substring($storageEnd)
}

# 3) Put the checkbox between Client ID and the validation message.
if (-not $login.Contains('Keep me signed in')) {
    $messageAnchor = '              {message && ('
    if (-not $login.Contains($messageAnchor)) { throw 'Could not find the message area for the checkbox. No files were changed.' }
    $checkbox = @'
              <label className="flex cursor-pointer items-center gap-3 select-none text-sm">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(event) => setKeepSignedIn(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-cyan-500"
                />
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {ar ? "\u0627\u0628\u0642\u0646\u064a \u0645\u0633\u062c\u0644 \u0627\u0644\u062f\u062e\u0648\u0644" : "Keep me signed in"}
                </span>
              </label>

'@
    $login = $login.Replace($messageAnchor, $checkbox + $messageAnchor)
}

# 4) Make the client landing page resume an existing remembered session when opened again.
$portalGuard = '    const rememberedClientId =' 
if (-not $portal.Contains($portalGuard)) {
    $effectAnchor = '  useEffect(() => {' + "`n" + '    const savedLanguage = window.localStorage.getItem("vetra-language");'
    if (-not $portal.Contains($effectAnchor)) { throw 'Could not find the landing-page initialization anchor. No files were changed.' }
    $guard = @'
  useEffect(() => {
    const rememberedClientId =
      window.localStorage.getItem("vetra-client-id") ??
      window.sessionStorage.getItem("vetra-client-id");

    if (rememberedClientId) {
      setShowWelcome(false);
      router.replace(`/client-interface/${encodeURIComponent(rememberedClientId)}`);
      return;
    }

    const savedLanguage = window.localStorage.getItem("vetra-language");
'@
    $portal = $portal.Replace($effectAnchor, $guard.TrimEnd([char[]]@("`r", "`n")))
    # The first effect now uses router, so declare it in the dependency list.
    $effectStart = $portal.IndexOf('  useEffect(() => {', [System.StringComparison]::Ordinal)
    $effectEnd = $portal.IndexOf('  }, []);', $effectStart, [System.StringComparison]::Ordinal)
    if ($effectEnd -lt 0) { throw 'Could not find the landing-page useEffect dependency list. No files were changed.' }
    $portal = $portal.Substring(0, $effectEnd) + '  }, [router]);' + $portal.Substring($effectEnd + '  }, []);'.Length)
}

# 5) Stop migrating temporary sessionStorage identities into persistent localStorage.
if (-not $dashboard.Contains('const temporary = read(window.sessionStorage);')) {
    $ownerStartText = 'function getOwnerSession() {'
    $ownerEndText = "`n`nfunction recordText(v: Vaccine) {"
    $ownerStart = $dashboard.IndexOf($ownerStartText, [System.StringComparison]::Ordinal)
    $ownerEnd = if ($ownerStart -ge 0) { $dashboard.IndexOf($ownerEndText, $ownerStart, [System.StringComparison]::Ordinal) } else { -1 }
    if ($ownerStart -lt 0 -or $ownerEnd -lt 0) { throw 'Could not locate getOwnerSession() in the client dashboard. No files were changed.' }
    $newOwnerSession = @'
function getOwnerSession() {
  const read = (storage: Storage) => ({
    id: storage.getItem("vetra-client-id"),
    code: storage.getItem("vetra-client-code"),
    phone: storage.getItem("vetra-client-phone"),
  });

  const persistent = read(window.localStorage);
  if (persistent.id && persistent.code && persistent.phone) {
    return persistent;
  }

  const temporary = read(window.sessionStorage);
  if (temporary.id && temporary.code && temporary.phone) {
    return temporary;
  }

  return { id: null, code: null, phone: null };
}
'@
    $dashboard = $dashboard.Substring(0, $ownerStart) + $newOwnerSession.TrimEnd([char[]]@("`r", "`n")) + $dashboard.Substring($ownerEnd)
}

# Preflight: verify all three files now contain the intended implementation before writing anything.
if (-not $login.Contains('const [keepSignedIn, setKeepSignedIn] = useState(false);') -or
    -not $login.Contains('ownerSessionStorage.setItem("vetra-client-id", client.id);') -or
    -not $login.Contains('Keep me signed in') -or
    -not $portal.Contains('const rememberedClientId =') -or
    -not $dashboard.Contains('const temporary = read(window.sessionStorage);')) {
    throw 'Preflight check failed; no files were written.'
}

$changes = @()
if ($login -ne $originalLogin) { $changes += $loginPath }
if ($portal -ne $originalPortal) { $changes += $portalPath }
if ($dashboard -ne $originalDashboard) { $changes += $dashboardPath }
if ($changes.Count -eq 0) {
    Write-Host 'Keep me signed in is already patched in all required files.' -ForegroundColor Green
    exit 0
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$utf8 = [System.Text.Encoding]::UTF8
foreach ($path in $changes) {
    Copy-Item -LiteralPath $path -Destination "$path.backup-$timestamp" -Force
}

if ($login -ne $originalLogin) { [System.IO.File]::WriteAllText($loginPath, $login, $utf8) }
if ($portal -ne $originalPortal) { [System.IO.File]::WriteAllText($portalPath, $portal, $utf8) }
if ($dashboard -ne $originalDashboard) { [System.IO.File]::WriteAllText($dashboardPath, $dashboard, $utf8) }

Write-Host ''
Write-Host 'Keep me signed in added for the CLIENT PORTAL only.' -ForegroundColor Green
Write-Host 'Checked: identity remains in localStorage and the app resumes the client page after reopening.' -ForegroundColor Green
Write-Host 'Unchecked: identity uses sessionStorage for the current browser session.' -ForegroundColor Green
Write-Host 'The existing Sign out action still clears both storages.' -ForegroundColor Green
Write-Host "Backups created with suffix: .backup-$timestamp" -ForegroundColor Cyan
Write-Host 'Next, run: npm run build' -ForegroundColor Yellow
