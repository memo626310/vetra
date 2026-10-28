import { PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const dynamic = "force-dynamic";

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await resolveClinicPushContext(request);
    if (context.role.toLowerCase() !== "reception") throw new PushSetupError("هذه العملية متاحة للاستقبال فقط.", 403);

    const { id } = await params;
    if (!isUuid(id)) throw new PushSetupError("معرّف الفاتورة غير صالح.", 400);
    const body = await request.json().catch(() => null) as {
      clientId?: unknown;
      petId?: unknown;
      discount?: unknown;
      notes?: unknown;
      items?: unknown;
    } | null;
    if (!isUuid(body?.clientId) || !isUuid(body?.petId) || !Array.isArray(body?.items) || body.items.length === 0) {
      throw new PushSetupError("بيانات الفاتورة غير مكتملة.", 400);
    }
    const invoiceDiscount = Number(body.discount || 0);
    if (!Number.isFinite(invoiceDiscount) || invoiceDiscount < 0) throw new PushSetupError("الخصم غير صالح.", 400);

    for (const item of body.items as Array<Record<string, unknown>>) {
      if (item.item_type !== "service" || item.product_id) throw new PushSetupError("فواتير الزيارة تحتوي على خدمات فقط.", 400);
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);
      const discount = Number(item.discount || 0);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(discount) || discount < 0 || discount > quantity * unitPrice) {
        throw new PushSetupError("يوجد بند غير صالح في الفاتورة.", 400);
      }
    }

    const { data, error } = await context.clinicDb.rpc("vetra_update_reception_invoice", {
      p_invoice_id: id,
      p_client_id: body.clientId,
      p_pet_id: body.petId,
      p_discount: invoiceDiscount,
      p_notes: typeof body.notes === "string" ? body.notes : "",
      p_items: body.items,
    });
    if (error) {
      if (/vetra_update_reception_invoice|function .* does not exist|schema cache/i.test(error.message || "")) {
        throw new PushSetupError(
          "يلزم تشغيل ملف supabase/tenant-sql/vetra_reception_invoice_edit.sql على قاعدة بيانات العيادة لتفعيل تعديل فواتير الاستقبال.",
          503,
        );
      }
      throw error;
    }
    return Response.json({ invoice: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("RECEPTION INVOICE UPDATE ERROR:", error);
    return Response.json({ error: error instanceof Error ? error.message : "تعذر تعديل الفاتورة." }, { status: 500 });
  }
}
