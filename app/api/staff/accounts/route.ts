import { randomBytes } from "node:crypto";
import { getCoreAdminClient, PushSetupError, resolveClinicPushContext } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StaffRow = {
  id: string;
  clinic_id: string;
  full_name: string;
  staff_type: "doctor" | "assistant" | "front_desk";
  phone: string | null;
  auth_user_id: string | null;
  login_email: string | null;
};

function makeTemporaryPassword() {
  return `Vt${randomBytes(15).toString("base64url")}9!`;
}

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  return digits;
}

function errorResponse(error: unknown) {
  if (error instanceof PushSetupError) {
    return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error("STAFF ACCOUNT API ERROR:", error);
  return Response.json({ error: "تعذر تحديث حساب الموظف." }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

async function authorize(request: Request) {
  const actor = await resolveClinicPushContext(request);
  if (!["owner", "admin"].includes(actor.role)) throw new PushSetupError("إدارة حسابات الفريق متاحة للمالك أو مدير العيادة فقط.", 403);
  return actor;
}

async function findStaff(db: Awaited<ReturnType<typeof resolveClinicPushContext>>["clinicDb"], clinicId: string, staffId: string) {
  const { data, error } = await db.from("clinic_staff")
    .select("id,clinic_id,full_name,staff_type,phone,auth_user_id,login_email")
    .eq("id", staffId).eq("clinic_id", clinicId).maybeSingle();
  if (error) throw error;
  if (!data) throw new PushSetupError("الموظف غير موجود في هذه العيادة.", 404);
  return data as StaffRow;
}

export async function POST(request: Request) {
  let createdUserId = "";
  let createdDoctorId = "";
  let createdMembershipId = "";
  try {
    const body = await request.json().catch(() => null) as { staffId?: unknown; language?: unknown } | null;
    if (typeof body?.staffId !== "string") throw new PushSetupError("معرف الموظف غير صالح.", 400);
    const actor = await authorize(request);
    const person = await findStaff(actor.clinicDb, actor.clinicId, body.staffId);
    if (!person.phone || normalizePhone(person.phone).length < 8) throw new PushSetupError("أضف رقم واتساب صالحًا للموظف أولًا.", 400);
    if (Boolean(person.auth_user_id) !== Boolean(person.login_email)) {
      throw new PushSetupError("بيانات ربط حساب الموظف غير مكتملة. تواصل مع دعم VETRA.", 409);
    }

    const admin = getCoreAdminClient();
    const temporaryPassword = makeTemporaryPassword();
    const loginEmail = person.login_email || `staff.${person.id}@staff.vetra.top`;
    const existingMembership = person.auth_user_id
      ? await admin.from("clinic_members").select("id,status,must_change_password").eq("clinic_id", actor.clinicId).eq("doctor_id", person.auth_user_id).maybeSingle()
      : { data: null, error: null };
    if (existingMembership.error) throw existingMembership.error;

    if (person.auth_user_id && person.login_email) {
      let membershipId = existingMembership.data?.id;
      if (existingMembership.data) {
        const { error: memberError } = await admin.from("clinic_members").update({ status: "active", must_change_password: true }).eq("id", existingMembership.data.id);
        if (memberError) throw memberError;
      } else {
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
      const { error: passwordError } = await admin.auth.admin.updateUserById(person.auth_user_id, { password: temporaryPassword });
      if (passwordError) {
        if (existingMembership.data) {
          await admin.from("clinic_members").update({ status: existingMembership.data.status, must_change_password: existingMembership.data.must_change_password }).eq("id", existingMembership.data.id);
        } else if (membershipId) {
          await admin.from("clinic_members").delete().eq("id", membershipId);
        }
        throw passwordError;
      }
      await actor.clinicDb.from("clinic_staff").update({ must_change_password: true })
        .eq("id", person.id).eq("clinic_id", actor.clinicId);
    } else {
      const { data: userData, error: userError } = await admin.auth.admin.createUser({
        email: loginEmail,
        email_confirm: true,
        password: temporaryPassword,
        user_metadata: { full_name: person.full_name },
      });
      if (userError || !userData.user) throw userError || new Error("Could not create staff login.");
      createdUserId = userData.user.id;
      createdDoctorId = userData.user.id;

      const { error: doctorError } = await admin.from("doctors").insert({
        id: userData.user.id,
        full_name: person.full_name,
        phone: person.phone,
        status: "active",
      });
      if (doctorError) throw doctorError;

      const { data: member, error: memberError } = await admin.from("clinic_members").insert({
        clinic_id: actor.clinicId,
        doctor_id: userData.user.id,
        role: person.staff_type === "front_desk" ? "reception" : "doctor",
        status: "active",
        must_change_password: true,
      }).select("id").single();
      if (memberError) throw memberError;
      createdMembershipId = member.id;

      const { error: linkError } = await actor.clinicDb.from("clinic_staff").update({
        auth_user_id: userData.user.id,
        login_email: loginEmail,
        must_change_password: true,
      }).eq("id", person.id).eq("clinic_id", actor.clinicId);
      if (linkError) throw linkError;
    }

    const language = body.language === "en" ? "en" : "ar";
    const message = language === "ar"
      ? `أهلًا ${person.full_name}،\nبيانات دخولك إلى VETRA:\nرابط الدخول: ${new URL("/login", request.url).toString()}\nاسم المستخدم: ${loginEmail}\nكلمة المرور المؤقتة: ${temporaryPassword}\n\nسيُطلب منك تغيير كلمة المرور بعد أول تسجيل دخول. لا تشارك هذه البيانات مع أي شخص.`
      : `Hi ${person.full_name},\nYour VETRA sign-in details:\nLogin: ${new URL("/login", request.url).toString()}\nUsername: ${loginEmail}\nTemporary password: ${temporaryPassword}\n\nYou will be asked to change this password after your first sign-in. Do not share these details.`;
    const whatsapp = `https://wa.me/${normalizePhone(person.phone)}?text=${encodeURIComponent(message)}`;
    return Response.json({ loginEmail, temporaryPassword, whatsapp }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (createdMembershipId) await getCoreAdminClient().from("clinic_members").delete().eq("id", createdMembershipId);
    if (createdDoctorId) await getCoreAdminClient().from("doctors").delete().eq("id", createdDoctorId);
    if (createdUserId) await getCoreAdminClient().auth.admin.deleteUser(createdUserId);
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { staffId?: unknown } | null;
    if (typeof body?.staffId !== "string") throw new PushSetupError("معرف الموظف غير صالح.", 400);
    const actor = await authorize(request);
    const person = await findStaff(actor.clinicDb, actor.clinicId, body.staffId);
    if (person.auth_user_id) {
      const { error } = await getCoreAdminClient().from("clinic_members")
        .update({ status: "suspended" })
        .eq("clinic_id", actor.clinicId).eq("doctor_id", person.auth_user_id);
      if (error) throw error;
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
