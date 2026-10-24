import { fullStaffPermissions, normalizeStaffPermissions } from "@/lib/staff-permissions";
import { PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const dynamic = "force-dynamic";

async function authorize(request: Request) {
  const actor = await resolveClinicPushContext(request);
  if (!["owner", "admin"].includes(actor.role)) {
    throw new PushSetupError("إدارة صلاحيات الفريق متاحة للمالك أو مدير العيادة فقط.", 403);
  }
  return actor;
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
    if (typeof body?.staffId !== "string" || !body.permissions || typeof body.permissions !== "object") {
      throw new PushSetupError("بيانات الصلاحيات غير صالحة.", 400);
    }
    const { data: staff, error: findError } = await actor.clinicDb.from("clinic_staff")
      .select("id,staff_type").eq("id", body.staffId).eq("clinic_id", actor.clinicId).maybeSingle();
    if (findError) throw findError;
    if (!staff) throw new PushSetupError("الموظف غير موجود في هذه العيادة.", 404);
    const permissions = normalizeStaffPermissions(body.permissions, staff.staff_type);
    const { error } = await actor.clinicDb.from("clinic_staff").update({ permissions })
      .eq("id", staff.id).eq("clinic_id", actor.clinicId);
    if (error) throw error;
    return Response.json({ ok: true, permissions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("STAFF PERMISSIONS PUT ERROR:", error);
    return Response.json({ error: "تعذر حفظ صلاحيات الموظف." }, { status: 500 });
  }
}
