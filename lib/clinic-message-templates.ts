import type { SupabaseClient } from "@supabase/supabase-js";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";

export type MessageLanguage = "ar" | "en";
export type MessageTemplateKey =
  | "appointment_reminder"
  | "surgery_reminder"
  | "followup_reminder"
  | "prescription_sharing"
  | "vaccination_due"
  | "vaccination_overdue"
  | "invoice_sharing";

export type MessageVariables = Record<string, string | number | null | undefined>;
export type MessageTemplatePair = Record<MessageLanguage, string>;

export const MESSAGE_TEMPLATE_KEYS: MessageTemplateKey[] = [
  "appointment_reminder",
  "surgery_reminder",
  "followup_reminder",
  "prescription_sharing",
  "vaccination_due",
  "vaccination_overdue",
  "invoice_sharing",
];

export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateKey, MessageTemplatePair> = {
  appointment_reminder: {
    en: "Hi {customer_name},\n\nA reminder that {pet_name} has an appointment at {brand_name} on {appointment_date} at {appointment_time}.\n\nWe look forward to seeing you.\n{doctor_name}",
    ar: "أهلًا {customer_name}،\n\nتذكير بموعد {pet_name} في {brand_name} يوم {appointment_date} الساعة {appointment_time}.\n\nنتطلع لرؤيتكم.\n{doctor_name}",
  },
  surgery_reminder: {
    en: "Hi {customer_name},\n\nThis is a reminder of {pet_name}'s surgery appointment at {brand_name} on {appointment_date} at {appointment_time}. Please follow the preparation instructions shared by the clinic.\n\nContact us if you need to reschedule.\n{doctor_name}",
    ar: "أهلًا {customer_name}،\n\nتذكير بموعد جراحة {pet_name} في {brand_name} يوم {appointment_date} الساعة {appointment_time}. يرجى اتباع تعليمات التجهيز التي شاركتها العيادة.\n\nتواصل معنا إذا احتجت لتغيير الموعد.\n{doctor_name}",
  },
  followup_reminder: {
    en: "Hi {customer_name},\n\nIt's time to check in on {pet_name}. Your follow-up is scheduled for {follow_up_date}.\n\n{notes}\n\nWe hope {pet_name} is doing well.\n{brand_name}",
    ar: "أهلًا {customer_name}،\n\nحان موعد متابعة حالة {pet_name}. موعد المتابعة هو {follow_up_date}.\n\n{notes}\n\nنتمنى أن يكون {pet_name} بخير.\n{brand_name}",
  },
  prescription_sharing: {
    en: "Hi {customer_name},\n\nThe prescription for {pet_name} is ready.\n\n{prescription_summary}\n\n{brand_name}",
    ar: "أهلًا {customer_name}،\n\nروشتة {pet_name} جاهزة.\n\n{prescription_summary}\n\n{brand_name}",
  },
  vaccination_due: {
    en: "Hi {customer_name},\n\n{pet_name}'s {vaccine_name} vaccination is due on {due_date}. Contact us to arrange a visit.\n\n{brand_name}",
    ar: "أهلًا {customer_name}،\n\nتطعيم {vaccine_name} الخاص بـ{pet_name} مستحق يوم {due_date}. تواصل معنا لحجز زيارة.\n\n{brand_name}",
  },
  vaccination_overdue: {
    en: "Hi {customer_name},\n\nOur records show that {pet_name}'s {vaccine_name} vaccination is overdue (due {due_date}). Please contact us to arrange a visit.\n\n{brand_name}",
    ar: "أهلًا {customer_name}،\n\nتطعيم {vaccine_name} الخاص بـ{pet_name} متأخر عن موعده ({due_date}). يرجى التواصل معنا لحجز زيارة.\n\n{brand_name}",
  },
  invoice_sharing: {
    en: "Hi {customer_name},\n\nInvoice #{invoice_number} for {pet_name}:\nTotal: {total}\nPaid: {paid}\nBalance due: {balance}\n\n{brand_name}",
    ar: "أهلًا {customer_name}،\n\nفاتورة رقم #{invoice_number} الخاصة بـ{pet_name}:\nالإجمالي: {total}\nالمدفوع: {paid}\nالمتبقي: {balance}\n\n{brand_name}",
  },
};

export const TEMPLATE_LABELS: Record<MessageTemplateKey, Record<MessageLanguage, string>> = {
  appointment_reminder: { en: "Appointment reminder", ar: "تذكير بموعد" },
  surgery_reminder: { en: "Surgery appointment reminder", ar: "تذكير بموعد جراحة" },
  followup_reminder: { en: "Follow-up reminder", ar: "تذكير بالمتابعة" },
  prescription_sharing: { en: "Prescription sharing", ar: "مشاركة الروشتة" },
  vaccination_due: { en: "Vaccination due", ar: "تطعيم مستحق" },
  vaccination_overdue: { en: "Overdue vaccination", ar: "تطعيم متأخر" },
  invoice_sharing: { en: "Invoice sharing", ar: "مشاركة الفاتورة" },
};

export const TEMPLATE_PLACEHOLDERS: Record<MessageTemplateKey, string[]> = {
  appointment_reminder: ["customer_name", "phone_number", "client_id", "pet_name", "appointment_date", "appointment_time", "doctor_name", "brand_name"],
  surgery_reminder: ["customer_name", "phone_number", "client_id", "pet_name", "appointment_date", "appointment_time", "doctor_name", "brand_name"],
  followup_reminder: ["customer_name", "phone_number", "client_id", "pet_name", "follow_up_date", "notes", "brand_name"],
  prescription_sharing: ["customer_name", "phone_number", "client_id", "pet_name", "share_url", "prescription_summary", "brand_name"],
  vaccination_due: ["customer_name", "phone_number", "client_id", "pet_name", "vaccine_name", "due_date", "brand_name"],
  vaccination_overdue: ["customer_name", "phone_number", "client_id", "pet_name", "vaccine_name", "due_date", "brand_name"],
  invoice_sharing: ["customer_name", "phone_number", "client_id", "pet_name", "invoice_number", "total", "paid", "balance", "share_url", "brand_name"],
};

export function renderMessageTemplate(template: string, variables: MessageVariables) {
  return template.replace(/\{([a-z_]+)\}/gi, (match, key: string) => {
    const value = variables[key];
    return value === null || value === undefined ? match : String(value);
  });
}

export function normalizeWhatsAppPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  return digits;
}

export function openWhatsApp(phone: string | null | undefined, message: string) {
  const digits = normalizeWhatsAppPhone(phone || "");
  if (!digits) return false;
  const tab = window.open("about:blank", "_blank");
  if (!tab) return false;
  tab.opener = null;
  tab.location.href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  return true;
}

export async function loadClinicMessageTemplates(
  db: SupabaseClient,
  clinicId: string,
): Promise<Record<MessageTemplateKey, MessageTemplatePair>> {
  const templates = structuredClone(DEFAULT_MESSAGE_TEMPLATES);
  const { data } = await db.from("clinic_message_templates")
    .select("template_key,language,message")
    .eq("clinic_id", clinicId);

  const rows = (data || []) as { template_key: string; language: string; message: string }[];
  for (const row of rows) {
    if (MESSAGE_TEMPLATE_KEYS.includes(row.template_key as MessageTemplateKey) && (row.language === "ar" || row.language === "en")) {
      templates[row.template_key as MessageTemplateKey][row.language] = row.message;
    }
  }
  return templates;
}

export async function openWhatsAppTemplate(
  phone: string | null | undefined,
  key: MessageTemplateKey,
  language: MessageLanguage,
  variables: MessageVariables,
  knownClinicId?: string,
) {
  const digits = normalizeWhatsAppPhone(phone || "");
  if (!digits) return false;

  const tab = window.open("about:blank", "_blank");
  if (!tab) return false;
  tab.opener = null;

  let template = DEFAULT_MESSAGE_TEMPLATES[key][language];
  let clientCode = variables.client_id;
  try {
    const [db, context] = await Promise.all([getClinicDb(), knownClinicId ? null : getClinicContext()]);
    const clinicId = knownClinicId || context?.clinic_id;
    if (!clinicId) throw new Error("No active clinic");
    const [templateResult, clientResult] = await Promise.all([
      db.from("clinic_message_templates")
        .select("message")
        .eq("clinic_id", clinicId)
        .eq("template_key", key)
        .eq("language", language)
        .maybeSingle(),
      clientCode == null
        ? db.from("clients").select("client_code").eq("clinic_id", clinicId).eq("phone", phone).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (typeof templateResult.data?.message === "string") template = templateResult.data.message;
    clientCode ??= clientResult.data?.client_code;
  } catch {
    // Keep the built-in message available before tenant template SQL is installed.
  }

  tab.location.href = `https://wa.me/${digits}?text=${encodeURIComponent(renderMessageTemplate(template, {
    ...variables,
    phone_number: variables.phone_number ?? phone,
    client_id: clientCode,
  }))}`;
  return true;
}
