import { getCoreAdminClient, PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { password?: unknown } | null;
    if (typeof body?.password !== "string" || body.password.length < 10 || body.password.length > 128) {
      throw new PushSetupError("كلمة المرور يجب أن تكون بين 10 و128 حرفًا.", 400);
    }
    const actor = await resolveClinicPushContext(request);
    const admin = getCoreAdminClient();
    const { data: member, error: memberError } = await admin.from("clinic_members")
      .select("id,must_change_password,status")
      .eq("clinic_id", actor.clinicId).eq("doctor_id", actor.userId).maybeSingle();
    if (memberError) throw memberError;
    if (!member || member.status !== "active" || !member.must_change_password) {
      throw new PushSetupError("لا يوجد تغيير كلمة مرور مطلوب لهذا الحساب.", 403);
    }

    const { error: passwordError } = await admin.auth.admin.updateUserById(actor.userId, { password: body.password });
    if (passwordError) throw passwordError;
    const { error: updateError } = await admin.from("clinic_members")
      .update({ must_change_password: false }).eq("id", member.id);
    if (updateError) throw updateError;
    await actor.clinicDb.rpc("vetra_mark_clinic_staff_password_changed");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("STAFF PASSWORD CHANGE ERROR:", error);
    return Response.json({ error: "تعذر تغيير كلمة المرور." }, { status: 500 });
  }
}
