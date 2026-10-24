# VETRA permissions hardening patch
# Run from the repository root. Creates timestamped backups and aborts on unexpected source patterns.
# This patch never deletes files or existing features. It changes existing code only at validated anchors.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Fail($Message) { throw "VETRA patch stopped safely: $Message" }

$repo = (Get-Location).Path
if (-not (Test-Path (Join-Path $repo 'package.json')) -or -not (Test-Path (Join-Path $repo '.git'))) {
  Fail 'Run this script from the VETRA repository root (the folder containing package.json and .git).'
}

$branch = (& git -C $repo branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { Fail 'Could not read the current Git branch.' }
if ($branch -ne 'feature/accessability') {
  Fail "Safety stop: current branch is '$branch'. Switch to feature/accessability first; the script will not modify another branch."
}

$backupRoot = Join-Path $repo ('.vetra-permissions-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$script:Plan = [ordered]@{}
$script:CreatedFiles = [System.Collections.Generic.List[string]]::new()

function Read-RepoFile([string]$RelativePath) {
  $path = Join-Path $repo $RelativePath
  if (Test-Path $path) {
    $text = [System.IO.File]::ReadAllText($path)
    return ($text -replace "`r`n?", "`n")
  }
  return $null
}

function Replace-RegexOnce([string]$Text, [string]$Pattern, [string]$Replacement, [string]$Label, [string]$RelativePath, [switch]$Optional, [string]$AlreadyPattern) {
  if ($AlreadyPattern -and [regex]::IsMatch($Text, $AlreadyPattern)) { return $Text }
  $regex = [regex]::new($Pattern)
  $matches = $regex.Matches($Text)
  if ($matches.Count -eq 0) {
    if ($AlreadyPattern -and [regex]::IsMatch($Text, $AlreadyPattern)) { return $Text }
    if ($Optional) { Write-Host "SKIP (not applicable): $Label" -ForegroundColor DarkYellow; return $Text }
    Fail "Expected code anchor was not found for '$Label' in $RelativePath. No files have been written yet."
  }
  if ($matches.Count -ne 1) { Fail "Expected one occurrence for '$Label' in $RelativePath, found $($matches.Count). No files have been written yet." }
  return $regex.Replace($Text, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $Replacement.Replace('__GROUP1__', $(if ($m.Groups.Count -gt 1) { $m.Groups[1].Value } else { '' })) }, 1)
}

function Replace-LiteralOnce([string]$Text, [string]$Old, [string]$New, [string]$Label, [string]$RelativePath, [switch]$Optional, [string]$AlreadyText) {
  if ($AlreadyText -and $Text.Contains($AlreadyText)) { return $Text }
  $count = 0
  $start = 0
  while (($index = $Text.IndexOf($Old, $start, [System.StringComparison]::Ordinal)) -ge 0) {
    $count++
    $start = $index + $Old.Length
  }
  if ($count -eq 0) {
    if ($AlreadyText -and $Text.Contains($AlreadyText)) { return $Text }
    if ($Optional) { Write-Host "SKIP (not applicable): $Label" -ForegroundColor DarkYellow; return $Text }
    Fail "Expected code anchor was not found for '$Label' in $RelativePath. No files have been written yet."
  }
  if ($count -ne 1) { Fail "Expected one occurrence for '$Label' in $RelativePath, found $count. No files have been written yet." }
  return $Text.Replace($Old, $New)
}

function Set-PlannedText([string]$RelativePath, [string]$Text) {
  $script:Plan[$RelativePath] = $Text
}

# ---------- 1) Shared API authorization helper ----------
$authHelperPath = 'lib/staff-api-auth.ts'
$authHelper = @'
import "server-only";

import { fullStaffPermissions, hasStaffPermission, normalizeStaffPermissions, type PermissionAction, type StaffPermissions } from "@/lib/staff-permissions";
import { PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export async function getClinicStaffPermissions(
  actor: Awaited<ReturnType<typeof resolveClinicPushContext>>,
): Promise<StaffPermissions> {
  if (["owner", "admin"].includes(actor.role)) return fullStaffPermissions();

  const { data, error } = await actor.clinicDb
    .from("clinic_staff")
    .select("staff_type,permissions")
    .eq("clinic_id", actor.clinicId)
    .eq("auth_user_id", actor.userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PushSetupError("لا تملك صلاحية إدارة فريق العيادة.", 403);
  return normalizeStaffPermissions(data.permissions, data.staff_type);
}

export async function assertClinicStaffPermission(
  actor: Awaited<ReturnType<typeof resolveClinicPushContext>>,
  action: PermissionAction,
) {
  const permissions = await getClinicStaffPermissions(actor);
  // Directory mutations require staff.view plus the specific action.
  const requiredActions: PermissionAction[] = action === "view" ? ["view"] : ["view", action];
  if (requiredActions.some((requiredAction) => !hasStaffPermission(permissions, "staff", requiredAction))) {
    throw new PushSetupError("لا تملك الصلاحية المطلوبة لتنفيذ هذه العملية.", 403);
  }
  return actor;
}

export async function requireClinicStaffPermission(request: Request, action: PermissionAction) {
  const actor = await resolveClinicPushContext(request);
  return assertClinicStaffPermission(actor, action);
}
'@
if (Test-Path (Join-Path $repo $authHelperPath)) {
  $existingHelper = Read-RepoFile $authHelperPath
  if ($existingHelper -ne $authHelper) { Fail "$authHelperPath already exists with different contents. To avoid overwriting work, it was not changed." }
} else {
  $script:Plan[$authHelperPath] = $authHelper
  $script:CreatedFiles.Add($authHelperPath)
}

# ---------- 2) Add server-side staff directory endpoint ----------
$directoryPath = 'app/api/staff/directory/route.ts'
$directoryRoute = @'
import { normalizeStaffPermissions, permissionDefinitions, type StaffPermissions } from "@/lib/staff-permissions";
import { PushSetupError } from "@/lib/push-server";
import { getClinicStaffPermissions, requireClinicStaffPermission } from "@/lib/staff-api-auth";

export const dynamic = "force-dynamic";

const staffSelect = "id,clinic_id,full_name,staff_type,phone,email,specialty,created_at,auth_user_id,login_email,must_change_password,permissions";
type StaffType = "doctor" | "assistant" | "front_desk";

function isStaffType(value: unknown): value is StaffType {
  return value === "doctor" || value === "assistant" || value === "front_desk";
}

function errorResponse(error: unknown) {
  if (error instanceof PushSetupError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error("STAFF DIRECTORY API ERROR:", error);
  return Response.json({ error: "تعذر تنفيذ عملية فريق العيادة." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const actor = await requireClinicStaffPermission(request, "view");
    const { data, error } = await actor.clinicDb
      .from("clinic_staff")
      .select(staffSelect)
      .eq("clinic_id", actor.clinicId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const staff = (data || []).map((person) => ({
      ...person,
      permissions: normalizeStaffPermissions(person.permissions, person.staff_type),
    }));
    return Response.json({ staff }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireClinicStaffPermission(request, "create");
    const body = await request.json().catch(() => null) as {
      fullName?: unknown; staffType?: unknown; phone?: unknown; email?: unknown; specialty?: unknown; permissions?: unknown;
    } | null;

    if (!body || typeof body !== "object") throw new PushSetupError("بيانات الموظف غير صالحة.", 400);
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!fullName || fullName.length > 120) throw new PushSetupError("اكتب اسم الموظف بحد أقصى 120 حرفًا.", 400);
    if (!isStaffType(body?.staffType)) throw new PushSetupError("نوع الموظف غير صالح.", 400);

    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const specialty = body.staffType === "doctor" && typeof body.specialty === "string" ? body.specialty.trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PushSetupError("البريد الإلكتروني غير صالح.", 400);

    const requestedPermissions = normalizeStaffPermissions(body.permissions as StaffPermissions, body.staffType);
    const grantablePermissions = await getClinicStaffPermissions(actor);
    const permissions: StaffPermissions = {};
    for (const definition of permissionDefinitions) {
      permissions[definition.key] = Object.fromEntries(definition.actions.map((action) => [
        action,
        requestedPermissions[definition.key]?.[action] === true && grantablePermissions[definition.key]?.[action] === true,
      ]));
    }
    const { data, error } = await actor.clinicDb
      .from("clinic_staff")
      .insert({
        clinic_id: actor.clinicId,
        full_name: fullName,
        staff_type: body.staffType,
        phone: phone || null,
        email: email || null,
        specialty: specialty || null,
        permissions,
      })
      .select(staffSelect)
      .single();
    if (error) throw error;

    return Response.json({ staff: { ...data, permissions: normalizeStaffPermissions(data.permissions, data.staff_type) } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
'@
if (Test-Path (Join-Path $repo $directoryPath)) {
  $existingDirectory = Read-RepoFile $directoryPath
  if ($existingDirectory -ne $directoryRoute) { Fail "$directoryPath already exists with different contents. No overwrite was attempted." }
} else {
  $script:Plan[$directoryPath] = $directoryRoute
  $script:CreatedFiles.Add($directoryPath)
}

# ---------- 3) Staff page: permission-aware loading and server-routed mutations ----------
$staffPath = 'app/staff/page.tsx'
$staff = Read-RepoFile $staffPath
if (-not $staff) { Fail "Missing $staffPath" }
$staff = Replace-LiteralOnce $staff 'import { getClinicContext, getClinicDb } from "@/lib/clinic-db";' '' 'remove client-side staff CRUD dependency' $staffPath -Optional
$staff = Replace-LiteralOnce $staff '  const [clinicId, setClinicId] = useState("");' '' 'remove client-only clinic id state' $staffPath -Optional

$loadStaffReplacement = @'
  const loadStaff = useCallback(async () => {
    try {
      const { data: sessionData, error: sessionError } = await vetraCore.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionError || !token) throw new Error(copy.ar.loadError);

      const response = await fetch("/api/staff/directory", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => null) as { staff?: StaffMember[]; error?: string } | null;
      if (!response.ok || !result?.staff) throw new Error(result?.error || copy.ar.loadError);
      setStaff(result.staff);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : copy.ar.loadError);
    } finally {
      setLoading(false);
    }
  }, []);
'@
$staff = Replace-RegexOnce $staff '(?s)  const loadStaff = useCallback\(async \(\) => \{.*?\n  \}, \[\]\);' $loadStaffReplacement 'load staff from authorized API' $staffPath -AlreadyPattern '(?s)const loadStaff = useCallback\(async \(\) => \{.*?fetch\("/api/staff/directory"'

$staffEffects = @'
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedLanguage = localStorage.getItem("vetra-language");
      setLanguage(savedLanguage === "en" ? "en" : "ar");
      setDark(localStorage.getItem("vetra-theme") !== "light");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!permissionsLoaded) return;
    const allowed = can("staff", "view");
    setAuthorized(allowed);
    if (allowed) void loadStaff();
    else setLoading(false);
  }, [permissionsLoaded, can, loadStaff]);
'@
$staff = Replace-RegexOnce $staff '(?s)  useEffect\(\(\) => \{\s*window\.setTimeout\(\(\) => \{\s*void loadStaff\(\);.*?\}, \[loadStaff\]\);\s*useEffect\(\(\) => \{\s*if \(!permissionsLoaded\) return;\s*setAuthorized\(can\("staff", "view"\)\);\s*\}, \[permissionsLoaded, can\]\);' $staffEffects 'load staff only after staff.view is granted' $staffPath -AlreadyPattern 'if \(allowed\) void loadStaff\(\);'

$addStaffReplacement = @'
  async function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can("staff", "create")) {
      setError(language === "ar" ? "لا تملك صلاحية إضافة الموظفين." : "You do not have permission to add staff.");
      return;
    }
    if (saving) return;
    if (!fullName.trim()) {
      setError(t.required);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data: sessionData, error: sessionError } = await vetraCore.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionError || !token) throw new Error(t.accountError);
      const response = await fetch("/api/staff/directory", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(), staffType, phone: phone.trim(), email: email.trim(), specialty,
          permissions: normalizeStaffPermissions(permissions, staffType),
        }),
      });
      const result = await response.json().catch(() => null) as { staff?: StaffMember; error?: string } | null;
      if (!response.ok || !result?.staff) throw new Error(result?.error || t.setupError);
      setStaff((current) => [result.staff as StaffMember, ...current]);
      setFullName("");
      setPhone("");
      setEmail("");
      setSpecialty("");
      setStaffType("doctor");
      setPermissions(defaultStaffPermissions("doctor"));
      setShowForm(false);
      setNotice(t.saved);
    } catch (insertFailure) {
      setError(insertFailure instanceof Error ? insertFailure.message : t.setupError);
    } finally {
      setSaving(false);
    }
  }
'@
$staff = Replace-RegexOnce $staff '(?s)  async function addStaff\(event: FormEvent<HTMLFormElement>\) \{.*?\n  \}\n\n  function togglePermission' ($addStaffReplacement + "`r`n  function togglePermission") 'route staff creation through authorization API' $staffPath -AlreadyPattern 'fetch\("/api/staff/directory",\s*\{\s*method: "POST"'

$staff = Replace-LiteralOnce $staff '  async function savePermissions(staffId: string) {' ('  async function savePermissions(staffId: string) {' + [Environment]::NewLine + '    if (!can("staff", "edit")) {' + [Environment]::NewLine + '      setError(language === "ar" ? "لا تملك صلاحية تعديل صلاحيات الموظفين." : "You do not have permission to edit staff permissions.");' + [Environment]::NewLine + '      return;' + [Environment]::NewLine + '    }') 'guard staff permission edits' $staffPath -Optional -AlreadyText 'if (!can("staff", "edit")) {'

$staff = Replace-LiteralOnce $staff '  async function issueStaffLogin(person: StaffMember) {' ('  async function issueStaffLogin(person: StaffMember) {' + [Environment]::NewLine + '    const requiredAccountAction: PermissionAction = person.auth_user_id ? "edit" : "create";' + [Environment]::NewLine + '    if (!can("staff", requiredAccountAction)) {' + [Environment]::NewLine + '      setError(language === "ar" ? "لا تملك صلاحية إدارة حسابات الموظفين." : "You do not have permission to manage staff accounts.");' + [Environment]::NewLine + '      return;' + [Environment]::NewLine + '    }') 'guard staff login creation/reset' $staffPath -Optional -AlreadyText 'const requiredAccountAction: PermissionAction = person.auth_user_id ? "edit" : "create";'

$removeStaffReplacement = @'
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
      const response = await fetch("/api/staff/accounts", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: person.id }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || t.loadError);
      }
      setStaff((current) => current.filter((item) => item.id !== person.id));
      setNotice(t.removed);
    } catch (deleteFailure) {
      setError(deleteFailure instanceof Error ? deleteFailure.message : t.loadError);
    }
  }
'@
$staff = Replace-RegexOnce $staff '(?s)  async function removeStaff\(person: StaffMember\) \{.*?\n  \}\n\n  const surface' ($removeStaffReplacement + "`r`n  const surface") 'route staff removal through authorized API' $staffPath -AlreadyPattern 'fetch\("/api/staff/accounts",\s*\{\s*method: "DELETE"'

$staff = Replace-LiteralOnce $staff '<button type="button" onClick={() => { setShowForm((value) => !value); setError(""); }} className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400">{showForm ? t.cancel : `+ ${t.add}`}</button>' '{can("staff", "create") && <button type="button" onClick={() => { setShowForm((value) => !value); setError(""); }} className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-400">{showForm ? t.cancel : `+ ${t.add}`}</button>}' 'hide add button without staff.create' $staffPath -Optional -AlreadyText 'can("staff", "create") && <button type="button" onClick={() => { setShowForm'
$staff = Replace-LiteralOnce $staff '{showForm && <form onSubmit={(event) => void addStaff(event)}' '{can("staff", "create") && showForm && <form onSubmit={(event) => void addStaff(event)}' 'gate staff add form' $staffPath -Optional -AlreadyText 'can("staff", "create") && showForm && <form'

$oldEditButton = '<button type="button" onClick={() => { setEditingPermissionsId((current) => current === person.id ? "" : person.id); setPermissions(normalizeStaffPermissions(person.permissions, person.staff_type)); setError(""); }} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-600 hover:bg-cyan-500/10">{t.editPermissions}</button>'
$newEditButton = '{can("staff", "edit") && <button type="button" onClick={() => { setEditingPermissionsId((current) => current === person.id ? "" : person.id); setPermissions(normalizeStaffPermissions(person.permissions, person.staff_type)); setError(""); }} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-600 hover:bg-cyan-500/10">{t.editPermissions}</button>}'
$staff = Replace-LiteralOnce $staff $oldEditButton $newEditButton 'hide staff edit button without staff.edit' $staffPath -Optional -AlreadyText 'can("staff", "edit") && <button type="button" onClick={() => { setEditingPermissionsId'
$oldAccountButton = '<button type="button" onClick={() => void issueStaffLogin(person)} disabled={accountBusyId === person.id} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-600 hover:bg-cyan-500/10 disabled:opacity-50">{accountBusyId === person.id ? t.accountWorking : person.auth_user_id || person.login_email ? t.reset : t.account}</button>'
$newAccountButton = '{(person.auth_user_id ? can("staff", "edit") : can("staff", "create")) && <button type="button" onClick={() => void issueStaffLogin(person)} disabled={accountBusyId === person.id} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-xs font-bold text-cyan-600 hover:bg-cyan-500/10 disabled:opacity-50">{accountBusyId === person.id ? t.accountWorking : person.auth_user_id ? t.reset : t.account}</button>}'
$staff = Replace-LiteralOnce $staff $oldAccountButton $newAccountButton 'gate account controls by create/edit permission' $staffPath -Optional -AlreadyText '(person.auth_user_id ? can("staff", "edit") : can("staff", "create")) && <button type="button" onClick={() => void issueStaffLogin(person)'
$oldDeleteButton = '<button type="button" onClick={() => void removeStaff(person)} className="rounded-lg px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10">{t.remove}</button>'
$newDeleteButton = '{can("staff", "delete") && <button type="button" onClick={() => void removeStaff(person)} className="rounded-lg px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10">{t.remove}</button>}'
$staff = Replace-LiteralOnce $staff $oldDeleteButton $newDeleteButton 'hide remove button without staff.delete' $staffPath -Optional -AlreadyText 'can("staff", "delete") && <button type="button" onClick={() => void removeStaff(person)'
$staff = Replace-LiteralOnce $staff '{editingPermissionsId === person.id && <div className="w-full">' '{can("staff", "edit") && editingPermissionsId === person.id && <div className="w-full">' 'gate open permission editor' $staffPath -Optional -AlreadyText 'can("staff", "edit") && editingPermissionsId === person.id'
$staff = Replace-LiteralOnce $staff '  if (!permissionsLoaded || loading) {' '  if (!permissionsLoaded || authorized === null || (authorized && loading)) {' 'show denied screen after authorization check' $staffPath -Optional -AlreadyText 'if (!permissionsLoaded || authorized === null || (authorized && loading)) {'
Set-PlannedText $staffPath $staff

# ---------- 4) Shared authorization API: permissions and login endpoints ----------
$permissionsPath = 'app/api/staff/permissions/route.ts'
$permissions = Read-RepoFile $permissionsPath
if (-not $permissions) { Fail "Missing $permissionsPath" }
$permissions = Replace-LiteralOnce $permissions 'import { fullStaffPermissions, normalizeStaffPermissions } from "@/lib/staff-permissions";' 'import { fullStaffPermissions, normalizeStaffPermissions, permissionDefinitions } from "@/lib/staff-permissions";' 'import permission definitions for permission-escalation checks' $permissionsPath -Optional -AlreadyText 'import { fullStaffPermissions, normalizeStaffPermissions, permissionDefinitions } from "@/lib/staff-permissions";' 
$permissions = Replace-LiteralOnce $permissions 'import { PushSetupError, resolveClinicPushContext } from "@/lib/push-server";' ('import { PushSetupError, resolveClinicPushContext } from "@/lib/push-server";' + [Environment]::NewLine + 'import { getClinicStaffPermissions, requireClinicStaffPermission } from "@/lib/staff-api-auth";') 'import staff permission API authorizer' $permissionsPath -Optional -AlreadyText 'import { getClinicStaffPermissions, requireClinicStaffPermission } from "@/lib/staff-api-auth";'
$permissionsAuthorizeReplacement = @'
async function authorize(request: Request) {
  return requireClinicStaffPermission(request, "edit");
}
'@
$permissions = Replace-RegexOnce $permissions '(?s)async function authorize\(request: Request\) \{.*?\n\}' $permissionsAuthorizeReplacement 'authorize permission updates using staff.edit' $permissionsPath -AlreadyPattern 'return requireClinicStaffPermission\(request, "edit"\);'
$permissionsPutReplacement = @'
export async function PUT(request: Request) {
  try {
    const actor = await authorize(request);
    const body = await request.json().catch(() => null) as { staffId?: unknown; permissions?: unknown } | null;
    if (typeof body?.staffId !== "string" || !body.permissions || typeof body.permissions !== "object" || Array.isArray(body.permissions)) {
      throw new PushSetupError("بيانات الصلاحيات غير صالحة.", 400);
    }
    const { data: staff, error: findError } = await actor.clinicDb.from("clinic_staff")
      .select("id,staff_type").eq("id", body.staffId).eq("clinic_id", actor.clinicId).maybeSingle();
    if (findError) throw findError;
    if (!staff) throw new PushSetupError("الموظف غير موجود في هذه العيادة.", 404);

    const permissions = normalizeStaffPermissions(body.permissions, staff.staff_type);
    const grantablePermissions = await getClinicStaffPermissions(actor);
    for (const definition of permissionDefinitions) {
      for (const action of definition.actions) {
        if (permissions[definition.key]?.[action] === true && grantablePermissions[definition.key]?.[action] !== true) {
          throw new PushSetupError("لا يمكنك منح صلاحية لا تملكها.", 403);
        }
      }
    }

    const { error: updateError } = await actor.clinicDb.rpc("vetra_update_clinic_staff_permissions", {
      p_staff_id: body.staffId,
      p_permissions: permissions,
    });
    if (updateError) throw updateError;
    return Response.json({ ok: true, permissions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("STAFF PERMISSIONS PUT ERROR:", error);
    return Response.json({ error: "تعذر حفظ صلاحيات الموظف." }, { status: 500 });
  }
}
'@
$permissions = Replace-RegexOnce $permissions '(?s)export async function PUT\(request: Request\) \{.*?\n\}' $permissionsPutReplacement 'write staff permissions only through checked database RPC' $permissionsPath -AlreadyPattern 'vetra_update_clinic_staff_permissions'
Set-PlannedText $permissionsPath $permissions

$accountsPath = 'app/api/staff/accounts/route.ts'
$accounts = Read-RepoFile $accountsPath
if (-not $accounts) { Fail "Missing $accountsPath" }
$accounts = Replace-LiteralOnce $accounts 'import { getCoreAdminClient, PushSetupError, resolveClinicPushContext } from "@/lib/push-server";' ('import { getCoreAdminClient, PushSetupError, resolveClinicPushContext } from "@/lib/push-server";' + [Environment]::NewLine + 'import { assertClinicStaffPermission, requireClinicStaffPermission } from "@/lib/staff-api-auth";') 'import staff account permission authorizer' $accountsPath -Optional -AlreadyText 'import { assertClinicStaffPermission, requireClinicStaffPermission } from "@/lib/staff-api-auth";'
$accountsAuthorizeReplacement = @'
async function authorize(request: Request, action: "create" | "edit" | "delete" = "create") {
  return requireClinicStaffPermission(request, action);
}
'@
$accounts = Replace-RegexOnce $accounts '(?s)async function authorize\(request: Request\) \{.*?\n\}' $accountsAuthorizeReplacement 'authorize account operations by staff.create/edit/delete' $accountsPath -AlreadyPattern 'return requireClinicStaffPermission\(request, action\);'
$accounts = Replace-RegexOnce $accounts '(?s)(export async function POST\(request: Request\) \{.*?if \(typeof body\?\.staffId !== "string"\) throw new PushSetupError\("معرف الموظف غير صالح\.", 400\);\s*)const actor = await authorize\(request\);\s*const person = await findStaff\(actor\.clinicDb, actor\.clinicId, body\.staffId\);' ('__GROUP1__' + 'const actor = await resolveClinicPushContext(request);' + [Environment]::NewLine + '    const person = await findStaff(actor.clinicDb, actor.clinicId, body.staffId);' + [Environment]::NewLine + '    await assertClinicStaffPermission(actor, person.auth_user_id ? "edit" : "create");') 'require create for new login and edit for reset' $accountsPath -AlreadyPattern 'await assertClinicStaffPermission\(actor, person\.auth_user_id \? "edit" : "create"\);'
$accounts = Replace-RegexOnce $accounts '(?s)(export async function DELETE\(request: Request\) \{.*?if \(typeof body\?\.staffId !== "string"\) throw new PushSetupError\("معرف الموظف غير صالح\.", 400\);\s*)const actor = await authorize\(request\);' ('__GROUP1__' + 'const actor = await authorize(request, "delete");') 'require staff.delete for employee removal' $accountsPath -AlreadyPattern 'export async function DELETE\(request: Request\) \{.*?authorize\(request, "delete"\);'
$accounts = Replace-RegexOnce $accounts '(?s)(export async function DELETE\(request: Request\) \{.*?if \(person\.auth_user_id\) \{.*?\n    \})\s*return new Response\(null, \{ status: 204,' ('__GROUP1__' + [Environment]::NewLine + '    const { error: directoryDeleteError } = await actor.clinicDb.from("clinic_staff").delete().eq("id", person.id).eq("clinic_id", actor.clinicId);' + [Environment]::NewLine + '    if (directoryDeleteError) throw directoryDeleteError;' + [Environment]::NewLine + '    return new Response(null, { status: 204,') 'delete directory row after account suspension' $accountsPath -AlreadyPattern 'directoryDeleteError'
$accounts = Replace-LiteralOnce $accounts 'const { error: staffUpdateError } = await actor.clinicDb.from("clinic_staff").update({
        login_email: authEmail,
        must_change_password: true,
      }).eq("id", person.id).eq("clinic_id", actor.clinicId);
      if (staffUpdateError) throw staffUpdateError;' 'const { error: staffUpdateError } = await actor.clinicDb.rpc("vetra_link_clinic_staff_account", {
        p_staff_id: person.id,
        p_auth_user_id: person.auth_user_id,
        p_login_email: authEmail,
        p_must_change_password: true,
      });
      if (staffUpdateError) throw staffUpdateError;' 'route existing staff login updates through permission-checked database RPC' $accountsPath -AlreadyText 'p_auth_user_id: person.auth_user_id,'
$accounts = Replace-LiteralOnce $accounts 'const { error: linkError } = await actor.clinicDb.from("clinic_staff").update({
        auth_user_id: userData.user.id,
        login_email: authEmail,
        must_change_password: true,
      }).eq("id", person.id).eq("clinic_id", actor.clinicId);
      if (linkError) throw linkError;' 'const { error: linkError } = await actor.clinicDb.rpc("vetra_link_clinic_staff_account", {
        p_staff_id: person.id,
        p_auth_user_id: userData.user.id,
        p_login_email: authEmail,
        p_must_change_password: true,
      });
      if (linkError) throw linkError;' 'route new staff login linking through permission-checked database RPC' $accountsPath -AlreadyText 'p_auth_user_id: userData.user.id,'
Set-PlannedText $accountsPath $accounts

# ---------- 4b) Avoid raw UPDATE on clinic_staff when changing the current user's password flag ----------
$changePasswordPath = 'app/api/staff/change-password/route.ts'
$changePassword = Read-RepoFile $changePasswordPath
if (-not $changePassword) { Fail "Missing $changePasswordPath" }
$changePassword = Replace-LiteralOnce $changePassword 'await actor.clinicDb.from("clinic_staff").update({ must_change_password: false })
      .eq("clinic_id", actor.clinicId).eq("auth_user_id", actor.userId);' 'await actor.clinicDb.rpc("vetra_mark_clinic_staff_password_changed");' 'clear current staff password flag through a self-only RPC' $changePasswordPath -AlreadyText 'vetra_mark_clinic_staff_password_changed'
Set-PlannedText $changePasswordPath $changePassword

# ---------- 4a) Settings hook property compatibility ----------
$settingsPath = 'app/settings/page.tsx'
$settings = Read-RepoFile $settingsPath
if (-not $settings) { Fail "Missing $settingsPath" }
$settings = Replace-LiteralOnce $settings 'const { hasPermission, permissionsLoaded } = useStaffPermissions();' 'const { hasPermission, loaded: permissionsLoaded } = useStaffPermissions();' 'use the real loaded property exposed by useStaffPermissions' $settingsPath -Optional -AlreadyText 'const { hasPermission, loaded: permissionsLoaded } = useStaffPermissions();'
Set-PlannedText $settingsPath $settings

# ---------- 5) Finance naming and payment-action checks ----------
$financePath = 'app/finance/page.tsx'
$finance = Read-RepoFile $financePath
if (-not $finance) { Fail "Missing $financePath" }
$finance = Replace-LiteralOnce $finance 'can("finance", "view")' 'can("finance_page", "view")' 'use the defined finance_page permission key' $financePath -Optional -AlreadyText 'can("finance_page", "view")'
$finance = Replace-LiteralOnce $finance '  async function recordPayment() {' ('  async function recordPayment() {' + [Environment]::NewLine + '    if (!can("payments", "create")) {' + [Environment]::NewLine + '      setError(isAr ? "لا تملك صلاحية تسجيل التحصيل." : "You do not have permission to record payments.");' + [Environment]::NewLine + '      return;' + [Environment]::NewLine + '    }') 'protect invoice payment action' $financePath -Optional -AlreadyText ('async function recordPayment() {' + [Environment]::NewLine + '    if (!can("payments", "create")) {')
$finance = Replace-LiteralOnce $finance '  async function recordCustomerPayment(customer: CustomerBalance) {' ('  async function recordCustomerPayment(customer: CustomerBalance) {' + [Environment]::NewLine + '    if (!can("payments", "create")) {' + [Environment]::NewLine + '      setError(isAr ? "لا تملك صلاحية تسجيل التحصيل." : "You do not have permission to record payments.");' + [Environment]::NewLine + '      return;' + [Environment]::NewLine + '    }') 'protect customer bulk payment action' $financePath -Optional -AlreadyText ('async function recordCustomerPayment(customer: CustomerBalance) {' + [Environment]::NewLine + '    if (!can("payments", "create")) {')
$finance = Replace-LiteralOnce $finance '<button onClick={() => router.push("/cash-register")} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "الخزن وحركة النقدية" : "Cash registers"}</button>' '{can("payments", "view") && <button onClick={() => router.push("/cash-register")} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "الخزن وحركة النقدية" : "Cash registers"}</button>}' 'hide cash-register link without payments.view' $financePath -Optional -AlreadyText 'can("payments", "view") && <button onClick={() => router.push("/cash-register") className="rounded-xl bg-indigo-600 px-4 py-3'
$finance = Replace-LiteralOnce $finance '<button type="button" onClick={() => { setActiveTab("collections"); setShowPayment(true); }} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "تحصيل دفعة من عميل" : "Collect customer payment"}</button>' '{can("payments", "create") && <button type="button" onClick={() => { setActiveTab("collections"); setShowPayment(true); }} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "تحصيل دفعة من عميل" : "Collect customer payment"}</button>}' 'hide collection action without payments.create' $financePath -Optional -AlreadyText 'can("payments", "create") && <button type="button" onClick={() => { setActiveTab("collections"); setShowPayment(true); }}'
$finance = Replace-LiteralOnce $finance '<button type="button" onClick={() => router.push("/cash-register")} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "تسجيل مصروف أو مقبوض" : "Record expense or income"}</button>' '{can("payments", "create") && <button type="button" onClick={() => router.push("/cash-register")} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white">{isAr ? "تسجيل مصروف أو مقبوض" : "Record expense or income"}</button>}' 'hide post-movement action without payments.create' $financePath -Optional -AlreadyText 'can("payments", "create") && <button type="button" onClick={() => router.push("/cash-register")'
$finance = Replace-LiteralOnce $finance '<button onClick={() => router.push("/cash-register")} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white">{isAr ? "إدارة" : "Manage"}</button>' '{can("payments", "view") && <button onClick={() => router.push("/cash-register")} className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white">{isAr ? "إدارة" : "Manage"}</button>}' 'hide cash-register manage button without payments.view' $financePath -Optional -AlreadyText 'can("payments", "view") && <button onClick={() => router.push("/cash-register") className="rounded-xl bg-indigo-600 px-3 py-2'
$finance = Replace-LiteralOnce $finance '<button onClick={() => router.push("/cash-register")} className={`rounded-xl border px-4 py-2 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200"}`}>{isAr ? "كشف حساب كامل" : "Full account statement"}</button>' '{can("payments", "view") && <button onClick={() => router.push("/cash-register")} className={`rounded-xl border px-4 py-2 text-sm font-bold ${dark ? "border-white/10" : "border-slate-200"}`}>{isAr ? "كشف حساب كامل" : "Full account statement"}</button>}' 'hide cash-register statement link without payments.view' $financePath -Optional -AlreadyText 'can("payments", "view") && <button onClick={() => router.push("/cash-register") className={`rounded-xl border px-4 py-2'
$finance = Replace-LiteralOnce $finance '<button onClick={() => { setShowPayment((v) => !v); setError(""); }} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">{showPayment ? (isAr ? "إغلاق" : "Close") : (isAr ? "+ تسجيل تحصيل" : "+ Record receipt")}</button>' '{can("payments", "create") && <button onClick={() => { setShowPayment((v) => !v); setError(""); }} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">{showPayment ? (isAr ? "إغلاق" : "Close") : (isAr ? "+ تسجيل تحصيل" : "+ Record receipt")}</button>}' 'hide payment form toggle without payments.create' $financePath -Optional -AlreadyText 'can("payments", "create") && <button onClick={() => { setShowPayment((v) => !v); setError(""); }}'
Set-PlannedText $financePath $finance

# ---------- 6) Inventory product action checks ----------
$productsPath = 'app/inventory/products/page.tsx'
$products = Read-RepoFile $productsPath
if (-not $products) { Fail "Missing $productsPath" }
$permissionHelper = @'
  function requireInventoryPermission(action: "create" | "edit" | "delete") {
    if (can("inventory", action)) return true;
    setMessage("ليس لديك صلاحية تنفيذ هذه العملية في المخزون.");
    return false;
  }

'@
$products = Replace-LiteralOnce $products '  async function saveProduct() {' ($permissionHelper + '  async function saveProduct() {' + [Environment]::NewLine + '    if (!requireInventoryPermission(editingProduct ? "edit" : "create")) return;') 'insert permission guard for inventory operations' $productsPath -Optional -AlreadyText 'function requireInventoryPermission(action:'
$products = Replace-LiteralOnce $products '  async function addCategoryInsideProduct() {' ('  async function addCategoryInsideProduct() {' + [Environment]::NewLine + '    if (!requireInventoryPermission("create")) return;') 'guard inline category creation' $productsPath -Optional -AlreadyText ('async function addCategoryInsideProduct() {' + [Environment]::NewLine + '    if (!requireInventoryPermission("create")) return;')
$products = Replace-LiteralOnce $products '  async function deleteProduct(product: Product) {' ('  async function deleteProduct(product: Product) {' + [Environment]::NewLine + '    if (!requireInventoryPermission("delete") || !requireInventoryPermission("edit")) return;') 'guard product deletion' $productsPath -Optional -AlreadyText ('async function deleteProduct(product: Product) {' + [Environment]::NewLine + '    if (!requireInventoryPermission("delete") || !requireInventoryPermission("edit")) return;')
$products = Replace-LiteralOnce $products '  async function addCategory() {' ('  async function addCategory() {' + [Environment]::NewLine + '    if (!requireInventoryPermission("create")) return;') 'guard category creation' $productsPath -Optional -AlreadyText ('async function addCategory() {' + [Environment]::NewLine + '    if (!requireInventoryPermission("create")) return;')
$products = Replace-LiteralOnce $products '  async function moveCategoryProducts() {' ('  async function moveCategoryProducts() {' + [Environment]::NewLine + '    if (!requireInventoryPermission("edit")) return;') 'guard category product moves' $productsPath -Optional -AlreadyText ('async function moveCategoryProducts() {' + [Environment]::NewLine + '    if (!requireInventoryPermission("edit")) return;')
$products = Replace-LiteralOnce $products '  async function deleteCategory() {' ('  async function deleteCategory() {' + [Environment]::NewLine + '    if (!requireInventoryPermission("delete") || !requireInventoryPermission("edit")) return;') 'guard category deletion' $productsPath -Optional -AlreadyText ('async function deleteCategory() {' + [Environment]::NewLine + '    if (!requireInventoryPermission("delete") || !requireInventoryPermission("edit")) return;')
Set-PlannedText $productsPath $products

# ---------- 7) Inventory purchases permission consistency ----------
$purchasesPath = 'app/inventory/purchases/page.tsx'
$purchases = Read-RepoFile $purchasesPath
if (-not $purchases) { Fail "Missing $purchasesPath" }
$purchases = Replace-LiteralOnce $purchases '  async function loadData() {' ('  async function loadData() {' + [Environment]::NewLine + '    if (!permissionsLoaded) return;') 'wait for purchase permissions before loading data' $purchasesPath -Optional -AlreadyText 'if (!permissionsLoaded) return;'
$purchases = Replace-LiteralOnce $purchases '      if (!["owner", "admin"].includes(context.role)) { setAuthorized(false); return; }' ('      const isOwnerOrAdmin = ["owner", "admin"].includes(context.role);' + [Environment]::NewLine + '      const canCreatePurchase = permissionsLoaded && can("inventory", "view") && can("inventory", "create") && can("payments", "view") && can("payments", "create");' + [Environment]::NewLine + '      if (!isOwnerOrAdmin && !canCreatePurchase) { setAuthorized(false); return; }') 'allow purchases only to owner/admin or inventory.create' $purchasesPath -Optional -AlreadyText 'const canCreatePurchase = permissionsLoaded && can("inventory", "create");'
$purchaseEffectReplacement = @'
  useEffect(() => {
    if (ready && permissionsLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadData();
    }
    // loadData reads the current session and clinic context when the page becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, permissionsLoaded]);
'@
$purchases = Replace-RegexOnce $purchases '(?s)  useEffect\(\(\) => \{\s*if \(ready\) \{\s*// eslint-disable-next-line react-hooks/set-state-in-effect\s*void loadData\(\);\s*\}\s*// loadData reads the current session and clinic context when the page becomes ready\.\s*// eslint-disable-next-line react-hooks/exhaustive-deps\s*\}, \[ready\]\);' $purchaseEffectReplacement 'trigger purchase load after permission resolution' $purchasesPath -AlreadyPattern 'if \(ready && permissionsLoaded\) \{'

foreach ($spec in @(
  @{Old='  async function saveCategory() {'; Action='create'; Label='category creation'},
  @{Old='  async function saveSupplier() {'; Action='create'; Label='supplier creation'},
  @{Old='  async function saveProduct() {'; Action='create'; Label='product creation'},
  @{Old='  async function savePurchase() {'; Action='create'; Label='purchase creation'}
)) {
$guard = $spec.Old + [Environment]::NewLine + ('    if (!can("inventory", "create")) { setError(isAr ? "لا تملك صلاحية إنشاء مشتريات أو أصناف المخزون." : "You do not have permission to create inventory records."); return; }')
  $already = [regex]::Escape($spec.Old) + '.*?if \(!can\("inventory", "create"\)\)'
  $purchases = Replace-LiteralOnce $purchases $spec.Old $guard "guard $($spec.Label)" $purchasesPath -Optional -AlreadyText ($spec.Old + [Environment]::NewLine + '    if (!can("inventory", "create"))')
}
$purchases = Replace-LiteralOnce $purchases '  async function savePurchase() {' ('  async function savePurchase() {' + [Environment]::NewLine + '    if (!can("payments", "create")) { setError(isAr ? "تحتاج صلاحية تسجيل حركة الخزنة لتسجيل فاتورة الشراء." : "Payment creation permission is required to post a purchase bill."); return; }') 'require payments.create for purchase ledger posting' $purchasesPath -Optional -AlreadyText ('async function savePurchase() {' + [Environment]::NewLine + '    if (!can("payments", "create"))')
Set-PlannedText $purchasesPath $purchases

# ---------- 7a) Align settings and purchases navigation with page requirements ----------
$permissionsPath = 'lib/staff-permissions.ts'
$permissionsSource = Read-RepoFile $permissionsPath
if (-not $permissionsSource) { Fail "Missing $permissionsPath" }
$permissionsSource = Replace-LiteralOnce $permissionsSource 'if (pathname.startsWith("/settings")) return { key: "clinic_settings", action: "view" };' 'if (pathname.startsWith("/settings")) return { key: "clinic_settings", action: "edit" };' 'require clinic_settings.edit for settings route navigation' $permissionsPath -Optional -AlreadyText 'if (pathname.startsWith("/settings")) return { key: "clinic_settings", action: "edit" };'
Set-PlannedText $permissionsPath $permissionsSource

$dashboardPath = 'app/dashboard/page.tsx'
$dashboard = Read-RepoFile $dashboardPath
if (-not $dashboard) { Fail "Missing $dashboardPath" }
$dashboard = Replace-LiteralOnce $dashboard 'const hasPermission = !required || (permissionsLoaded && can(required.key, required.action));' 'const hasPermission = !required || (permissionsLoaded && can(required.key, required.action) && (item[2] !== "/inventory/purchases" || (can("inventory", "view") && can("payments", "view") && can("payments", "create"))));' 'require inventory.view and inventory.create for purchases navigation' $dashboardPath -Optional -AlreadyText 'item[2] !== "/inventory/purchases" || (can("inventory", "view") && can("payments", "view") && can("payments", "create"))'
$dashboard = Replace-LiteralOnce $dashboard 'return !required || (permissionsLoaded && can(required.key, required.action));' 'return !required || (permissionsLoaded && can(required.key, required.action) && (cardPaths[index] !== "/inventory/purchases" || (can("inventory", "view") && can("payments", "view") && can("payments", "create"))));' 'require inventory.view and inventory.create for purchases dashboard card' $dashboardPath -Optional -AlreadyText 'cardPaths[index] !== "/inventory/purchases" || (can("inventory", "view") && can("payments", "view") && can("payments", "create"))'
Set-PlannedText $dashboardPath $dashboard

# ---------- 7b) Protect cash-register screen and write handlers ----------
$cashPagePath = 'app/cash-register/page.tsx'
$cashPage = Read-RepoFile $cashPagePath
if (-not $cashPage) { Fail "Missing $cashPagePath" }
$cashPage = Replace-LiteralOnce $cashPage 'import { writeVetraThemeMode } from "@/lib/theme";' ('import { writeVetraThemeMode } from "@/lib/theme";' + [Environment]::NewLine + 'import { useStaffPermissions } from "@/lib/use-staff-permissions";') 'import cash-register permission hook' $cashPagePath -Optional -AlreadyText 'import { useStaffPermissions } from "@/lib/use-staff-permissions";'
$cashPage = Replace-LiteralOnce $cashPage '  const router = useRouter();' ('  const router = useRouter();' + [Environment]::NewLine + '  const { can, loaded: permissionsLoaded } = useStaffPermissions();') 'load cash-register permissions' $cashPagePath -Optional -AlreadyText 'const { can, loaded: permissionsLoaded } = useStaffPermissions();'
$cashPage = Replace-LiteralOnce $cashPage '  const loadData = useCallback(async () => {' ('  const loadData = useCallback(async () => {' + [Environment]::NewLine + '    if (!permissionsLoaded) return;') 'wait for cash-register permission load' $cashPagePath -Optional -AlreadyText 'const loadData = useCallback(async () => {' + [Environment]::NewLine + '    if (!permissionsLoaded) return;'
$cashPage = Replace-LiteralOnce $cashPage '      if (!["owner", "admin"].includes(context.role)) { setAuthorized(false); return; }' ('      if (!["owner", "admin"].includes(context.role) && !can("payments", "view")) { setAuthorized(false); return; }') 'require payments.view for cash-register data' $cashPagePath -Optional -AlreadyText '!can("payments", "view")) { setAuthorized(false); return; }'
$cashPage = Replace-LiteralOnce $cashPage '  }, [router]);' '  }, [router, can, permissionsLoaded]);' 'cash-register data-load dependencies' $cashPagePath -Optional -AlreadyText '}, [router, can, permissionsLoaded]);'
$cashPage = Replace-LiteralOnce $cashPage '  useEffect(() => { if (ready) void loadData(); }, [ready, loadData]);' '  useEffect(() => { if (ready && permissionsLoaded) void loadData(); }, [ready, permissionsLoaded, loadData]);' 'load cash-register data after permission resolution' $cashPagePath -Optional -AlreadyText 'if (ready && permissionsLoaded) void loadData();'
foreach ($spec in @(
  @{Old='  async function createAccount() {'; Action='create'; Label='financial account creation'},
  @{Old='  async function openRegister() {'; Action='create'; Label='cash register opening'},
  @{Old='  async function postMovement() {'; Action='create'; Label='financial movement creation'},
  @{Old='  async function transferMoney() {'; Action='create'; Label='financial transfer'},
  @{Old='  async function closeRegister(session: RegisterSession) {'; Action='edit'; Label='cash register closing'}
)) {
  $guardText = $spec.Old + [Environment]::NewLine + ('    if (!can("payments", "' + $spec.Action + '")) { setError(isAr ? "لا تملك صلاحية تنفيذ هذه العملية المالية." : "You do not have permission to perform this financial operation."); return; }')
  $alreadyGuard = $spec.Old + [Environment]::NewLine + ('    if (!can("payments", "' + $spec.Action + '"))')
  $cashPage = Replace-LiteralOnce $cashPage $spec.Old $guardText "guard $($spec.Label)" $cashPagePath -Optional -AlreadyText $alreadyGuard
}
$cashPage = Replace-LiteralOnce $cashPage 'if (!ready || loading) return <main className={`flex min-h-screen items-center justify-center ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>' 'if (!ready || !permissionsLoaded || authorized === null || loading) return <main className={`flex min-h-screen items-center justify-center ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>' 'wait for cash-register access decision' $cashPagePath -Optional -AlreadyText 'if (!ready || !permissionsLoaded || authorized === null || loading) return <main'
$cashPage = Replace-LiteralOnce $cashPage 'disabled={saving} onClick={createAccount}' 'disabled={saving || !can("payments", "create")} onClick={createAccount}' 'disable account creation without payments.create' $cashPagePath -Optional -AlreadyText 'disabled={saving || !can("payments", "create")} onClick={createAccount}'
$cashPage = Replace-LiteralOnce $cashPage 'disabled={saving || !openAccountId} onClick={openRegister}' 'disabled={saving || !openAccountId || !can("payments", "create")} onClick={openRegister}' 'disable register opening without payments.create' $cashPagePath -Optional -AlreadyText 'disabled={saving || !openAccountId || !can("payments", "create")} onClick={openRegister}'
$cashPage = Replace-LiteralOnce $cashPage 'disabled={saving} onClick={postMovement}' 'disabled={saving || !can("payments", "create")} onClick={postMovement}' 'disable money movements without payments.create' $cashPagePath -Optional -AlreadyText 'disabled={saving || !can("payments", "create")} onClick={postMovement}'
$cashPage = Replace-LiteralOnce $cashPage 'disabled={saving} onClick={transferMoney}' 'disabled={saving || !can("payments", "create")} onClick={transferMoney}' 'disable money transfers without payments.create' $cashPagePath -Optional -AlreadyText 'disabled={saving || !can("payments", "create")} onClick={transferMoney}'
$cashPage = Replace-LiteralOnce $cashPage 'disabled={saving} onClick={() => closeRegister(s)}' 'disabled={saving || !can("payments", "edit")} onClick={() => closeRegister(s)}' 'disable register closing without payments.edit' $cashPagePath -Optional -AlreadyText 'disabled={saving || !can("payments", "edit")} onClick={() => closeRegister(s)}'
Set-PlannedText $cashPagePath $cashPage

# ---------- 7c) Align purchase history with inventory.view/edit ----------
$historyPath = 'app/inventory/purchases/history/page.tsx'
$history = Read-RepoFile $historyPath
if (-not $history) { Fail "Missing $historyPath" }
$history = Replace-LiteralOnce $history 'import { writeVetraThemeMode } from "@/lib/theme";' ('import { writeVetraThemeMode } from "@/lib/theme";' + [Environment]::NewLine + 'import { useStaffPermissions } from "@/lib/use-staff-permissions";') 'import purchase-history permission hook' $historyPath -Optional -AlreadyText 'import { useStaffPermissions } from "@/lib/use-staff-permissions";'
$history = Replace-LiteralOnce $history '  const router = useRouter();' ('  const router = useRouter();' + [Environment]::NewLine + '  const { can, loaded: permissionsLoaded } = useStaffPermissions();') 'load purchase-history permissions' $historyPath -Optional -AlreadyText 'const { can, loaded: permissionsLoaded } = useStaffPermissions();'
$history = Replace-LiteralOnce $history '  const loadData = useCallback(async () => {' ('  const loadData = useCallback(async () => {' + [Environment]::NewLine + '    if (!permissionsLoaded) return;') 'wait for purchase-history permission load' $historyPath -Optional -AlreadyText 'const loadData = useCallback(async () => {' + [Environment]::NewLine + '    if (!permissionsLoaded) return;'
$history = Replace-LiteralOnce $history '      if (!["owner", "admin"].includes(context.role)) { setAuthorized(false); return; }' ('      if (!["owner", "admin"].includes(context.role) && !can("inventory", "view")) { setAuthorized(false); return; }') 'require inventory.view for purchase-history read' $historyPath -Optional -AlreadyText '!can("inventory", "view")) { setAuthorized(false); return; }'
$history = Replace-LiteralOnce $history '  }, [isAr, router]);' '  }, [isAr, router, can, permissionsLoaded]);' 'purchase-history data-load dependencies' $historyPath -Optional -AlreadyText '}, [isAr, router, can, permissionsLoaded]);'
$history = Replace-LiteralOnce $history '    if (ready) void loadData();' '    if (ready && permissionsLoaded) void loadData();' 'load purchase history after permissions resolve' $historyPath -Optional -AlreadyText 'if (ready && permissionsLoaded) void loadData();'
$history = Replace-LiteralOnce $history '  }, [ready, loadData]);' '  }, [ready, permissionsLoaded, loadData]);' 'purchase-history permission effect dependency' $historyPath -Optional -AlreadyText '}, [ready, permissionsLoaded, loadData]);'
$history = Replace-LiteralOnce $history '  async function startEdit(purchase: Purchase) {' ('  async function startEdit(purchase: Purchase) {' + [Environment]::NewLine + '    if (!can("inventory", "edit") || !can("payments", "edit")) { setError(isAr ? "لا تملك صلاحية تعديل فواتير الشراء والخزنة." : "You do not have permission to edit purchase invoices."); return; }') 'guard starting purchase edit' $historyPath -Optional -AlreadyText ('async function startEdit(purchase: Purchase) {' + [Environment]::NewLine + '    if (!can("inventory", "edit"))')
$history = Replace-LiteralOnce $history '  async function saveEdit() {' ('  async function saveEdit() {' + [Environment]::NewLine + '    if (!can("inventory", "edit") || !can("payments", "edit")) { setEditError(isAr ? "لا تملك صلاحية تعديل فواتير الشراء والخزنة." : "You do not have permission to edit purchase invoices."); return; }') 'guard saving purchase edit' $historyPath -Optional -AlreadyText ('async function saveEdit() {' + [Environment]::NewLine + '    if (!can("inventory", "edit"))')
$history = Replace-LiteralOnce $history 'if (!ready || loading) return <main className={`flex min-h-screen items-center justify-center ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>' 'if (!ready || !permissionsLoaded || authorized === null || loading) return <main className={`flex min-h-screen items-center justify-center ${dark ? "bg-[#0F1115] text-white" : "bg-[#F7F8FA] text-slate-800"}`}>' 'wait for purchase-history access decision' $historyPath -Optional -AlreadyText 'if (!ready || !permissionsLoaded || authorized === null || loading) return <main'
# Render the edit UI only with inventory.edit while retaining the read-only history table.
$history = Replace-LiteralOnce $history 'onEdit={() => void startEdit(purchase)} dateText={dateText}' 'onEdit={() => void startEdit(purchase)} canEdit={can("inventory", "edit") && can("payments", "edit")} dateText={dateText}' 'show purchase edit button only with inventory.edit' $historyPath -Optional -AlreadyText 'canEdit={can("inventory", "edit") && can("payments", "edit")} dateText={dateText}'
$history = Replace-LiteralOnce $history 'function FragmentPurchase({ purchase, accountName, expanded, items, loadingDetails, dark, isAr, onToggle, onEdit, dateText }: {' 'function FragmentPurchase({ purchase, accountName, expanded, items, loadingDetails, dark, isAr, onToggle, onEdit, canEdit, dateText }: {' 'add purchase edit UI permission prop' $historyPath -Optional -AlreadyText 'onEdit, canEdit, dateText }: {'
$history = Replace-LiteralOnce $history '  onEdit: () => void;' ('  onEdit: () => void;' + [Environment]::NewLine + '  canEdit: boolean;') 'type purchase edit UI permission prop' $historyPath -Optional -AlreadyText 'canEdit: boolean;'
$history = Replace-LiteralOnce $history '<button type="button" onClick={onEdit} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-500">{isAr ? "تعديل" : "Edit"}</button>' '{canEdit && <button type="button" onClick={onEdit} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-500">{isAr ? "تعديل" : "Edit"}</button>}' 'hide purchase edit button without inventory.edit' $historyPath -Optional -AlreadyText 'canEdit && <button type="button" onClick={onEdit}'
Set-PlannedText $historyPath $history

# ---------- 8) SQL: guard privileged SECURITY DEFINER operations for staff rows with recorded permissions ----------
# The existing DB helper currently treats a missing clinic_staff row as owner/admin. This patch does NOT
# silently change that fallback because the VETRA Core token-issuer function is not in this repository,
# so its trusted role claims cannot be verified here without risking locking out all clinic owners.
# We do add explicit permission checks to privileged functions so linked staff accounts are checked at DB level.
# Apply the invoice-payment guard through the ordered, idempotent tenant SQL file below.
# Leave the historical migration unchanged to avoid introducing an install-order dependency.

$purchaseSqlPath = 'supabase/tenant-sql/vetra_inventory_purchases.sql'
$purchaseSql = Read-RepoFile $purchaseSqlPath
if (-not $purchaseSql) { Fail "Missing $purchaseSqlPath" }
$purchaseSql = Replace-RegexOnce $purchaseSql '(?s)(create or replace function public\.vetra_create_inventory_supplier\(.*?begin\s*if v_clinic_id is null then raise exception ''No active VETRA clinic found in token''; end if;)' ('__GROUP1__' + "`r`n  if not public.vetra_has_clinic_staff_permission('inventory', 'create') then raise exception 'Inventory creation permission is required'; end if;") 'guard supplier creation function' $purchaseSqlPath -Optional -AlreadyPattern "(?s)create or replace function public\.vetra_create_inventory_supplier\(.*?vetra_has_clinic_staff_permission\('inventory', 'create'\)"
$purchaseSql = Replace-RegexOnce $purchaseSql '(?s)(create or replace function public\.vetra_create_inventory_purchase\(.*?begin\s*if v_clinic_id is null then raise exception ''No active VETRA clinic found in token''; end if;)' ('__GROUP1__' + "`r`n  if not public.vetra_has_clinic_staff_permission('inventory', 'create') or not public.vetra_has_clinic_staff_permission('payments', 'create') then raise exception 'Inventory and payment creation permissions are required'; end if;") 'guard purchase creation function' $purchaseSqlPath -Optional -AlreadyPattern "(?s)create or replace function public\.vetra_create_inventory_purchase\(.*?vetra_has_clinic_staff_permission\('inventory', 'create'\).*?vetra_has_clinic_staff_permission\('payments', 'create'\)"
$purchaseSql = Replace-RegexOnce $purchaseSql '(?s)(create or replace function public\.vetra_update_inventory_purchase\(.*?begin\s*if v_clinic_id is null then raise exception ''No active VETRA clinic found in token''; end if;)' ('__GROUP1__' + "`r`n  if not public.vetra_has_clinic_staff_permission('inventory', 'edit') or not public.vetra_has_clinic_staff_permission('payments', 'edit') then raise exception 'Inventory and payment edit permissions are required'; end if;") 'guard purchase update function' $purchaseSqlPath -Optional -AlreadyPattern "(?s)create or replace function public\.vetra_update_inventory_purchase\(.*?vetra_has_clinic_staff_permission\('inventory', 'edit'\).*?vetra_has_clinic_staff_permission\('payments', 'edit'\)"
Set-PlannedText $purchaseSqlPath $purchaseSql

# ---------- 8a) Idempotent SQL patch for already-provisioned tenant databases ----------
$functionSqlPath = 'supabase/tenant-sql/vetra_permissions_function_guards.sql'
$functionSql = @'
-- Idempotently add permission checks to existing SECURITY DEFINER finance, cash-register and purchase functions.
-- Run on each clinic tenant database after finance, inventory-purchase SQL and vetra_staff_permission_rls.sql.
begin;

do $vetra_permission_patch$
declare
  v_target record;
  v_definition text;
  v_anchor text := 'if v_clinic_id is null then raise exception ''No active VETRA clinic found in token''; end if;';
  v_guard text;
  v_seen integer := 0;
begin
  if to_regprocedure('public.vetra_has_clinic_staff_permission(text,text)') is null then
    raise exception 'Apply vetra_staff_permission_rls.sql first; permission helper is missing.';
  end if;

  for v_target in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'vetra_create_financial_account',
        'vetra_open_cash_register',
        'vetra_close_cash_register',
        'vetra_post_financial_transaction',
        'vetra_transfer_between_accounts',
        'vetra_record_invoice_payment',
        'vetra_ensure_cash_register_open',
        'vetra_create_inventory_supplier',
        'vetra_create_inventory_purchase',
        'vetra_update_inventory_purchase'
      )
  loop
    v_definition := pg_get_functiondef(v_target.oid);
    case v_target.proname
      when 'vetra_create_financial_account' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''payments'', ''create'') then raise exception ''Financial account creation permission is required''; end if;';
      when 'vetra_open_cash_register' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''payments'', ''create'') then raise exception ''Cash register opening permission is required''; end if;';
      when 'vetra_close_cash_register' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''payments'', ''edit'') then raise exception ''Cash register closing permission is required''; end if;';
      when 'vetra_post_financial_transaction' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''payments'', ''create'') then raise exception ''Financial transaction creation permission is required''; end if;';
      when 'vetra_transfer_between_accounts' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''payments'', ''create'') then raise exception ''Financial transfer permission is required''; end if;';
      when 'vetra_record_invoice_payment' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''payments'', ''create'') then raise exception ''Payment creation permission is required''; end if;';
      when 'vetra_ensure_cash_register_open' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''payments'', ''create'') then raise exception ''Cash register operation permission is required''; end if;';
      when 'vetra_create_inventory_supplier' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''create'') then raise exception ''Inventory creation permission is required''; end if;';
      when 'vetra_create_inventory_purchase' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''create'') or not public.vetra_has_clinic_staff_permission(''payments'', ''create'') then raise exception ''Inventory and payment creation permissions are required''; end if;';
      when 'vetra_update_inventory_purchase' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''edit'') or not public.vetra_has_clinic_staff_permission(''payments'', ''edit'') then raise exception ''Inventory and payment edit permissions are required''; end if;';
    end case;

    if position(v_guard in v_definition) > 0 then
      v_seen := v_seen + 1;
      continue;
    end if;
    if position(v_anchor in v_definition) = 0 then
      raise exception 'Could not find the expected clinic-token guard in %. No function was changed.', v_target.proname;
    end if;

    v_definition := replace(v_definition, v_anchor, v_anchor || E'\n  ' || v_guard);
    execute v_definition;
    v_seen := v_seen + 1;
  end loop;

  if v_seen < 10 then
    raise exception 'Expected 10 permission-guarded functions, but found only %. Run all required finance, auto-open cash-register, inventory-purchase and permission SQL first.', v_seen;
  end if;
end;
$vetra_permission_patch$;

commit;
'@

if (Test-Path (Join-Path $repo $functionSqlPath)) {
  $existingFunctionSql = Read-RepoFile $functionSqlPath
  if ($existingFunctionSql -ne $functionSql) { Fail "$functionSqlPath already exists with different contents. To avoid overwriting work, it was not changed." }
} else {
  $script:Plan[$functionSqlPath] = $functionSql
  $script:CreatedFiles.Add($functionSqlPath)
}

# ---------- 8a-pre2) Prevent the base staff SQL from re-granting raw UPDATE ----------
$staffBaseSqlPath = 'supabase/tenant-sql/vetra_clinic_staff.sql'
$staffBaseSql = Read-RepoFile $staffBaseSqlPath
if (-not $staffBaseSql) { Fail "Missing $staffBaseSqlPath" }
$staffBaseSql = Replace-LiteralOnce $staffBaseSql 'grant select, insert, update, delete on public.clinic_staff to authenticated;' 'grant select, insert, delete on public.clinic_staff to authenticated;' 'do not grant raw UPDATE on clinic_staff' $staffBaseSqlPath -AlreadyText 'grant select, insert, delete on public.clinic_staff to authenticated;'
Set-PlannedText $staffBaseSqlPath $staffBaseSql

# ---------- 8a-pre) Ensure Finance may read the invoice summaries it displays ----------
# This updates the tenant SQL source; existing tenants should re-run the updated file before the additive policy file.
$permissionRlsPath = 'supabase/tenant-sql/vetra_staff_permission_rls.sql'
$permissionRls = Read-RepoFile $permissionRlsPath
if (-not $permissionRls) { Fail "Missing $permissionRlsPath" }
$invoiceReadPattern = '(?m)^([ \t]*)public\.vetra_has_clinic_staff_permission\(''invoices_page'', ''view''\)\r?\n[ \t]+or public\.vetra_has_clinic_staff_permission\(''invoices'', ''create''\)'
$invoiceReadPatchedPattern = '(?m)^([ \t]*)public\.vetra_has_clinic_staff_permission\(''invoices_page'', ''view''\)\r?\n[ \t]+or public\.vetra_has_clinic_staff_permission\(''finance_page'', ''view''\)\r?\n[ \t]+or public\.vetra_has_clinic_staff_permission\(''invoices'', ''create''\)'
$unpatchedInvoiceReadCount = [regex]::Matches($permissionRls, $invoiceReadPattern).Count
$patchedInvoiceReadCount = [regex]::Matches($permissionRls, $invoiceReadPatchedPattern).Count
if ($unpatchedInvoiceReadCount -eq 2 -and $patchedInvoiceReadCount -eq 0) {
  $permissionRls = [regex]::Replace($permissionRls, $invoiceReadPattern, [System.Text.RegularExpressions.MatchEvaluator]{
    param($m)
    $indent = $m.Groups[1].Value
    return $indent + "public.vetra_has_clinic_staff_permission('invoices_page', 'view')`n" +
      $indent + "  or public.vetra_has_clinic_staff_permission('finance_page', 'view')`n" +
      $indent + "  or public.vetra_has_clinic_staff_permission('invoices', 'create')"
  })
} elseif ($unpatchedInvoiceReadCount -eq 0 -and $patchedInvoiceReadCount -eq 2) {
  # The updated policy source is already present.
} else {
  Fail "Expected exactly two invoice select guards in $permissionRlsPath (unpatched=$unpatchedInvoiceReadCount, patched=$patchedInvoiceReadCount). No files have been written yet."
}
$permissionRlsFunctions = @'

-- Only the following checked routines may update clinic_staff after the raw UPDATE grant is revoked.
create or replace function public.vetra_update_clinic_staff_permissions(
  p_staff_id uuid,
  p_permissions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_group record;
  v_action record;
  v_saved jsonb;
  v_allowed_groups text[] := array['patients','all_patients','appointments','medical_records','prescriptions','vaccinations','invoices_page','invoices','finance_page','payments','inventory','reports','messages','staff','clinic_settings'];
  v_allowed_actions text[] := array['view','create','edit','delete','export'];
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  if p_staff_id is null or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Invalid staff permissions payload';
  end if;
  if not public.vetra_has_clinic_staff_permission('staff', 'view')
     or not public.vetra_has_clinic_staff_permission('staff', 'edit') then
    raise exception 'Staff edit permission is required';
  end if;

  for v_group in select key, value from jsonb_each(p_permissions)
  loop
    if not (v_group.key = any(v_allowed_groups)) or jsonb_typeof(v_group.value) <> 'object' then
      raise exception 'Invalid staff permission group';
    end if;
    for v_action in select key, value from jsonb_each(v_group.value)
    loop
      if not (v_action.key = any(v_allowed_actions)) or jsonb_typeof(v_action.value) <> 'boolean' then
        raise exception 'Invalid staff permission action';
      end if;
      if v_action.value = 'true'::jsonb
         and not public.vetra_has_clinic_staff_permission(v_group.key, v_action.key) then
        raise exception 'Cannot grant a permission the current user does not have';
      end if;
    end loop;
  end loop;

  update public.clinic_staff
  set permissions = p_permissions, updated_at = now()
  where id = p_staff_id and clinic_id = v_clinic_id
  returning permissions into v_saved;
  if not found then raise exception 'Staff member not found in this clinic'; end if;
  return v_saved;
end;
$$;

create or replace function public.vetra_link_clinic_staff_account(
  p_staff_id uuid,
  p_auth_user_id uuid,
  p_login_email text,
  p_must_change_password boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_existing_auth_user_id uuid;
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  if p_staff_id is null or p_auth_user_id is null or nullif(trim(p_login_email), '') is null then
    raise exception 'Invalid staff account link';
  end if;

  select auth_user_id into v_existing_auth_user_id
  from public.clinic_staff
  where id = p_staff_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Staff member not found in this clinic'; end if;

  if v_existing_auth_user_id is null then
    if not public.vetra_has_clinic_staff_permission('staff', 'view')
       or not public.vetra_has_clinic_staff_permission('staff', 'create') then
      raise exception 'Staff create permission is required';
    end if;
  else
    if p_auth_user_id <> v_existing_auth_user_id then
      raise exception 'An existing staff login cannot be relinked';
    end if;
    if not public.vetra_has_clinic_staff_permission('staff', 'view')
       or not public.vetra_has_clinic_staff_permission('staff', 'edit') then
      raise exception 'Staff edit permission is required';
    end if;
  end if;

  update public.clinic_staff
  set auth_user_id = p_auth_user_id,
      login_email = trim(p_login_email),
      must_change_password = coalesce(p_must_change_password, true),
      updated_at = now()
  where id = p_staff_id and clinic_id = v_clinic_id;
end;
$$;

create or replace function public.vetra_mark_clinic_staff_password_changed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  update public.clinic_staff
  set must_change_password = false, updated_at = now()
  where clinic_id = v_clinic_id and auth_user_id = auth.uid();
end;
$$;

revoke all on function public.vetra_update_clinic_staff_permissions(uuid, jsonb) from public, anon;
revoke all on function public.vetra_link_clinic_staff_account(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.vetra_mark_clinic_staff_password_changed() from public, anon;
grant execute on function public.vetra_update_clinic_staff_permissions(uuid, jsonb) to authenticated;
grant execute on function public.vetra_link_clinic_staff_account(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.vetra_mark_clinic_staff_password_changed() to authenticated;
revoke update on public.clinic_staff from authenticated;
'@
if ($permissionRls -notmatch 'create or replace function public\.vetra_update_clinic_staff_permissions') {
  $permissionRls = Replace-LiteralOnce $permissionRls 'grant execute on function public.vetra_has_clinic_staff_permission(text, text) to authenticated;' ('grant execute on function public.vetra_has_clinic_staff_permission(text, text) to authenticated;' + [Environment]::NewLine + $permissionRlsFunctions) 'install checked database routines for staff-table updates' $permissionRlsPath
} elseif ($permissionRls -notmatch 'revoke update on public\.clinic_staff from authenticated') {
  Fail "$permissionRlsPath has part of the new staff update routines but is missing the UPDATE revoke. Review the file manually; no files have been written yet."
}
Set-PlannedText $permissionRlsPath $permissionRls

# ---------- 8a) Additive tenant RLS policies ----------
# These restrictive policies add permission checks on top of the existing tenant policies; they do not remove them.
$staffPolicyPath = 'supabase/tenant-sql/vetra_staff_permission_policies.sql'
$staffPolicySql = @'
-- Additive permission gates for staff, inventory, and financial reads.
-- Apply after finance SQL, vetra_auto_open_cash_register.sql, vetra_clinic_staff.sql,
-- vetra_clinic_staff_permissions.sql, vetra_inventory_purchases.sql, and updated vetra_staff_permission_rls.sql.
begin;

do $$
declare
  v_required record;
begin
  if to_regprocedure('public.vetra_has_clinic_staff_permission(text,text)') is null then
    raise exception 'Apply vetra_staff_permission_rls.sql first; permission helper is missing.';
  end if;
  if to_regprocedure('public.vetra_update_clinic_staff_permissions(uuid,jsonb)') is null
     or to_regprocedure('public.vetra_link_clinic_staff_account(uuid,uuid,text,boolean)') is null
     or to_regprocedure('public.vetra_mark_clinic_staff_password_changed()') is null then
    raise exception 'Apply the updated vetra_staff_permission_rls.sql first; checked clinic_staff update routines are missing.';
  end if;

  -- Do not enable RLS on product tables unless their old tenant policies exist.
  -- If this check fails, no policy changes are committed; add/verify base policies first.
  for v_required in
    select * from (values
      ('products', 'SELECT'), ('products', 'INSERT'), ('products', 'UPDATE'),
      ('product_categories', 'SELECT'), ('product_categories', 'INSERT'),
      ('product_categories', 'UPDATE'), ('product_categories', 'DELETE'),
      ('inventory_suppliers', 'SELECT'), ('inventory_purchases', 'SELECT'),
      ('inventory_purchase_items', 'SELECT'), ('financial_accounts', 'SELECT'),
      ('cash_register_sessions', 'SELECT'), ('financial_transactions', 'SELECT')
    ) as required_policy(table_name, command_name)
  loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_required.table_name
        and p.permissive = 'PERMISSIVE'
        and (p.cmd = v_required.command_name or p.cmd = 'ALL')
    ) then
      raise exception 'Missing existing permissive tenant policy for %.%. No permission policies were applied.', v_required.command_name, v_required.table_name;
    end if;
  end loop;
end;
$$;

alter table public.clinic_staff enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.inventory_suppliers enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_purchase_items enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.cash_register_sessions enable row level security;
alter table public.financial_transactions enable row level security;

-- clinic_staff: users can read their own permission row; listing and mutations require view plus the requested action.
drop policy if exists vetra_staff_directory_select_guard on public.clinic_staff;
create policy vetra_staff_directory_select_guard on public.clinic_staff
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (auth_user_id = auth.uid() or public.vetra_has_clinic_staff_permission('staff', 'view')));
drop policy if exists vetra_staff_directory_insert_guard on public.clinic_staff;
create policy vetra_staff_directory_insert_guard on public.clinic_staff
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'create'));
drop policy if exists vetra_staff_directory_update_guard on public.clinic_staff;
create policy vetra_staff_directory_update_guard on public.clinic_staff
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'edit'));
drop policy if exists vetra_staff_directory_delete_guard on public.clinic_staff;
create policy vetra_staff_directory_delete_guard on public.clinic_staff
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'delete'));

-- Inventory tables: keep the existing clinic isolation policies and add permission checks.
drop policy if exists vetra_staff_products_select_guard on public.products;
create policy vetra_staff_products_select_guard on public.products
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('inventory', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('prescriptions', 'view')
      or public.vetra_has_clinic_staff_permission('prescriptions', 'create')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'view')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'create')
      or public.vetra_has_clinic_staff_permission('invoices_page', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')
    ));
drop policy if exists vetra_staff_products_insert_guard on public.products;
create policy vetra_staff_products_insert_guard on public.products
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_products_update_guard on public.products;
create policy vetra_staff_products_update_guard on public.products
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_products_delete_guard on public.products;
create policy vetra_staff_products_delete_guard on public.products
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

drop policy if exists vetra_staff_product_categories_select_guard on public.product_categories;
create policy vetra_staff_product_categories_select_guard on public.product_categories
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('inventory', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('prescriptions', 'view')
      or public.vetra_has_clinic_staff_permission('prescriptions', 'create')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'view')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'create')
      or public.vetra_has_clinic_staff_permission('invoices_page', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')
    ));
drop policy if exists vetra_staff_product_categories_insert_guard on public.product_categories;
create policy vetra_staff_product_categories_insert_guard on public.product_categories
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_product_categories_update_guard on public.product_categories;
create policy vetra_staff_product_categories_update_guard on public.product_categories
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_product_categories_delete_guard on public.product_categories;
create policy vetra_staff_product_categories_delete_guard on public.product_categories
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Supplier and purchase direct table access is restricted too; SECURITY DEFINER purchase functions
-- receive the same checks in vetra_inventory_purchases.sql.
drop policy if exists vetra_staff_inventory_suppliers_select_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_select_guard on public.inventory_suppliers
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_suppliers_insert_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_insert_guard on public.inventory_suppliers
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_suppliers_update_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_update_guard on public.inventory_suppliers
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_suppliers_delete_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_delete_guard on public.inventory_suppliers
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

drop policy if exists vetra_staff_inventory_purchases_select_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_select_guard on public.inventory_purchases
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_purchases_insert_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_insert_guard on public.inventory_purchases
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_purchases_update_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_update_guard on public.inventory_purchases
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_purchases_delete_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_delete_guard on public.inventory_purchases
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Purchase line items must follow the same view/create/edit/delete boundaries as the parent purchase.
drop policy if exists vetra_staff_inventory_purchase_items_select_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_select_guard on public.inventory_purchase_items
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_purchase_items_insert_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_insert_guard on public.inventory_purchase_items
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_purchase_items_update_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_update_guard on public.inventory_purchase_items
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_purchase_items_delete_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_delete_guard on public.inventory_purchase_items
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Financial reads are split between Finance and register permissions.
-- The Finance page may read account balances, invoice summaries, and the movement ledger;
-- the cash-register page requires the more specific payments.view permission.
drop policy if exists vetra_staff_financial_accounts_select_guard on public.financial_accounts;
create policy vetra_staff_financial_accounts_select_guard on public.financial_accounts
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (public.vetra_has_clinic_staff_permission('finance_page', 'view')
      or public.vetra_has_clinic_staff_permission('payments', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')));
drop policy if exists vetra_staff_cash_sessions_select_guard on public.cash_register_sessions;
create policy vetra_staff_cash_sessions_select_guard on public.cash_register_sessions
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('payments', 'view'));
drop policy if exists vetra_staff_financial_transactions_select_guard on public.financial_transactions;
create policy vetra_staff_financial_transactions_select_guard on public.financial_transactions
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (public.vetra_has_clinic_staff_permission('finance_page', 'view')
      or public.vetra_has_clinic_staff_permission('payments', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')));

-- The existing invoice and invoice-item select guards are also recreated by the updated
-- vetra_staff_permission_rls.sql so Finance can show its authorized invoice summaries.
commit;
'@
if (Test-Path (Join-Path $repo $staffPolicyPath)) {
  $existingPolicySql = Read-RepoFile $staffPolicyPath
  if ($existingPolicySql -ne $staffPolicySql) { Fail "$staffPolicyPath already exists with different contents. To avoid overwriting work, it was not changed." }
} else {
  $script:Plan[$staffPolicyPath] = $staffPolicySql
  $script:CreatedFiles.Add($staffPolicyPath)
}

# ---------- 9) Preflight and write: backups first, no partial source writes before all anchors validate ----------
if ($script:Plan.Count -eq 0) {
  Write-Host 'No source changes were needed; the target code appears already patched.' -ForegroundColor Green
  exit 0
}

# Check basic required replacements are present in the planned versions.
$plannedStaff = if ($script:Plan.Contains('app/staff/page.tsx')) { $script:Plan['app/staff/page.tsx'] } else { Read-RepoFile 'app/staff/page.tsx' }
if ($plannedStaff -notmatch 'setAuthorized\(can\("staff", "view"\)\)' -and $plannedStaff -notmatch 'const allowed = can\("staff", "view"\)') { Fail 'Staff page authorization guard was not found after patch planning.' }
$plannedSettings = Read-RepoFile 'app/settings/page.tsx'
if ($script:Plan.Contains('app/settings/page.tsx')) { $plannedSettings = $script:Plan['app/settings/page.tsx'] }
if ($plannedSettings -match 'const \{ hasPermission, permissionsLoaded \} = useStaffPermissions\(\)') { Fail 'settings/page.tsx still uses the invalid permissionsLoaded property.' }
$plannedFinance = if ($script:Plan.Contains('app/finance/page.tsx')) { $script:Plan['app/finance/page.tsx'] } else { Read-RepoFile 'app/finance/page.tsx' }
if ($plannedFinance -match 'can\("finance", "view"\)') { Fail 'The obsolete finance permission key remains.' }
$plannedPermissions = if ($script:Plan.Contains('lib/staff-permissions.ts')) { $script:Plan['lib/staff-permissions.ts'] } else { Read-RepoFile 'lib/staff-permissions.ts' }
if ($plannedPermissions -match 'pathname.startsWith\("/settings"\).*action: "view"') { Fail 'The settings route still maps only to clinic_settings.view.' }
$plannedProducts = if ($script:Plan.Contains('app/inventory/products/page.tsx')) { $script:Plan['app/inventory/products/page.tsx'] } else { Read-RepoFile 'app/inventory/products/page.tsx' }
if ($plannedProducts -notmatch 'requireInventoryPermission\(editingProduct \? "edit" : "create"\)') { Fail 'Product create/edit guard was not planned correctly.' }
$plannedAccounts = if ($script:Plan.Contains('app/api/staff/accounts/route.ts')) { $script:Plan['app/api/staff/accounts/route.ts'] } else { Read-RepoFile 'app/api/staff/accounts/route.ts' }
if ($plannedAccounts -match '\.from\("clinic_staff"\)\.update\(') { Fail 'A direct clinic_staff update remains in staff accounts API; refusing to revoke table UPDATE until all paths are patched.' }
$plannedChangePassword = if ($script:Plan.Contains('app/api/staff/change-password/route.ts')) { $script:Plan['app/api/staff/change-password/route.ts'] } else { Read-RepoFile 'app/api/staff/change-password/route.ts' }
if ($plannedChangePassword -match '\.from\("clinic_staff"\)\.update\(') { Fail 'A direct clinic_staff update remains in the change-password API.' }
$plannedStaffPermissionsApi = if ($script:Plan.Contains('app/api/staff/permissions/route.ts')) { $script:Plan['app/api/staff/permissions/route.ts'] } else { Read-RepoFile 'app/api/staff/permissions/route.ts' }
if ($plannedStaffPermissionsApi -match '\.from\("clinic_staff"\)\.update\(' -or $plannedStaffPermissionsApi -notmatch 'vetra_update_clinic_staff_permissions') { Fail 'Staff permission updates must use the checked database RPC.' }
$plannedPermissionRls = if ($script:Plan.Contains('supabase/tenant-sql/vetra_staff_permission_rls.sql')) { $script:Plan['supabase/tenant-sql/vetra_staff_permission_rls.sql'] } else { Read-RepoFile 'supabase/tenant-sql/vetra_staff_permission_rls.sql' }
if ($plannedPermissionRls -notmatch 'revoke update on public\.clinic_staff from authenticated' -or $plannedPermissionRls -notmatch 'create or replace function public\.vetra_update_clinic_staff_permissions' -or $plannedPermissionRls -notmatch 'create or replace function public\.vetra_link_clinic_staff_account' -or $plannedPermissionRls -notmatch 'create or replace function public\.vetra_mark_clinic_staff_password_changed') { Fail 'The database-side clinic_staff UPDATE hardening was not planned completely.' }
$plannedStaffBaseSql = if ($script:Plan.Contains('supabase/tenant-sql/vetra_clinic_staff.sql')) { $script:Plan['supabase/tenant-sql/vetra_clinic_staff.sql'] } else { Read-RepoFile 'supabase/tenant-sql/vetra_clinic_staff.sql' }
if ($plannedStaffBaseSql -match 'grant select, insert, update, delete on public\.clinic_staff to authenticated') { Fail 'The base clinic_staff SQL still grants raw UPDATE.' }

# Ensure backups cover all existing files before writing anything.
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
foreach ($relativePath in $script:Plan.Keys) {
  $targetPath = Join-Path $repo $relativePath
  if (Test-Path $targetPath) {
    $backupPath = Join-Path $backupRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path $backupPath -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $targetPath -Destination $backupPath -Force
  }
}

try {
  foreach ($relativePath in $script:Plan.Keys) {
    $targetPath = Join-Path $repo $relativePath
    New-Item -ItemType Directory -Path (Split-Path $targetPath -Parent) -Force | Out-Null
    $content = [string]$script:Plan[$relativePath]
    # Normalize planned text first, including replacement snippets that use Environment.NewLine.
    $content = $content -replace "`r`n?", "`n"
    # Keep existing newline style for existing files; new files use CRLF on Windows.
    if (Test-Path $targetPath) {
      $old = [System.IO.File]::ReadAllText($targetPath)
      if ($old.Contains("`r`n")) { $content = $content -replace '(?<!\r)\n', "`r`n" }
    } else {
      $content = $content -replace '(?<!\r)\n', "`r`n"
    }
    [System.IO.File]::WriteAllText($targetPath, $content, [System.Text.UTF8Encoding]::new($false))
  }
} catch {
  Write-Error "A write failed. Backups are in $backupRoot. Restore the affected files from that folder before retrying. $_"
  throw
}

Write-Host ''
Write-Host 'Patch applied. Existing files were backed up; no files were deleted.' -ForegroundColor Green
Write-Host "Backup folder: $backupRoot" -ForegroundColor Cyan
Write-Host 'Changed/created files:' -ForegroundColor Cyan
$script:Plan.Keys | ForEach-Object { Write-Host "  $_" }
Write-Host ''
Write-Host 'Next, run:' -ForegroundColor Yellow
Write-Host '  npx tsc --noEmit'
Write-Host '  npm run build'
Write-Host ''
Write-Warning 'Apply the updated supabase/tenant-sql/vetra_staff_permission_rls.sql first, then supabase/tenant-sql/vetra_permissions_function_guards.sql, then supabase/tenant-sql/vetra_staff_permission_policies.sql to EACH clinic tenant database. Ensure finance migration, auto-open cash-register SQL, clinic-staff SQL, clinic-staff-permissions SQL, and inventory-purchases SQL are installed first. This patch still cannot safely change the helper fallback for users with no clinic_staff row because the trusted role-claim issuer is outside this repository. Verify that Core token claim before changing that fallback; until then, no patch can honestly guarantee fail-closed RLS for orphan/unmapped users.'
