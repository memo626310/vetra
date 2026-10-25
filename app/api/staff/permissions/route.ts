import { fullStaffPermissions, normalizeStaffPermissions, permissionDefinitions } from "@/lib/staff-permissions";
import { PushSetupError, resolveClinicPushContext } from "@/lib/push-server";
import { getClinicStaffPermissions, requireClinicStaffPermission } from "@/lib/staff-api-auth";

export const dynamic = "force-dynamic";

async function authorize(request: Request) {
  return requireClinicStaffPermission(request, "edit");
}

export async function GET(request: Request) {
  try {
    const actor = await resolveClinicPushContext(request);

    // Owner and admin get full permissions
    if (["owner", "admin"].includes(actor.role)) {
      return Response.json({ id: null, permissions: fullStaffPermissions() }, { headers: { "Cache-Control": "no-store" } });
    }

    const url = new URL(request.url);
    const staffId = url.searchParams.get("staffId");
    if (staffId) throw new PushSetupError("لا يمكنك عرض صلاحيات موظف آخر.", 403);

    // Get staff permissions from clinic_staff table
    const { data, error } = await actor.clinicDb
      .from("clinic_staff")
      .select("id,staff_type,permissions")
      .eq("clinic_id", actor.clinicId)
      .eq("auth_user_id", actor.userId)
      .maybeSingle();

    if (error) {
      console.error("STAFF PERMISSIONS QUERY ERROR:", error);
      throw error;
    }

    if (!data) {
      console.error("STAFF NOT FOUND:", {
        clinicId: actor.clinicId,
        userId: actor.userId,
        role: actor.role,
      });
      throw new PushSetupError("الموظف غير موجود في هذه العيادة.", 404);
    }

    console.log("STAFF PERMISSIONS FOUND:", {
      id: data.id,
      staff_type: data.staff_type,
      hasPermissions: !!data.permissions,
    });

    return Response.json({
      id: data.id,
      permissions: normalizeStaffPermissions(data.permissions, data.staff_type)
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("STAFF PERMISSIONS GET ERROR:", error);
    return Response.json({ error: "تعذر تحميل صلاحيات الموظف." }, { status: 500 });
  }
}

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
    const diagnosticError = error && typeof error === "object"
      ? error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
      : null;
    const diagnostic = [
      typeof diagnosticError?.code === "string" ? `code=${diagnosticError.code}` : "",
      typeof diagnosticError?.message === "string" ? diagnosticError.message : String(error),
      typeof diagnosticError?.details === "string" ? `details=${diagnosticError.details}` : "",
      typeof diagnosticError?.hint === "string" ? `hint=${diagnosticError.hint}` : "",
    ].filter(Boolean).join(" | ");
    return Response.json({ error: `ØªØ¹Ø°Ø± Ø­ÙØ¸ ØµÙ„Ø§Ø­ÙŠØ§Øª Ø§Ù„Ù…ÙˆØ¸Ù: ${diagnostic}` }, { status: 500 });
  }
}
