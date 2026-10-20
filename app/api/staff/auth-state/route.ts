import { getCoreAdminClient, PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await resolveClinicPushContext(request);
    const { data, error } = await getCoreAdminClient().from("clinic_members")
      .select("must_change_password,status")
      .eq("clinic_id", actor.clinicId).eq("doctor_id", actor.userId).maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "active") throw new PushSetupError("حساب العيادة غير نشط.", 403);
    return Response.json({ mustChangePassword: Boolean(data.must_change_password) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("STAFF AUTH STATE ERROR:", error);
    return Response.json({ error: "تعذر التحقق من حالة كلمة المرور." }, { status: 500 });
  }
}
