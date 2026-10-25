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

export async function assertClinicPermission(
  actor: Awaited<ReturnType<typeof resolveClinicPushContext>>,
  key: string,
  action: PermissionAction,
) {
  const permissions = await getClinicStaffPermissions(actor);
  if (!hasStaffPermission(permissions, key, action)) {
    throw new PushSetupError("لا تملك الصلاحية المطلوبة لتنفيذ هذه العملية.", 403);
  }
  return actor;
}

export async function requireClinicPermission(request: Request, key: string, action: PermissionAction) {
  const actor = await resolveClinicPushContext(request);
  return assertClinicPermission(actor, key, action);
}

export async function requireClinicStaffPermission(request: Request, action: PermissionAction) {
  const actor = await resolveClinicPushContext(request);
  return assertClinicStaffPermission(actor, action);
}
