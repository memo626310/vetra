"use client";

import { useEffect, useMemo, useState } from "react";

type Language = "ar" | "en";

type Protocol = {
  species: string[];
  routes: string[];
  dose_text: string;
  dose_measurements: {
    value_min: number;
    value_max: number;
    unit: string;
    basis: string | null;
    expression: string;
  }[];
};

type Drug = {
  id: number;
  name: string;
  trade_names: string;
  aliases: string[];
  active_ingredient: string;
  status: string;
  species: string[];
  routes: string[];
  formulations: string;
  action: string;
  uses: string;
  contraindications: string;
  adverse_reactions: string;
  drug_interactions: string;
  dose_text: string;
  protocols: Protocol[];
  source_page: number;
};

type Formulary = {
  source: {
    title: string;
    edition: string;
    part: string;
    editor: string;
    copyright_year: number;
    book_pages: number;
    monograph_pages: string;
  };
  stats: {
    monographs: number;
    protocol_entries: number;
    routes: string[];
    route_counts: Record<string, number>;
  };
  drugs: Drug[];
};

const text = {
  ar: {
    title: "BSAVA Formulary",
    subtitle: "المكتبة البيطرية المستخرجة من BSAVA Small Animal Formulary — Part A",
    loading: "جاري تحميل الفورماري...",
    search: "ابحث باسم الدواء، المادة الفعالة، الاسم التجاري، المرض، الجرعة، أو route...",
    all: "الكل",
    dogs: "كلاب",
    cats: "قطط",
    species: "الحيوان",
    route: "Route",
    allRoutes: "كل الـ Routes",
    results: "نتيجة",
    monographs: "دواء",
    protocols: "Protocol",
    clear: "مسح",
    details: "التفاصيل",
    dose: "الجرعات",
    indications: "الاستخدامات",
    contraindications: "موانع الاستخدام",
    adverse: "الآثار الجانبية",
    interactions: "التداخلات الدوائية",
    formulations: "التركيبات",
    action: "Action",
    aliases: "الأسماء الأخرى",
    source: "المصدر",
    close: "إغلاق",
    sourcePage: "صفحة المصدر",
    noResults: "مفيش نتائج مطابقة.",
    smart: "Smart Search",
    smartHint: "اكتب مثلًا: cat iv amoxicillin أو كلاب فموي marbofloxacin",
    warning: "بيانات الجرعات مستخرجة من المصدر كما هي، وتحتاج مراجعة الطبيب البيطري والتأكد من أحدث Product Information والقوانين المحلية قبل الوصف.",
    both: "كلاب + قطط",
    inactive: "معلومة مرجعية",
  },
  en: {
    title: "BSAVA Formulary",
    subtitle: "Structured veterinary formulary extracted from BSAVA Small Animal Formulary — Part A",
    loading: "Loading formulary...",
    search: "Search by drug, active ingredient, trade name, indication, dose, or route...",
    all: "All",
    dogs: "Dogs",
    cats: "Cats",
    species: "Species",
    route: "Route",
    allRoutes: "All routes",
    results: "results",
    monographs: "monographs",
    protocols: "protocols",
    clear: "Clear",
    details: "Details",
    dose: "Doses",
    indications: "Uses",
    contraindications: "Contraindications",
    adverse: "Adverse reactions",
    interactions: "Drug interactions",
    formulations: "Formulations",
    action: "Action",
    aliases: "Other names",
    source: "Source",
    close: "Close",
    sourcePage: "Source page",
    noResults: "No matching results.",
    smart: "Smart Search",
    smartHint: "Examples: cat iv amoxicillin or dogs oral marbofloxacin",
    warning: "Dose data is source-derived and should be clinically verified against current product information and local regulations before prescribing.",
    both: "Dogs + Cats",
    inactive: "Reference",
  },
};

const routeLabels: Record<string, [string, string]> = {
  IV: ["IV", "وريدي"],
  IM: ["IM", "عضلي"],
  SC: ["SC", "تحت الجلد"],
  PO: ["PO", "فموي"],
  INTRATRACHEAL: ["Intratracheal", "داخل القصبة"],
  INTRANASAL: ["Intranasal", "داخل الأنف"],
  RECTAL: ["Rectal", "شرجي"],
  OPHTHALMIC: ["Ophthalmic", "عين"],
  OTIC: ["Otic", "أذن"],
  TOPICAL: ["Topical", "موضعي"],
  INHALED: ["Inhaled", "استنشاق"],
  INTRAVESICAL: ["Intravesical", "داخل المثانة"],
  EPIDURAL: ["Epidural", "Epidural"],
  INTRAPERITONEAL: ["Intraperitoneal", "داخل الصفاق"],
  INTRAARTICULAR: ["Intra-articular", "داخل المفصل"],
  INTRADERMAL: ["Intradermal", "داخل الأدمة"],
  TRANSDERMAL: ["Transdermal", "عبر الجلد"],
  SUBLINGUAL: ["Sublingual", "تحت اللسان"],
  INTRACARDIAC: ["Intracardiac", "داخل القلب"],
  INTRAOCULAR: ["Intraocular", "داخل العين"],
  INJECTABLE: ["Injectable", "حقني"],
  IMPLANT: ["Implant", "زرعة"],
  ENVIRONMENTAL: ["Environmental", "بيئي"],
};

const speciesAliases: Record<string, string> = {
  cat: "cat",
  cats: "cat",
  feline: "cat",
  felines: "cat",
  قط: "cat",
  قطط: "cat",
  dog: "dog",
  dogs: "dog",
  canine: "dog",
  canines: "dog",
  كلب: "dog",
  كلاب: "dog",
};

const routeAliases: Record<string, string> = {
  iv: "IV",
  "i.v": "IV",
  intravenous: "IV",
  وريد: "IV",
  وريدي: "IV",
  im: "IM",
  "i.m": "IM",
  intramuscular: "IM",
  عضل: "IM",
  عضلي: "IM",
  sc: "SC",
  "s.c": "SC",
  subcutaneous: "SC",
  "تحت الجلد": "SC",
  po: "PO",
  "p.o": "PO",
  oral: "PO",
  فموي: "PO",
  rectal: "RECTAL",
  شرجي: "RECTAL",
  ophthalmic: "OPHTHALMIC",
  ocular: "OPHTHALMIC",
  eye: "OPHTHALMIC",
  عين: "OPHTHALMIC",
  otic: "OTIC",
  aural: "OTIC",
  ear: "OTIC",
  اذن: "OTIC",
  أذن: "OTIC",
  topical: "TOPICAL",
  جلد: "TOPICAL",
  جلدي: "TOPICAL",
  inhaled: "INHALED",
  inhalation: "INHALED",
  nebulized: "INHALED",
  استنشاق: "INHALED",
  intranasal: "INTRANASAL",
  nasal: "INTRANASAL",
  انف: "INTRANASAL",
  أنف: "INTRANASAL",
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[μµ]/g, "u")
    .replace(/[^\p{L}\p{N}./+\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(/[.\s/-]/g, "");
}

function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

function editDistance(a: string, b: string, limit = 2) {
  const aa = compact(a);
  const bb = compact(b);
  if (!aa || !bb) return 99;
  if (Math.abs(aa.length - bb.length) > limit) return 99;

  const prev = Array.from({ length: bb.length + 1 }, (_, i) => i);
  for (let i = 1; i <= aa.length; i++) {
    const cur = [i];
    let rowMin = cur[0];
    for (let j = 1; j <= bb.length; j++) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > limit) return 99;
    for (let j = 0; j <= bb.length; j++) prev[j] = cur[j];
  }
  return prev[bb.length];
}

function parseSmartQuery(query: string) {
  const normalized = normalize(query);
  const rawTokens = tokenize(normalized);
  const species = new Set<string>();
  const routes = new Set<string>();
  const remaining: string[] = [];

  for (const token of rawTokens) {
    const sp = speciesAliases[token];
    const rt = routeAliases[token];
    if (sp) {
      species.add(sp);
      continue;
    }
    if (rt) {
      routes.add(rt);
      continue;
    }
    remaining.push(token);
  }

  return {
    species: Array.from(species),
    routes: Array.from(routes),
    terms: remaining,
  };
}

function routeLabel(route: string, language: Language) {
  const found = routeLabels[route];
  if (!found) return route;
  return language === "ar" ? found[1] : found[0];
}

function speciesLabel(species: string, language: Language) {
  if (species === "dog") return language === "ar" ? "كلاب" : "Dogs";
  if (species === "cat") return language === "ar" ? "قطط" : "Cats";
  return species;
}

function scoreDrug(drug: Drug, query: string) {
  if (!query.trim()) return 0;

  const q = normalize(query);
  const compactQ = compact(q);
  const terms = tokenize(q);

  const name = normalize(drug.name);
  const ingredient = normalize(drug.active_ingredient);
  const aliases = drug.aliases.map(normalize);
  const trade = normalize(drug.trade_names);
  const fields = [
    ...aliases,
    name,
    ingredient,
    trade,
    normalize(drug.uses),
    normalize(drug.formulations),
    normalize(drug.dose_text),
    normalize(drug.action),
    normalize(drug.contraindications),
    normalize(drug.adverse_reactions),
    normalize(drug.drug_interactions),
  ];

  let score = 0;

  if (compact(name) === compactQ) score += 1000;
  if (name.startsWith(q)) score += 700;
  if (ingredient === q) score += 650;
  if (ingredient.startsWith(q)) score += 450;

  if (aliases.some((x) => compact(x) === compactQ)) score += 550;
  if (trade.includes(q)) score += 400;
  if (name.includes(q)) score += 300;

  for (const term of terms) {
    let best = 0;

    for (const field of fields) {
      if (field.includes(term)) best = Math.max(best, 90);
      const tokens = tokenize(field);
      for (const ft of tokens) {
        if (ft === term) best = Math.max(best, 140);
        else if (ft.startsWith(term)) best = Math.max(best, 110);
        else if (term.length >= 5 && editDistance(ft, term, 2) <= 2) {
          best = Math.max(best, 65);
        }
      }
    }

    score += best;
  }

  return score;
}

export default function BSAVAFormularyPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [darkMode, setDarkMode] = useState(true);
  const [data, setData] = useState<Formulary | null>(null);
  const [query, setQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState<"all" | "dog" | "cat">("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);

  const t = text[language];

  useEffect(() => {
    const savedLanguage = localStorage.getItem("vetra-language");
    const savedTheme = localStorage.getItem("vetra-theme");
    if (savedLanguage === "ar" || savedLanguage === "en") {
      setLanguage(savedLanguage);
    }
    if (savedTheme === "light") setDarkMode(false);

    fetch("/data/vetra-bsava-formulary-10e-a.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Formulary>;
      })
      .then(setData)
      .catch((error) => console.error("FORMULARY LOAD ERROR:", error));
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const routes = useMemo(() => {
    if (!data) return [];
    return data.stats.routes;
  }, [data]);

  const results = useMemo(() => {
    if (!data) return [];

    const smart = parseSmartQuery(query);

    let list = data.drugs.filter((drug) => {
      if (
        speciesFilter !== "all" &&
        !drug.species.includes(speciesFilter)
      ) {
        return false;
      }

      if (routeFilter !== "all" && !drug.routes.includes(routeFilter)) {
        return false;
      }

      if (
        smart.species.length &&
        !smart.species.some((species) => drug.species.includes(species))
      ) {
        return false;
      }

      if (
        smart.routes.length &&
        !smart.routes.some((route) => drug.routes.includes(route))
      ) {
        return false;
      }

      return true;
    });

    if (!query.trim()) {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list
      .map((drug) => ({ drug, score: scoreDrug(drug, query) }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.drug.name.localeCompare(b.drug.name)
      )
      .map((item) => item.drug);
  }, [data, query, speciesFilter, routeFilter]);

  if (!data) {
    return (
      <main
        className={`flex min-h-screen items-center justify-center ${
          darkMode ? "bg-[#0f1115] text-white" : "bg-[#f7f8fa] text-slate-900"
        }`}
      >
        <div className="text-center">
          <div className="text-4xl">💊</div>
          <div className="mt-4 text-lg font-bold">{t.loading}</div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen ${
        darkMode ? "bg-[#0f1115] text-white" : "bg-[#f7f8fa] text-slate-900"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black">{t.title}</h1>
                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-black text-blue-300">
                  {data.stats.monographs} {t.monographs}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">
                  {data.stats.protocol_entries} {t.protocols}
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                {t.subtitle}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLanguage((x) => (x === "en" ? "ar" : "en"))}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
                  darkMode ? "bg-slate-800 text-slate-200" : "bg-white text-slate-700"
                }`}
              >
                {language === "en" ? "عربي" : "English"}
              </button>
              <button
                type="button"
                onClick={() => setDarkMode((x) => !x)}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold ${
                  darkMode ? "bg-slate-800 text-slate-200" : "bg-white text-slate-700"
                }`}
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
        </header>

        <section
          className={`mb-6 rounded-3xl border p-4 ${
            darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black">{t.smart}</div>
              <div className="text-xs text-slate-500">{t.smartHint}</div>
            </div>
            {(query || speciesFilter !== "all" || routeFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSpeciesFilter("all");
                  setRouteFilter("all");
                }}
                className="text-xs font-bold text-blue-400"
              >
                {t.clear}
              </button>
            )}
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className={`w-full rounded-2xl border px-4 py-3.5 text-sm outline-none focus:border-blue-500 ${
              darkMode
                ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
                : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
            }`}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {[["all", t.all], ["dog", t.dogs], ["cat", t.cats]].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSpeciesFilter(key as "all" | "dog" | "cat")}
                className={`rounded-full border px-4 py-2 text-xs font-bold ${
                  speciesFilter === key
                    ? "border-blue-500 bg-blue-600 text-white"
                    : darkMode
                    ? "border-slate-700 bg-slate-950 text-slate-300"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}

            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className={`rounded-full border px-4 py-2 text-xs font-bold outline-none ${
                darkMode
                  ? "border-slate-700 bg-slate-950 text-slate-300"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <option value="all">{t.allRoutes}</option>
              {routes.map((route) => (
                <option key={route} value={route}>
                  {routeLabel(route, language)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div className="mb-4 text-sm text-slate-500">
          {results.length} {t.results}
        </div>

        {results.length === 0 ? (
          <section
            className={`rounded-3xl border p-14 text-center ${
              darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
            }`}
          >
            <div className="text-5xl">🔎</div>
            <div className="mt-4 text-lg font-black">{t.noResults}</div>
          </section>
        ) : (
          <section className="space-y-3">
            {results.map((drug) => (
              <button
                key={drug.id}
                type="button"
                onClick={() => setSelectedDrug(drug)}
                className={`w-full rounded-2xl border p-4 text-start transition hover:-translate-y-0.5 hover:shadow-lg ${
                  darkMode
                    ? "border-slate-800 bg-slate-900 hover:border-slate-700"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-black">{drug.name}</h2>
                      <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-300">
                        {drug.status || t.inactive}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      {drug.active_ingredient}
                    </div>

                    {drug.trade_names && (
                      <div className="mt-2 line-clamp-1 text-xs text-slate-500">
                        {drug.trade_names}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {drug.species.map((sp) => (
                      <span
                        key={sp}
                        className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300"
                      >
                        {speciesLabel(sp, language)}
                      </span>
                    ))}
                    {drug.routes.map((route) => (
                      <span
                        key={route}
                        className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300"
                      >
                        {routeLabel(route, language)}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </section>
        )}

        <div
          className={`mt-6 rounded-2xl border p-4 text-xs leading-6 ${
            darkMode
              ? "border-amber-500/20 bg-amber-500/5 text-amber-200"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          ⚠️ {t.warning}
        </div>
      </div>

      {selectedDrug && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setSelectedDrug(null)}
        >
          <article
            onClick={(e) => e.stopPropagation()}
            className={`max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border p-6 shadow-2xl ${
              darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-black">{selectedDrug.name}</h2>
                  {selectedDrug.species.map((sp) => (
                    <span
                      key={sp}
                      className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300"
                    >
                      {speciesLabel(sp, language)}
                    </span>
                  ))}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {selectedDrug.active_ingredient}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedDrug.routes.map((route) => (
                    <span
                      key={route}
                      className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300"
                    >
                      {routeLabel(route, language)}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDrug(null)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
                }`}
              >
                ✕
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {[
                [t.formulations, selectedDrug.formulations],
                [t.action, selectedDrug.action],
                [t.indications, selectedDrug.uses],
                [t.contraindications, selectedDrug.contraindications],
                [t.adverse, selectedDrug.adverse_reactions],
                [t.interactions, selectedDrug.drug_interactions],
                [t.aliases, selectedDrug.aliases.join(", ")],
              ]
                .filter(([, value]) => String(value || "").trim())
                .map(([label, value]) => (
                  <div
                    key={label}
                    className={`rounded-2xl p-4 ${
                      darkMode ? "bg-slate-950/70" : "bg-slate-50"
                    }`}
                  >
                    <div className="mb-2 text-xs font-black text-slate-500">
                      {label}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-7">
                      {value}
                    </div>
                  </div>
                ))}
            </div>

            <section className="mt-5">
              <div className="mb-3 text-sm font-black">{t.dose}</div>
              <div className="space-y-3">
                {selectedDrug.protocols.length === 0 ? (
                  <div className="rounded-2xl bg-slate-950/40 p-4 text-sm text-slate-500">
                    —
                  </div>
                ) : (
                  selectedDrug.protocols.map((protocol, index) => (
                    <div
                      key={`${index}-${protocol.species.join("-")}`}
                      className={`rounded-2xl border p-4 ${
                        darkMode ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap gap-2">
                        {protocol.species.map((sp) => (
                          <span
                            key={sp}
                            className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300"
                          >
                            {speciesLabel(sp, language)}
                          </span>
                        ))}
                        {protocol.routes.map((route) => (
                          <span
                            key={route}
                            className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300"
                          >
                            {routeLabel(route, language)}
                          </span>
                        ))}
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-7">
                        {protocol.dose_text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="mt-5 text-xs text-slate-500">
              {t.sourcePage}: {selectedDrug.source_page} • {data.source.title} •{" "}
              {data.source.edition} • {data.source.part}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDrug(null)}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white"
              >
                {t.close}
              </button>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
