import { randomBytes } from "node:crypto";
import { getCoreAdminClient, PushSetupError, resolveClinicPushContext } from "@/lib/push-server";
import { assertClinicStaffPermission, requireClinicStaffPermission } from "@/lib/staff-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRow = {
  id: string;
  clinic_id: string;
  full_name: string;
  staff_type: "doctor" | "assistant" | "front_desk";
  phone: string | null;
  email: string | null;
  auth_user_id: string | null;
  login_email: string | null;
};

function makeTemporaryPassword() {
  return `Vt${randomBytes(15).toString("base64url")}9!`;
}

function normalizeAuthPhone(value: string) {
  const raw = value.trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("0")) return `+20${digits.slice(1)}`;
  if (digits.startsWith("20")) return `+${digits}`;
  return `+20${digits}`;
}

function normalizePhone(value: string) {
  return normalizeAuthPhone(value).replace(/\D/g, "");
}

function errorResponse(error: unknown, stage?: string) {
  if (error instanceof PushSetupError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  const message = error instanceof Error ? error.message : "";
  if (/already registered|already exists|duplicate key|unique constraint/i.test(message)) {
    return Response.json({ error: "البريد الإلكتروني أو رقم الهاتف مستخدم بالفعل في حساب VETRA." }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (/phone.*disabled|phone.*not enabled|phone provider/i.test(message)) {
    return Response.json({ error: "تسجيل الدخول برقم الهاتف غير مفعّل في إعدادات VETRA CORE." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const structuredError = error && typeof error === "object"
    ? error as { name?: unknown; code?: unknown; message?: unknown; details?: unknown; hint?: unknown }
    : null;
  console.error("STAFF ACCOUNT API ERROR:", {
    stage: stage || "غير محددة",
    name: typeof structuredError?.name === "string" ? structuredError.name : (error instanceof Error ? error.name : undefined),
    code: typeof structuredError?.code === "string" ? structuredError.code : undefined,
    message: typeof structuredError?.message === "string" ? structuredError.message : (error instanceof Error ? error.message : String(error)),
    details: typeof structuredError?.details === "string" ? structuredError.details : undefined,
    hint: typeof structuredError?.hint === "string" ? structuredError.hint : undefined,
  });
  const stageSuffix = stage ? ` مرحلة الفشل: ${stage}.` : "";
  return Response.json({ error: `تعذر إنشاء حساب الموظف. راجع سجل الخادم.${stageSuffix}`, stage: stage || null }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

async function authorize(request: Request, action: "create" | "edit" | "delete" = "create") {
  return requireClinicStaffPermission(request, action);
}

async function findStaff(db: Awaited<ReturnType<typeof resolveClinicPushContext>>["clinicDb"], clinicId: string, staffId: string) {
  const { data, error } = await db.from("clinic_staff")
    .select("id,clinic_id,full_name,staff_type,phone,email,auth_user_id,login_email")
    .eq("id", staffId).eq("clinic_id", clinicId).maybeSingle();
  if (error) throw error;
  if (!data) throw new PushSetupError("الموظف غير موجود في هذه العيادة.", 404);
  return data as StaffRow;
}

export async function POST(request: Request) {
  let createdUserId = "";
  let createdMembershipId = "";
  let failureStage = "قراءة بيانات الطلب";
  try {
    const body = await request.json().catch(() => null) as { staffId?: unknown; language?: unknown } | null;
    if (typeof body?.staffId !== "string") throw new PushSetupError("معرف الموظف غير صالح.", 400);
    failureStage = "تحميل سياق العيادة";
    const actor = await resolveClinicPushContext(request);
    failureStage = "تحميل بيانات الموظف من قاعدة العيادة";
    const person = await findStaff(actor.clinicDb, actor.clinicId, body.staffId);
    failureStage = "التحقق من صلاحية إنشاء/تعديل حساب الموظف";
    await assertClinicStaffPermission(actor, person.auth_user_id ? "edit" : "create");
    const email = (person.email || "").trim().toLowerCase();
    const authPhone = person.phone ? normalizeAuthPhone(person.phone) : "";
    if (!email && !authPhone) {
      throw new PushSetupError("أضف بريدًا إلكترونيًا أو رقم هاتف للموظف لاستخدامه في تسجيل الدخول.", 400);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new PushSetupError("البريد الإلكتروني للموظف غير صالح.", 400);
    }
    if (authPhone && (normalizePhone(authPhone).length < 8 || normalizePhone(authPhone).length > 15)) {
      throw new PushSetupError("رقم هاتف الموظف غير صالح.", 400);
    }

    failureStage = "تهيئة اتصال VETRA CORE الإداري";
    const admin = getCoreAdminClient();
    const temporaryPassword = makeTemporaryPassword();
    // Keep an internal email for Core records when staff sign in by phone only.
    // The staff member is shown only the real email/phone they supplied.
    const authEmail = email || person.login_email || `staff.${person.id}@staff.vetra.top`;
    const loginIdentifiers = [email, authPhone].filter(Boolean);
    failureStage = "التحقق من عضوية الموظف في VETRA CORE";
    const existingMembership = person.auth_user_id
      ? await admin.from("clinic_members").select("id,status,must_change_password").eq("clinic_id", actor.clinicId).eq("doctor_id", person.auth_user_id).maybeSingle()
      : { data: null, error: null };
    if (existingMembership.error) throw existingMembership.error;

    if (person.auth_user_id) {
      let membershipId = existingMembership.data?.id;
      if (existingMembership.data) {
        const { error: memberError } = await admin.from("clinic_members")
          .update({ status: "active", must_change_password: true })
          .eq("id", existingMembership.data.id);
        if (memberError) throw memberError;
      } else {
        failureStage = "إنشاء عضوية الموظف في VETRA CORE";
        const { data: insertedMember, error: memberError } = await admin.from("clinic_members").insert({
          clinic_id: actor.clinicId,
          doctor_id: person.auth_user_id,
          role: person.staff_type === "front_desk" ? "reception" : "doctor",
          status: "active",
          must_change_password: true,
        }).select("id").single();
        if (memberError) throw memberError;
        membershipId = insertedMember.id;
      }

      const authUpdate: {
        password: string;
        user_metadata: Record<string, string>;
        email?: string;
        email_confirm?: boolean;
        phone?: string;
        phone_confirm?: boolean;
      } = {
        password: temporaryPassword,
        user_metadata: { full_name: person.full_name, staff_id: person.id, clinic_id: actor.clinicId },
      };
      if (email) {
        authUpdate.email = email;
        authUpdate.email_confirm = true;
      }
      if (authPhone) {
        authUpdate.phone = authPhone;
        authUpdate.phone_confirm = true;
      }

      failureStage = "تحديث بيانات المستخدم في VETRA CORE Auth";
      const { error: passwordError } = await admin.auth.admin.updateUserById(person.auth_user_id, authUpdate);
      if (passwordError) {
        if (existingMembership.data) {
          await admin.from("clinic_members").update({
            status: existingMembership.data.status,
            must_change_password: existingMembership.data.must_change_password,
          }).eq("id", existingMembership.data.id);
        } else if (membershipId) {
          await admin.from("clinic_members").delete().eq("id", membershipId);
        }
        throw passwordError;
      }

      failureStage = "ربط الحساب الموجود بقاعدة بيانات العيادة";
      // The staff row is already linked to this exact Core user (person.auth_user_id).
      // Re-issuing credentials should not call the tenant RPC that is required only
      // when linking a newly created user. The Core clinic_members row above is the
      // source of truth for must_change_password and is already set to true.
      console.info("STAFF ACCOUNT: retained existing clinic link", {
        staffId: person.id,
        authUserId: person.auth_user_id,
      });
    } else {
      failureStage = "إنشاء مستخدم جديد في VETRA CORE Auth";
      const { data: userData, error: userError } = await admin.auth.admin.createUser({
        email: authEmail,
        email_confirm: true,
        ...(authPhone ? { phone: authPhone, phone_confirm: true } : {}),
        password: temporaryPassword,
        user_metadata: { full_name: person.full_name, staff_id: person.id, clinic_id: actor.clinicId },
      });
      if (userError || !userData.user) throw userError || new Error("Could not create staff login.");
      createdUserId = userData.user.id;

      failureStage = "حفظ ملف الطبيب في VETRA CORE";
      const { error: doctorError } = await admin.from("doctors").upsert({
        id: userData.user.id,
        full_name: person.full_name,
        phone: person.phone,
        status: "active",
      }, { onConflict: "id", ignoreDuplicates: true });
      if (doctorError) throw doctorError;

      failureStage = "إضافة عضوية العيادة في VETRA CORE";
      const { data: member, error: memberError } = await admin.from("clinic_members").insert({
        clinic_id: actor.clinicId,
        doctor_id: userData.user.id,
        role: person.staff_type === "front_desk" ? "reception" : "doctor",
        status: "active",
        must_change_password: true,
      }).select("id").single();
      if (memberError) throw memberError;
      createdMembershipId = member.id;

      failureStage = "ربط الحساب الجديد بقاعدة بيانات العيادة";
      const { error: linkError } = await actor.clinicDb.rpc("vetra_link_clinic_staff_account", {
        p_staff_id: person.id,
        p_auth_user_id: userData.user.id,
        p_login_email: authEmail,
        p_must_change_password: true,
      });
      if (linkError) throw linkError;
    }

    const language = body.language === "en" ? "en" : "ar";
    const identifierLines = email && authPhone
      ? (language === "ar" ? `الإيميل: ${email}\nرقم الهاتف: ${authPhone}` : `Email: ${email}\nPhone: ${authPhone}`)
      : (language === "ar" ? `اسم المستخدم: ${email || authPhone}` : `Username: ${email || authPhone}`);
    const message = language === "ar"
      ? `أهلًا ${person.full_name}،\nبيانات دخولك إلى VETRA:\nرابط الدخول: ${new URL("/login", request.url).toString()}\n${identifierLines}\nكلمة المرور المؤقتة: ${temporaryPassword}\n\nسيُطلب منك تغيير كلمة المرور بعد أول تسجيل دخول. لا تشارك هذه البيانات مع أي شخص.`
      : `Hi ${person.full_name},\nYour VETRA sign-in details:\nLogin: ${new URL("/login", request.url).toString()}\n${identifierLines}\nTemporary password: ${temporaryPassword}\n\nYou will be asked to change this password after your first sign-in. Do not share these details.`;
    const whatsapp = authPhone
      ? `https://wa.me/${normalizePhone(authPhone)}?text=${encodeURIComponent(message)}`
      : null;
    return Response.json({
      loginIdentifiers,
      linkedEmail: authEmail,
      authUserId: person.auth_user_id || createdUserId,
      temporaryPassword,
      whatsapp,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    try {
      const admin = getCoreAdminClient();
      if (createdMembershipId) await admin.from("clinic_members").delete().eq("id", createdMembershipId);
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    } catch (rollbackError) {
      console.error("STAFF ACCOUNT ROLLBACK ERROR:", rollbackError);
    }
    return errorResponse(error, failureStage);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { staffId?: unknown } | null;
    if (typeof body?.staffId !== "string") throw new PushSetupError("معرف الموظف غير صالح.", 400);
    const actor = await authorize(request, "delete");
    const person = await findStaff(actor.clinicDb, actor.clinicId, body.staffId);
    if (person.auth_user_id) {
      const { error } = await getCoreAdminClient().from("clinic_members")
        .update({ status: "suspended" })
        .eq("clinic_id", actor.clinicId).eq("doctor_id", person.auth_user_id);
      if (error) throw error;
    }
    const { error: directoryDeleteError } = await actor.clinicDb.from("clinic_staff").delete().eq("id", person.id).eq("clinic_id", actor.clinicId);
    if (directoryDeleteError) throw directoryDeleteError;
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
