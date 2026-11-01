import { getCoreAdminClient, PushSetupError } from "@/lib/push-server";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export const dynamic = "force-dynamic";

async function countRows(admin: ReturnType<typeof getCoreAdminClient>, table: string) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

export async function GET(request: Request) {
  try {
    const { admin, userId, role } = await requirePlatformAdmin(request);
    const [doctors, clinics, members, databases, subscriptions, activeSubscriptions, pendingAdoptions, pendingBreeding, pushSubscriptions] = await Promise.all([
      countRows(admin, "doctors"),
      countRows(admin, "clinics"),
      countRows(admin, "clinic_members"),
      countRows(admin, "clinic_databases"),
      countRows(admin, "subscriptions"),
      admin.from("subscriptions").select("id", { count: "exact", head: true }).in("status", ["trial", "active", "past_due"]),
      admin.from("vetra_adoption_listings").select("id", { count: "exact", head: true }).eq("status", "pending").eq("is_demo", false),
      admin.from("vetra_breeding_listings").select("id", { count: "exact", head: true }).eq("status", "pending").eq("is_demo", false),
      countRows(admin, "vetra_push_subscriptions"),
    ]);

    const [{ data: clinicsData, error: clinicsError }, { data: plansData }] = await Promise.all([
      admin.from("clinics").select("id,name,city,country,status,clinic_number,owner_doctor_id,created_at,updated_at").order("created_at", { ascending: false }).limit(100),
      admin.from("subscription_plans").select("id,code,name,monthly_price,yearly_price,is_active").order("created_at", { ascending: true }),
    ]);
    if (clinicsError) throw clinicsError;

    const clinicIds = (clinicsData || []).map((clinic) => clinic.id);
    const ownerIds = [...new Set((clinicsData || []).map((clinic) => clinic.owner_doctor_id).filter(Boolean))];
    const activityResult = await admin.from("vetra_platform_activity").select("id,user_id,clinic_id,route,page_label,event_type,created_at").in("clinic_id", clinicIds).order("created_at", { ascending: false }).limit(150);
    const [doctorsResult, databaseResult, subscriptionsResult] = await Promise.all([
      ownerIds.length ? admin.from("doctors").select("id,full_name,phone,status,created_at").in("id", ownerIds) : Promise.resolve({ data: [], error: null }),
      clinicIds.length ? admin.from("clinic_databases").select("clinic_id,provider,region,status,project_ref,updated_at").in("clinic_id", clinicIds) : Promise.resolve({ data: [], error: null }),
      clinicIds.length ? admin.from("subscriptions").select("clinic_id,plan_id,status,trial_ends_at,ends_at,updated_at").in("clinic_id", clinicIds).order("updated_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);

    const doctorsById = new Map((doctorsResult.data || []).map((doctor) => [doctor.id, doctor]));
    const databaseByClinic = new Map((databaseResult.data || []).map((database) => [database.clinic_id, database]));
    const planById = new Map((plansData || []).map((plan) => [plan.id, plan]));
    const subscriptionByClinic = new Map<string, Record<string, unknown>>();
    for (const subscription of subscriptionsResult.data || []) {
      if (!subscriptionByClinic.has(subscription.clinic_id)) subscriptionByClinic.set(subscription.clinic_id, { ...subscription, plan: planById.get(subscription.plan_id) || null });
    }

    const clinicRows = (clinicsData || []).map((clinic) => ({
      ...clinic,
      owner: doctorsById.get(clinic.owner_doctor_id) || null,
      database: databaseByClinic.get(clinic.id) || null,
      subscription: subscriptionByClinic.get(clinic.id) || null,
    }));

    const [allDoctorsResult, allMembershipsResult] = await Promise.all([
      admin.from("doctors").select("id,full_name,phone,status,created_at").order("created_at", { ascending: false }).limit(500),
      clinicIds.length ? admin.from("clinic_members").select("id,clinic_id,doctor_id,role,status,created_at").in("clinic_id", clinicIds).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    ]);
    const doctorsByClinic = new Map<string, Array<Record<string, unknown>>>();
    for (const member of allMembershipsResult.data || []) {
      const doctor = (allDoctorsResult.data || []).find((row) => row.id === member.doctor_id);
      if (!doctor) continue;
      const rows = doctorsByClinic.get(member.clinic_id) || [];
      rows.push({ ...doctor, role: member.role, membership_status: member.status, membership_id: member.id });
      doctorsByClinic.set(member.clinic_id, rows);
    }
    for (const clinic of clinicRows) Object.assign(clinic, { doctors: doctorsByClinic.get(clinic.id) || [] });

    return Response.json({
      generatedAt: new Date().toISOString(),
      viewer: { userId, role },
      stats: {
        doctors,
        clinics,
        members,
        databases,
        subscriptions,
        activeSubscriptions: activeSubscriptions.count ?? 0,
        pendingAdoptions: pendingAdoptions.count ?? 0,
        pendingBreeding: pendingBreeding.count ?? 0,
        pushSubscriptions,
        readyDatabases: (databaseResult.data || []).filter((item) => item.status === "ready").length,
      },
      plans: plansData || [],
      clinics: clinicRows,
      doctors: allDoctorsResult.data || [],
      activity: activityResult.data || [],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PushSetupError) return Response.json({ error: error.message }, { status: error.status });
    console.error("CORE ADMIN DASHBOARD ERROR:", error);
    return Response.json({ error: "تعذر تحميل لوحة التحكم المركزية." }, { status: 500 });
  }
}
