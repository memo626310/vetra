"use client";

type Lang = "ar" | "en";
type PetInfo = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string | null;
  birth_date: string | null;
  color: string | null;
  is_deceased: boolean | null;
};
type VisitInfo = {
  id: string;
  visit_date: string;
  reason: string | null;
  examination: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
};
type VaccineInfo = {
  id: string;
  vaccine_name: string | null;
  vaccine_type: string | null;
  administered_at: string | null;
  next_dose_at: string | null;
  notes: string | null;
};
type Props = {
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  pet: PetInfo;
  petCount: number;
  visits: VisitInfo[];
  vaccines: VaccineInfo[];
  lang: Lang;
  dark: boolean;
};

const DAY_MS = 86_400_000;
const label = (lang: Lang, ar: string, en: string) => lang === "ar" ? ar : en;

function dayStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function daysUntil(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((dayStart(d) - dayStart(new Date())) / DAY_MS);
}

function formatDate(value: string | null, lang: Lang) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function ClientCareHub({
  clientId,
  clientName,
  clientPhone,
  clientEmail,
  pet,
  petCount,
  visits,
  vaccines,
  lang,
  dark,
}: Props) {
  const latestVisit = visits[0] || null;
  const vaccineSchedules = vaccines
    .filter((v) => Boolean(v.next_dose_at))
    .map((v) => ({ ...v, days: daysUntil(v.next_dose_at as string) }))
    .filter((v) => v.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number));
  const allUniqueSchedules = vaccineSchedules.filter((v, index, all) => {
    const key = (v.vaccine_name || v.vaccine_type || v.id).trim().toLowerCase();
    return all.findIndex((item) => (item.vaccine_name || item.vaccine_type || item.id).trim().toLowerCase() === key) === index;
  });
  const uniqueSchedules = allUniqueSchedules.slice(0, 4);
  const overdueCount = allUniqueSchedules.filter((v) => (v.days as number) < 0).length;
  const dueSoonCount = allUniqueSchedules.filter((v) => (v.days as number) >= 0 && (v.days as number) <= 30).length;
  const surface = dark
    ? "border border-white/[.07] bg-white/[.035] text-white"
    : "border border-slate-200 bg-white text-slate-900 shadow-sm";
  const inner = dark
    ? "border border-white/[.06] bg-white/[.025]"
    : "border border-slate-200 bg-slate-50";
  const mutedText = dark ? "text-slate-400" : "text-slate-600";
  const accentText = dark ? "text-cyan-300" : "text-cyan-800";

  function printPassport() {
    const popup = window.open("", "_blank", "width=900,height=720");
    if (!popup) {
      window.alert(label(lang, "اسمح بفتح نافذة الطباعة من المتصفح ثم حاول مرة أخرى.", "Allow pop-ups for printing, then try again."));
      return;
    }

    const visitsHtml = visits.slice(0, 8).map((v) => `
      <article class="record">
        <div class="record-head"><strong>${escapeHtml(v.reason || (lang === "ar" ? "زيارة" : "Visit"))}</strong><span>${escapeHtml(formatDate(v.visit_date, lang))}</span></div>
        ${v.diagnosis ? `<p><b>${escapeHtml(label(lang, "التشخيص", "Diagnosis"))}:</b> ${escapeHtml(v.diagnosis)}</p>` : ""}
        ${v.examination ? `<p><b>${escapeHtml(label(lang, "الفحص", "Examination"))}:</b> ${escapeHtml(v.examination)}</p>` : ""}
        ${v.treatment ? `<p><b>${escapeHtml(label(lang, "العلاج", "Treatment"))}:</b><br>${escapeHtml(v.treatment).replace(/\n/g, "<br>")}</p>` : ""}
        ${v.notes ? `<p><b>${escapeHtml(label(lang, "ملاحظات", "Notes"))}:</b> ${escapeHtml(v.notes)}</p>` : ""}
      </article>`).join("");
    const vaccinesHtml = vaccines.slice(0, 12).map((v) => `
      <tr><td>${escapeHtml(v.vaccine_name || v.vaccine_type || "—")}</td><td>${escapeHtml(formatDate(v.administered_at, lang))}</td><td>${escapeHtml(formatDate(v.next_dose_at, lang))}</td></tr>`).join("");
    const title = label(lang, "الملف الصحي للحيوان", "Pet Health Passport");
    const direction = lang === "ar" ? "rtl" : "ltr";

    popup.document.open();
    popup.document.write(`<!doctype html><html lang="${lang}" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - ${escapeHtml(pet.name)}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#17212b;margin:0;padding:28px;background:#fff;font-size:13px;line-height:1.55}.head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #16a6b4;padding-bottom:16px;margin-bottom:18px}.brand{font-weight:800;letter-spacing:3px;color:#0f7888;font-size:18px}.muted{color:#64748b}.profile{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0 22px}.field,.record{border:1px solid #dce5eb;border-radius:10px;padding:10px;break-inside:avoid}.field small{display:block;color:#64748b;margin-bottom:3px}.section-title{margin:20px 0 8px;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:5px}.record{margin-bottom:8px}.record-head{display:flex;justify-content:space-between;gap:10px}.record p{margin:6px 0}.vaccines{width:100%;border-collapse:collapse}.vaccines th,.vaccines td{border:1px solid #dce5eb;text-align:start;padding:8px}.vaccines th{background:#f1f7f9}.footer{margin-top:24px;padding-top:10px;border-top:1px solid #dce5eb;color:#64748b;font-size:11px}@media print{body{padding:0}.record,.field{break-inside:avoid}button{display:none}}
    </style></head><body>
      <header class="head"><div><div class="brand">VETRA</div><h1>${escapeHtml(title)}</h1><div class="muted">${escapeHtml(label(lang, "تاريخ الطباعة", "Printed"))}: ${escapeHtml(formatDate(new Date().toISOString(), lang))}</div></div><div><strong>${escapeHtml(clientName)}</strong><div class="muted">${escapeHtml(clientPhone || "")}</div><div class="muted">${escapeHtml(clientEmail || "")}</div></div></header>
      <h2>${escapeHtml(pet.name)}</h2><div class="profile">
        <div class="field"><small>${escapeHtml(label(lang, "النوع", "Species"))}</small>${escapeHtml(pet.species)}</div>
        <div class="field"><small>${escapeHtml(label(lang, "السلالة", "Breed"))}</small>${escapeHtml(pet.breed || "—")}</div>
        <div class="field"><small>${escapeHtml(label(lang, "تاريخ الميلاد", "Birth date"))}</small>${escapeHtml(formatDate(pet.birth_date, lang))}</div>
        <div class="field"><small>${escapeHtml(label(lang, "اللون", "Color"))}</small>${escapeHtml(pet.color || "—")}</div>
        <div class="field"><small>${escapeHtml(label(lang, "المالك", "Owner"))}</small>${escapeHtml(clientName)}</div>
        <div class="field"><small>${escapeHtml(label(lang, "عدد الحيوانات في الحساب", "Pets on account"))}</small>${escapeHtml(petCount)}</div>
      </div>
      <h2 class="section-title">${escapeHtml(label(lang, "التاريخ الطبي الأخير", "Recent medical history"))}</h2>
      ${visitsHtml || `<p class="muted">${escapeHtml(label(lang, "لا توجد زيارات مسجلة.", "No visits recorded."))}</p>`}
      <h2 class="section-title">${escapeHtml(label(lang, "سجل التطعيمات", "Vaccination history"))}</h2>
      <table class="vaccines"><thead><tr><th>${escapeHtml(label(lang, "التطعيم", "Vaccine"))}</th><th>${escapeHtml(label(lang, "تاريخ الإعطاء", "Administered"))}</th><th>${escapeHtml(label(lang, "الاستحقاق القادم", "Next due"))}</th></tr></thead><tbody>${vaccinesHtml || `<tr><td colspan="3">${escapeHtml(label(lang, "لا توجد تطعيمات مسجلة.", "No vaccinations recorded."))}</td></tr>`}</tbody></table>
      <p class="footer">${escapeHtml(label(lang, "هذا الملخص يعرض البيانات المسجلة في VETRA ولا يستبدل السجل الطبي الأصلي أو توصية الطبيب.", "This summary reflects information recorded in VETRA and does not replace the original medical record or veterinary advice."))}</p>
      </body></html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }

  return (
    <section className={`mt-5 rounded-[2rem] p-5 sm:p-6 ${surface}`} aria-labelledby="client-care-hub-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`text-xs font-bold uppercase tracking-[.12em] ${accentText}`}>{label(lang, "مركز رعاية الحيوان", "PET CARE CENTER")}</p>
          <h2 id="client-care-hub-title" className="mt-1 text-2xl font-black">{label(lang, `كل ما يخص ${pet.name}`, `Everything about ${pet.name}`)}</h2>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedText}`}>{label(lang, "ملخص سريع للرعاية، المواعيد، والتاريخ الطبي. البيانات هنا مبنية على ما تم تسجيله في العيادة.", "A quick view of care, due dates, and medical history based on information recorded by the clinic.")}</p>
        </div>
        <button type="button" onClick={printPassport} className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${dark ? "border-white/10 bg-white/[.04] hover:bg-white/[.08]" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <span aria-hidden="true">📄</span>{label(lang, "طباعة الملف الصحي", "Print health passport")}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" onClick={() => openSection("daily-medication-todo")} className={`rounded-2xl border p-4 text-start transition hover:-translate-y-0.5 ${inner}`}>
          <div className="text-2xl">💊</div><div className="mt-2 font-black">{label(lang, "أدوية اليوم", "Today's medications")}</div><p className={`mt-1 text-xs leading-5 ${mutedText}`}>{label(lang, "تابع الجرعات وسجّل ما تم إعطاؤه", "Review doses and mark completed check-ins")}</p><span className={`mt-3 inline-block text-xs font-bold ${accentText}`}>{label(lang, "فتح المتابعة ←", "Open tracker →")}</span>
        </button>
        <button type="button" onClick={() => openSection("vaccination-history")} className={`rounded-2xl border p-4 text-start transition hover:-translate-y-0.5 ${inner}`}>
          <div className="text-2xl">💉</div><div className="mt-2 font-black">{label(lang, "مركز التطعيمات", "Vaccination center")}</div><p className={`mt-1 text-xs leading-5 ${mutedText}`}>{label(lang, "اعرف الجرعات المسجلة ومواعيدها", "View recorded vaccines and their due dates")}</p><span className={`mt-3 inline-block text-xs font-bold ${accentText}`}>{label(lang, "عرض السجل ←", "View history →")}</span>
        </button>
        <button type="button" onClick={() => openSection("health-trends")} className={`rounded-2xl border p-4 text-start transition hover:-translate-y-0.5 ${inner}`}>
          <div className="text-2xl">📈</div><div className="mt-2 font-black">{label(lang, "رحلة الصحة", "Health journey")}</div><p className={`mt-1 text-xs leading-5 ${mutedText}`}>{label(lang, "تابع القياسات والرسوم عبر الزيارات", "Review measurements and trends across visits")}</p><span className={`mt-3 inline-block text-xs font-bold ${accentText}`}>{label(lang, "عرض المؤشرات ←", "View trends →")}</span>
        </button>
        <a href={`/client-interface/${encodeURIComponent(clientId)}/appointments`} className={`block rounded-2xl border p-4 text-start transition hover:-translate-y-0.5 ${inner}`}>
          <div className="text-2xl">🗓️</div><div className="mt-2 font-black">{label(lang, "حجز ومتابعة", "Booking & follow-up")}</div><p className={`mt-1 text-xs leading-5 ${mutedText}`}>{label(lang, "اطلب موعد متابعة من العيادة", "Request a follow-up through the clinic")}</p><span className={`mt-3 inline-block text-xs font-bold ${accentText}`}>{label(lang, "فتح المواعيد ←", "Open appointments →")}</span>
        </a>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className={`rounded-2xl border p-4 ${inner}`}><p className={`text-xs font-semibold ${mutedText}`}>{label(lang, "آخر زيارة", "Last visit")}</p><p className="mt-2 text-lg font-black">{formatDate(latestVisit?.visit_date || null, lang)}</p><p className={`mt-1 truncate text-xs ${mutedText}`}>{latestVisit?.reason || label(lang, "لا توجد زيارة مسجلة", "No visit recorded")}</p></div>
        <div className={`rounded-2xl border p-4 ${inner}`}><p className={`text-xs font-semibold ${mutedText}`}>{label(lang, "التطعيمات المتأخرة", "Overdue vaccinations")}</p><p className={`mt-2 text-lg font-black ${overdueCount ? (dark ? "text-rose-300" : "text-rose-800") : (dark ? "text-emerald-300" : "text-emerald-800")}`}>{overdueCount}</p><p className={`mt-1 text-xs ${mutedText}`}>{label(lang, "حسب المواعيد المسجلة فقط", "Based on recorded due dates only")}</p></div>
        <div className={`rounded-2xl border p-4 ${inner}`}><p className={`text-xs font-semibold ${mutedText}`}>{label(lang, "ملف العائلة", "Pet family")}</p><p className="mt-2 text-lg font-black">{petCount} {label(lang, "حيوان", "pet(s)")}</p><p className={`mt-1 text-xs ${mutedText}`}>{label(lang, "الحيوانات محفوظة بشكل مستقل", "Each pet keeps a separate record")}</p></div>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h3 className="text-base font-black">{label(lang, "مواعيد التطعيم القادمة", "Vaccination due dates")}</h3><p className={`mt-1 text-xs ${mutedText}`}>{label(lang, "العدادات مبنية على تاريخ الاستحقاق المسجل، وليست إثباتًا لإعطاء الجرعة.", "Countdowns use recorded due dates and do not confirm that a dose was administered.")}</p></div>
          {dueSoonCount > 0 && <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${dark ? "bg-amber-400/10 text-amber-300" : "bg-amber-100 text-amber-900"}`}>{dueSoonCount} {label(lang, "خلال 30 يومًا", "due within 30 days")}</span>}
        </div>
        {uniqueSchedules.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {uniqueSchedules.map((v) => {
              const days = v.days as number;
              const status = days < 0
                ? label(lang, "متأخر", "Overdue")
                : days === 0
                  ? label(lang, "مستحق اليوم", "Due today")
                  : days <= 30
                    ? label(lang, "قريبًا", "Due soon")
                    : label(lang, "مجدول", "Scheduled");
              const accent = days < 0 ? (dark ? "text-rose-300" : "text-rose-800") : days <= 30 ? (dark ? "text-amber-300" : "text-amber-800") : (dark ? "text-emerald-300" : "text-emerald-800");
              return (
                <article key={v.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${inner}`}>
                  <div className={`flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center rounded-full border-4 ${days < 0 ? "border-rose-400/50" : days <= 30 ? "border-amber-400/50" : "border-emerald-400/40"}`}>
                    <strong className={`text-lg leading-none ${accent}`}>{days < 0 ? Math.abs(days) : days}</strong>
                    <span className={`mt-1 text-[9px] ${mutedText}`}>{days < 0 ? label(lang, "يوم تأخير", "days late") : label(lang, "يوم", "days")}</span>
                  </div>
                  <div className="min-w-0"><h4 className="truncate text-sm font-black">{v.vaccine_name || v.vaccine_type || label(lang, "تطعيم", "Vaccination")}</h4><p className={`mt-1 text-xs font-bold ${accent}`}>{status}</p><p className={`mt-1 text-[11px] ${mutedText}`}>{formatDate(v.next_dose_at, lang)}</p></div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={`mt-3 rounded-2xl border border-dashed p-4 text-sm ${mutedText} ${inner}`}>{label(lang, "لا توجد مواعيد تطعيم قادمة مسجلة لهذا الحيوان.", "No upcoming vaccination due dates are recorded for this pet.")}</div>
        )}
      </div>

      <div className={`mt-4 flex items-start gap-3 rounded-2xl border p-3 ${overdueCount > 0 ? "border-rose-400/20 bg-rose-400/[.05]" : "border-cyan-400/15 bg-cyan-400/[.04]"}`}>
        <span className="text-xl" aria-hidden="true">{overdueCount > 0 ? "⚠️" : "🔔"}</span>
        <div><p className="text-sm font-black">{label(lang, "مركز التنبيهات", "Care alerts")}</p><p className={`mt-1 text-xs leading-5 ${mutedText}`}>{overdueCount > 0
          ? label(lang, `يوجد ${overdueCount} موعد تطعيم متأخر حسب السجل. راجع الطبيب لتأكيد الخطوة المناسبة.`, `${overdueCount} vaccination due date(s) are overdue in the record. Contact the clinic to confirm next steps.`)
          : dueSoonCount > 0
            ? label(lang, `يوجد ${dueSoonCount} موعد تطعيم خلال 30 يومًا.`, `${dueSoonCount} vaccination(s) are due within 30 days.`)
            : label(lang, "لا توجد مواعيد تطعيم مسجلة متأخرة أو خلال 30 يومًا. تظل متابعة العلاج اليومية متاحة بالأسفل.", "No recorded vaccine dates are overdue or due within 30 days. Daily medication tracking remains available below.")}</p><button type="button" onClick={() => openSection("daily-medication-todo")} className={`mt-2 text-xs font-bold ${accentText}`}>{label(lang, "افتح قائمة أدوية اليوم ←", "Open today's medication checklist →")}</button></div>
      </div>
    </section>
  );
}
