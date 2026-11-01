import { PushSetupError, getCoreAdminClient, resolveClinicPushContext } from "@/lib/push-server";

export const dynamic = "force-dynamic";

const pageNames: Array<[string, string]> = [
  ["/dashboard", "لوحة العيادة"], ["/appointments", "المواعيد"], ["/visits", "الزيارات"],
  ["/pets", "ملفات الحيوانات"], ["/clients", "العملاء"], ["/vaccinations", "التطعيمات"],
  ["/inventory", "المخزون"], ["/invoices", "الفواتير"], ["/finance", "المالية"],
  ["/reports", "التقارير"], ["/staff", "فريق العيادة"], ["/settings", "الإعدادات"],
  ["/messages", "الرسائل"], ["/reception", "الاستقبال"],
];

export async function POST(request: Request) {
  try {
    const actor = await resolveClinicPushContext(request);
    const body = await request.json().catch(() => null) as { route?: unknown } | null;
    const route = typeof body?.route === "string" ? body.route.slice(0, 180) : "";
    if (!route.startsWith("/") || route.startsWith("//") || route.includes("?")) throw new PushSetupError("المسار غير صالح.", 400);
    const page = pageNames.find(([prefix]) => route === prefix || route.startsWith(`${prefix}/`));
    const pageLabel = page?.[1] || "قسم آخر";
    const admin = getCoreAdminClient();
    const { error } = await admin.from("vetra_platform_activity").insert({ user_id: actor.userId, clinic_id: actor.clinicId, route, page_label: pageLabel });
    if (error) throw error;
    return Response.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("PLATFORM ACTIVITY LOG ERROR:", error);
    return Response.json({ error: "تعذر تسجيل النشاط." }, { status: 500 });
  }
}
