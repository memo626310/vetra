import {
  getCoreAdminClient,
  PushSetupError,
  resolveClinicPushContext,
} from "@/lib/push-server";
import { requireClinicPermission } from "@/lib/staff-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205"
    || /relation .* does not exist|table .* not found|could not find the table/i.test(error.message || "");
}

async function deleteClientFromTenant(clinicDb: Awaited<ReturnType<typeof resolveClinicPushContext>>["clinicDb"], clinicId: string, clientId: string) {
  const { data: client, error: clientError } = await clinicDb.from("clients")
    .select("id,name").eq("id", clientId).eq("clinic_id", clinicId).maybeSingle();
  if (clientError) throw clientError;
  if (!client) throw new Error("العميل غير موجود في العيادة الحالية.");

  const { data: pets, error: petsError } = await clinicDb.from("pets")
    .select("id").eq("client_id", clientId);
  if (petsError) throw petsError;
  const petIds = (pets || []).map((row) => row.id).filter((value): value is string => typeof value === "string");

  const { data: visits, error: visitsError } = petIds.length
    ? await clinicDb.from("visits").select("id").in("pet_id", petIds)
    : { data: [], error: null };
  if (visitsError) throw visitsError;
  const visitIds = (visits || []).map((row) => row.id).filter((value): value is string => typeof value === "string");

  const invoiceIds = new Set<string>();
  const { data: clientInvoices, error: clientInvoicesError } = await clinicDb.from("invoices")
    .select("id").eq("client_id", clientId);
  if (clientInvoicesError) throw clientInvoicesError;
  for (const row of clientInvoices || []) invoiceIds.add(row.id);

  if (petIds.length) {
    const { data, error } = await clinicDb.from("invoices").select("id").in("pet_id", petIds);
    if (error) throw error;
    for (const row of data || []) invoiceIds.add(row.id);
  }
  if (visitIds.length) {
    const { data, error } = await clinicDb.from("invoices").select("id").in("visit_id", visitIds);
    if (error) throw error;
    for (const row of data || []) invoiceIds.add(row.id);
  }
  const ids = [...invoiceIds];

  async function remove(query: PromiseLike<{ error: { code?: string; message?: string } | null }>, optional = false) {
    const { error } = await query;
    if (error && !(optional && isMissingTable(error))) throw error;
  }

  if (ids.length) {
    await remove(clinicDb.from("financial_transactions").delete().in("related_invoice_id", ids), true);
    await remove(clinicDb.from("invoice_items").delete().in("invoice_id", ids), true);
    await remove(clinicDb.from("invoices").delete().in("id", ids));
  }
  if (visitIds.length) {
    await remove(clinicDb.from("visit_medications").delete().in("visit_id", visitIds), true);
    await remove(clinicDb.from("vaccinations").delete().in("visit_id", visitIds), true);
  }
  if (petIds.length) {
    await remove(clinicDb.from("vaccinations").delete().in("pet_id", petIds), true);
    await remove(clinicDb.from("appointments").delete().in("pet_id", petIds), true);
  }
  await remove(clinicDb.from("appointments").delete().eq("client_id", clientId), true);
  await remove(clinicDb.from("pet_medical_records").delete().eq("client_id", clientId), true);
  if (visitIds.length) await remove(clinicDb.from("visits").delete().in("id", visitIds));
  if (petIds.length) await remove(clinicDb.from("pets").delete().in("id", petIds));
  await remove(clinicDb.from("clients").delete().eq("id", clientId).eq("clinic_id", clinicId));
  return { clientName: client.name, petIds };
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "معرّف العميل غير صالح." }, { status: 400 });
    }

    const { clinicId, clinicDb } = await requireClinicPermission(request, "patients", "delete");

    const { data, error } = await clinicDb.rpc("vetra_delete_client_cascade", { p_client_id: id });
    let deletion: { clientName?: string; petIds?: unknown } | null = null;
    if (error) {
      const migrationMissing = error.code === "PGRST202" || error.code === "42883";
      if (!migrationMissing) {
        console.error("CLIENT CASCADE DELETE ERROR:", error);
        const detail = error.code === "23503"
          ? "لا يمكن حذف العميل بسبب سجل مرتبط لم يشمله إجراء الحذف. راجع سجل الخادم لمعرفة الجدول المرتبط."
          : error.code === "42501"
            ? "قاعدة بيانات العيادة رفضت صلاحيات الحذف. أعد تشغيل ملف supabase/tenant-sql/vetra_delete_client_cascade.sql على قاعدة العيادة."
            : error.message || "تعذر حذف العميل وبياناته المرتبطة.";
        return Response.json({ error: detail }, { status: 400 });
      }
      deletion = await deleteClientFromTenant(clinicDb, clinicId, id);
    } else {
      deletion = (Array.isArray(data) ? data[0] : data) as { clientName?: string; petIds?: unknown } | null;
    }

    const petIds = Array.isArray(deletion?.petIds)
      ? deletion.petIds.filter((value): value is string => typeof value === "string")
      : [];
    const cleanupErrors: string[] = [];
    try {
      const admin = getCoreAdminClient();
      const [activity, subscriptions, reminders] = await Promise.all([
        admin.from("vetra_client_activity").delete().eq("clinic_id", clinicId).eq("owner_client_id", id),
        admin.from("vetra_push_subscriptions").delete().eq("clinic_id", clinicId).eq("audience", "owner").eq("owner_client_id", id),
        admin.from("vetra_push_reminders").delete().eq("clinic_id", clinicId).eq("owner_client_id", id),
      ]);
      if (activity.error) cleanupErrors.push("activity");
      if (subscriptions.error) cleanupErrors.push("notifications");
      if (reminders.error) cleanupErrors.push("reminders");

      if (petIds.length) {
        const storage = admin.storage.from("pet-photos");
        try {
        for (const petId of petIds) {
          let offset = 0;
          while (true) {
            const { data: files, error: listError } = await storage.list(petId, { limit: 1000, offset });
            if (listError) throw listError;
            const paths = (files || [])
              .filter((file) => file.name && file.id)
              .map((file) => `${petId}/${file.name}`);
            if (paths.length) {
              const { error: removeError } = await storage.remove(paths);
              if (removeError) throw removeError;
            }
            if (!files || files.length < 1000) break;
            offset += files.length;
          }
        }
        } catch (photosError) {
          console.error("CLIENT PET PHOTO CLEANUP ERROR:", photosError);
          cleanupErrors.push("photos");
        }
      }
    } catch (cleanupError) {
      console.error("CLIENT CORE DATA CLEANUP ERROR:", cleanupError);
      cleanupErrors.push("core_data");
    }

    return Response.json({
      success: true,
      clientName: deletion?.clientName || "",
      cleanupPending: cleanupErrors.length > 0,
      cleanupErrors,
    });
  } catch (error) {
    if (error instanceof PushSetupError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("CLIENT CASCADE DELETE ERROR:", error);
    return Response.json({ error: "تعذر إكمال حذف العميل." }, { status: 500 });
  }
}
