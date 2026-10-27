import { PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const dynamic = "force-dynamic";

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205"
    || /relation .* does not exist|table .* not found|could not find the table/i.test(error.message || "");
}

export async function POST(request: Request) {
  try {
    const context = await resolveClinicPushContext(request);
    if (!["owner", "admin"].includes(context.role.toLowerCase())) {
      throw new PushSetupError("إزالة زيارات التحصيل متاحة للمالك أو مدير العيادة فقط.", 403);
    }

    const body = await request.json().catch(() => null) as { visitId?: unknown } | null;
    if (typeof body?.visitId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.visitId)) {
      throw new PushSetupError("معرّف الزيارة غير صالح.", 400);
    }

    const { data: visit, error: visitError } = await context.clinicDb.from("visits")
      .select("id").eq("id", body.visitId).eq("clinic_id", context.clinicId).maybeSingle();
    if (visitError) throw visitError;
    if (!visit) throw new PushSetupError("الزيارة غير موجودة في العيادة الحالية.", 404);

    const { data: invoices, error: invoiceError } = await context.clinicDb.from("invoices")
      .select("id").eq("clinic_id", context.clinicId).eq("visit_id", body.visitId).limit(1);
    if (invoiceError) throw invoiceError;
    if (invoices?.length) throw new PushSetupError("تم إنشاء فاتورة لهذه الزيارة بالفعل.", 409);

    const { error } = await context.clinicDb.from("clinic_checkout_dismissals").upsert({
      clinic_id: context.clinicId,
      visit_id: body.visitId,
      dismissed_by: context.userId,
    }, { onConflict: "clinic_id,visit_id", ignoreDuplicates: true });
    if (error) {
      if (isMissingTable(error)) {
        throw new PushSetupError("يلزم تشغيل ملف supabase/tenant-sql/vetra_checkout_dismissals.sql على قاعدة بيانات العيادة.", 503);
      }
      throw error;
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("CHECKOUT DISMISSAL ERROR:", error);
    return Response.json({ error: "تعذر إزالة الزيارة من قائمة التحصيل." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await resolveClinicPushContext(request);
    if (context.role.toLowerCase() !== "owner") {
      throw new PushSetupError("إخفاء فواتير قائمة الاستقبال متاح لمالك العيادة فقط.", 403);
    }

    const body = await request.json().catch(() => null) as { visitId?: unknown } | null;
    if (typeof body?.visitId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.visitId)) {
      throw new PushSetupError("معرّف الزيارة غير صالح.", 400);
    }

    const { data: visit, error: visitError } = await context.clinicDb.from("visits")
      .select("id").eq("id", body.visitId).eq("clinic_id", context.clinicId).maybeSingle();
    if (visitError) throw visitError;
    if (!visit) throw new PushSetupError("الزيارة غير موجودة في العيادة الحالية.", 404);

    const { data: invoices, error: invoiceError } = await context.clinicDb.from("invoices")
      .select("id").eq("clinic_id", context.clinicId).eq("visit_id", body.visitId).limit(1);
    if (invoiceError) throw invoiceError;
    if (!invoices?.length) throw new PushSetupError("لا توجد فاتورة مرتبطة بهذه الزيارة.", 404);

    const { error } = await context.clinicDb.from("clinic_checkout_dismissals").upsert({
      clinic_id: context.clinicId,
      visit_id: body.visitId,
      dismissed_by: context.userId,
    }, { onConflict: "clinic_id,visit_id", ignoreDuplicates: true });
    if (error) {
      if (isMissingTable(error)) {
        throw new PushSetupError("يلزم تشغيل ملف supabase/tenant-sql/vetra_checkout_dismissals.sql على قاعدة بيانات العيادة.", 503);
      }
      throw error;
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("RECEPTION INVOICE HIDE ERROR:", error);
    return Response.json({ error: "تعذر إخفاء الفاتورة من قوائم الاستقبال." }, { status: 500 });
  }
}
