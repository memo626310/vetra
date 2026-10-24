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