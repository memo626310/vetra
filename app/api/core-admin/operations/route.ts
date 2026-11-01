import { PushSetupError } from "@/lib/push-server";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export const dynamic = "force-dynamic";

type Body = { action?: string; doctorId?: string; clinicId?: string; planId?: string; period?: string; confirmationName?: string };

export async function POST(request: Request) {
  try {
    const { admin, userId } = await requirePlatformAdmin(request);
    const body = await request.json().catch(() => null) as Body | null;
    if (!body || typeof body.action !== "string") throw new PushSetupError("الطلب غير صالح.", 400);

    if (body.action === "doctor_status") {
      if (!body.doctorId || !["active", "suspended"].includes(String(body.period))) throw new PushSetupError("بيانات حالة الطبيب غير صالحة.", 400);
      const nextStatus = body.period as "active" | "suspended";
      const { data: memberships, error: membershipReadError } = await admin.from("clinic_members").select("clinic_id").eq("doctor_id", body.doctorId);
      if (membershipReadError) throw membershipReadError;
      const { error: doctorError } = await admin.from("doctors").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", body.doctorId);
      if (doctorError) throw doctorError;
      const { error: membershipError } = await admin.from("clinic_members").update({ status: nextStatus === "active" ? "active" : "suspended" }).eq("doctor_id", body.doctorId);
      if (membershipError) throw membershipError;
      const { error: authError } = await admin.auth.admin.updateUserById(body.doctorId, { ban_duration: nextStatus === "suspended" ? "876000h" : "none" });
      if (authError) throw authError;
      return Response.json({ ok: true, status: nextStatus, clinics: memberships?.length || 0 });
    }

    if (body.action === "doctor_delete") {
      if (!body.doctorId) throw new PushSetupError("حساب الطبيب غير محدد.", 400);
      const { data: ownedClinics, error: clinicError } = await admin.from("clinics").select("id,name").eq("owner_doctor_id", body.doctorId);
      if (clinicError) throw clinicError;
      if (ownedClinics?.length) throw new PushSetupError("هذا الطبيب مالك لعيادة. انقل ملكية العيادة أو احذفها أولًا؛ أوقف الحساب مؤقتًا حتى ذلك الحين.", 409);
      const { error: membersError } = await admin.from("clinic_members").delete().eq("doctor_id", body.doctorId);
      if (membersError) throw membersError;
      await admin.from("vetra_match_moderators").delete().eq("user_id", body.doctorId);
      const { error: userError } = await admin.auth.admin.deleteUser(body.doctorId);
      if (userError) throw userError;
      return Response.json({ ok: true });
    }

    if (body.action === "clinic_delete") {
      if (!body.clinicId || typeof body.confirmationName !== "string") throw new PushSetupError("بيانات تأكيد حذف العيادة غير مكتملة.", 400);
      const { data: clinic, error: clinicError } = await admin.from("clinics")
        .select("id,name,owner_doctor_id")
        .eq("id", body.clinicId)
        .maybeSingle();
      if (clinicError) throw clinicError;
      if (!clinic) throw new PushSetupError("العيادة غير موجودة.", 404);
      if (body.confirmationName.trim() !== clinic.name) throw new PushSetupError("اسم العيادة لا يطابق التأكيد.", 400);

      const { data: database, error: databaseError } = await admin.from("clinic_databases")
        .select("project_ref,provider")
        .eq("clinic_id", clinic.id)
        .maybeSingle();
      if (databaseError) throw databaseError;
      if (database?.provider === "supabase") {
        const { count: projectClinicCount, error: sharedProjectError } = await admin.from("clinic_databases")
          .select("clinic_id", { count: "exact", head: true })
          .eq("project_ref", database.project_ref);
        if (sharedProjectError) throw sharedProjectError;
        if ((projectClinicCount || 0) > 1) {
          throw new PushSetupError("لا يمكن حذف هذه العيادة من اللوحة لأن قاعدة بياناتها مشتركة مع عيادات أخرى. يجب فصل قاعدة البيانات أو حذف العيادات المشتركة معًا من إجراء مخصص.", 409);
        }
        if (process.env.ALLOW_CLINIC_PROJECT_DELETION !== "true") {
          throw new PushSetupError("حذف مشاريع العيادات معطّل افتراضيًا. لا تفعّله قبل التأكد أن قاعدة البيانات مخصصة لهذه العيادة وحدها.", 403);
        }
        const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
        if (!accessToken) throw new PushSetupError("يلزم ضبط SUPABASE_ACCESS_TOKEN في إعدادات السيرفر لحذف مشروع قاعدة بيانات العيادة بأمان.", 503);
        const deleteResponse = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(database.project_ref)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          cache: "no-store",
        });
        if (!deleteResponse.ok) {
          const detail = await deleteResponse.text().catch(() => "");
          console.error("SUPABASE PROJECT DELETE FAILED:", deleteResponse.status, detail.slice(0, 500));
          throw new PushSetupError(deleteResponse.status === 401 || deleteResponse.status === 403
            ? "رمز Supabase الإداري غير صالح أو لا يملك صلاحية حذف المشروع."
            : "تعذر حذف مشروع قاعدة بيانات العيادة؛ لم تُحذف سجلاتها المركزية.", deleteResponse.status === 401 || deleteResponse.status === 403 ? 403 : 502);
        }
      }

      const cleanup = await Promise.all([
        admin.from("subscriptions").delete().eq("clinic_id", clinic.id),
        admin.from("clinic_members").delete().eq("clinic_id", clinic.id),
        admin.from("clinic_databases").delete().eq("clinic_id", clinic.id),
        admin.from("vetra_push_subscriptions").delete().eq("clinic_id", clinic.id),
        admin.from("vetra_push_reminders").delete().eq("clinic_id", clinic.id),
        admin.from("vetra_client_activity").delete().eq("clinic_id", clinic.id),
      ]);
      const cleanupError = cleanup.find((result) => result.error)?.error;
      if (cleanupError) throw cleanupError;
      const activityCleanup = await admin.from("vetra_platform_activity").delete().eq("clinic_id", clinic.id);
      if (activityCleanup.error && activityCleanup.error.code !== "PGRST205") throw activityCleanup.error;
      const { error: deleteClinicError } = await admin.from("clinics").delete().eq("id", clinic.id);
      if (deleteClinicError) throw deleteClinicError;

      const { data: remainingMemberships, error: remainingError } = await admin.from("clinic_members").select("id").eq("doctor_id", clinic.owner_doctor_id).limit(1);
      if (remainingError) throw remainingError;
      const { data: otherOwnedClinics, error: otherOwnedError } = await admin.from("clinics").select("id").eq("owner_doctor_id", clinic.owner_doctor_id).limit(1);
      if (otherOwnedError) throw otherOwnedError;
      if (!remainingMemberships?.length && !otherOwnedClinics?.length) {
        const { error: doctorDeleteError } = await admin.auth.admin.deleteUser(clinic.owner_doctor_id);
        if (doctorDeleteError) console.error("ORPHAN CLINIC OWNER CLEANUP FAILED:", doctorDeleteError.message);
      }
      return Response.json({ ok: true, deletedClinic: clinic.name });
    }

    if (body.action === "subscription_set") {
      if (!body.clinicId || !body.planId || !["monthly", "two_months", "yearly", "lifetime"].includes(String(body.period))) {
        throw new PushSetupError("اختَر الخطة والمدة المطلوبة.", 400);
      }
      const period = body.period as "monthly" | "two_months" | "yearly" | "lifetime";
      const { data: plan, error: planError } = await admin.from("subscription_plans").select("id").eq("id", body.planId).eq("is_active", true).maybeSingle();
      if (planError) throw planError;
      if (!plan) throw new PushSetupError("الخطة المحددة غير متاحة.", 404);
      const now = new Date();
      const endsAt = new Date(now);
      if (period === "monthly") endsAt.setMonth(endsAt.getMonth() + 1);
      if (period === "two_months") endsAt.setMonth(endsAt.getMonth() + 2);
      if (period === "yearly") endsAt.setFullYear(endsAt.getFullYear() + 1);
      const { data: current, error: currentError } = await admin.from("subscriptions").select("id").eq("clinic_id", body.clinicId).in("status", ["trial", "active", "past_due"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (currentError) throw currentError;
      const row = { plan_id: body.planId, status: "active", billing_period: period, trial_started_at: null, trial_ends_at: null, started_at: now.toISOString(), ends_at: period === "lifetime" ? null : endsAt.toISOString(), updated_at: now.toISOString() };
      const result = current
        ? await admin.from("subscriptions").update(row).eq("id", current.id)
        : await admin.from("subscriptions").insert({ ...row, clinic_id: body.clinicId });
      if (result.error) throw result.error;
      return Response.json({ ok: true, period, endsAt: period === "lifetime" ? null : endsAt.toISOString() });
    }

    void userId;
    throw new PushSetupError("الإجراء غير معروف.", 400);
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("CORE ADMIN OPERATION ERROR:", error);
    return Response.json({ error: "تعذر تنفيذ العملية." }, { status: 500 });
  }
}
