"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { getClinicContext } from "@/lib/clinic-db";

export type FormularyVisitDraft = {
  id: string;
  drugId: number;
  drugName: string;
  activeIngredient: string;
  species: string;
  route: string;
  doseUnit: string;
  doseBasis: string | null;
  doseExpression: string;
  doseText: string;
  sourcePage: number;
  sourceMin: number;
  sourceMax: number;
  calculatedMin: number | null;
  calculatedMax: number | null;
  appliedDose: string;
  adminDoseUnit: string;
  calculatedVolumeMin: number | null;
  calculatedVolumeMax: number | null;
  concentrationMgPerMl: number | null;
  clinicConcentrationMgPerMl: number | null;
  frequency: string;
  autoCalculated: boolean;
};

type DoseMeasurement = {
  value_min: number;
  value_max: number;
  unit: string;
  basis: string | null;
  expression: string;
  routes?: string[];
};

type Protocol = {
  species: string[];
  routes: string[];
  dose_text: string;
  dose_measurements: DoseMeasurement[];
};

type Drug = {
  id: number;
  name: string;
  trade_names: string;
  aliases: string[];
  active_ingredient: string;
  species: string[];
  routes: string[];
  formulations: string;
  uses: string;
  dose_text: string;
  protocols: Protocol[];
  source_page: number;
};

type Formulary = {
  stats: {
    monographs: number;
    protocol_entries: number;
    routes: string[];
  };
  drugs: Drug[];
};

type Props = {
  language: "en" | "ar";
  darkMode: boolean;
  petSpecies?: string | null;
  weightKg: number | null;
  drafts: FormularyVisitDraft[];
  onChange: (drafts: FormularyVisitDraft[]) => void;
};

const speciesAliases: Record<string, string> = {
  cat: "cat", cats: "cat", feline: "cat", felines: "cat", قط: "cat", قطط: "cat",
  dog: "dog", dogs: "dog", canine: "dog", canines: "dog", كلب: "dog", كلاب: "dog",
};

const routeAliases: Record<string, string> = {
  iv: "IV", "i.v": "IV", intravenous: "IV", وريدي: "IV", وريد: "IV",
  im: "IM", "i.m": "IM", intramuscular: "IM", عضلي: "IM", عضل: "IM",
  sc: "SC", "s.c": "SC", subcutaneous: "SC", "تحت الجلد": "SC",
  po: "PO", "p.o": "PO", oral: "PO", orally: "PO", فموي: "PO",
  rectal: "RECTAL", شرجي: "RECTAL", ophthalmic: "OPHTHALMIC", ocular: "OPHTHALMIC", eye: "OPHTHALMIC", عين: "OPHTHALMIC",
  otic: "OTIC", aural: "OTIC", ear: "OTIC", اذن: "OTIC", أذن: "OTIC",
  topical: "TOPICAL", جلدي: "TOPICAL", موضعي: "TOPICAL",
  inhaled: "INHALED", inhalation: "INHALED", nebulized: "INHALED", استنشاق: "INHALED",
  intranasal: "INTRANASAL", nasal: "INTRANASAL", أنف: "INTRANASAL", انف: "INTRANASAL",
  intratracheal: "INTRATRACHEAL", epidural: "EPIDURAL", intraperitoneal: "INTRAPERITONEAL",
  intraarticular: "INTRAARTICULAR", intradermal: "INTRADERMAL", intravesical: "INTRAVESICAL",
  transdermal: "TRANSDERMAL", sublingual: "SUBLINGUAL", intracardiac: "INTRACARDIAC",
  intraocular: "INTRAOCULAR", implant: "IMPLANT",
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
  return normalize(value).split(" ").filter(Boolean);
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
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > limit) return 99;
    for (let j = 0; j <= bb.length; j++) prev[j] = cur[j];
  }
  return prev[bb.length];
}

function parseQuery(query: string) {
  const species = new Set<string>();
  const routes = new Set<string>();
  const terms: string[] = [];
  for (const token of tokenize(query)) {
    const sp = speciesAliases[token];
    const rt = routeAliases[token];
    if (sp) species.add(sp);
    else if (rt) routes.add(rt);
    else terms.push(token);
  }
  return { species: [...species], routes: [...routes], terms };
}

function scoreDrug(drug: Drug, query: string) {
  if (!query.trim()) return 0;
  const q = normalize(query);
  const terms = tokenize(q);
  const fields = [
    normalize(drug.name),
    normalize(drug.active_ingredient),
    normalize(drug.trade_names),
    ...drug.aliases.map(normalize),
    normalize(drug.uses),
    normalize(drug.formulations),
    normalize(drug.dose_text),
  ];
  let score = 0;
  if (compact(drug.name) === compact(q)) score += 1000;
  if (normalize(drug.name).startsWith(q)) score += 700;
  if (normalize(drug.active_ingredient).startsWith(q)) score += 500;
  for (const term of terms) {
    let best = 0;
    for (const field of fields) {
      if (field.includes(term)) best = Math.max(best, 100);
      for (const token of tokenize(field)) {
        if (token === term) best = Math.max(best, 150);
        else if (token.startsWith(term)) best = Math.max(best, 120);
        else if (term.length >= 4 && editDistance(token, term, term.length <= 5 ? 1 : 2) <= (term.length <= 5 ? 1 : 2)) best = Math.max(best, 70);
      }
    }
    score += best;
  }
  return score;
}

function routeLabel(route: string, ar: boolean) {
  const labels: Record<string, string> = {
    IV: ar ? "وريدي" : "IV", IM: ar ? "عضلي" : "IM", SC: ar ? "تحت الجلد" : "SC", PO: ar ? "فموي" : "PO",
    OPHTHALMIC: ar ? "عين" : "Ophthalmic", OTIC: ar ? "أذن" : "Otic", TOPICAL: ar ? "موضعي" : "Topical",
    INHALED: ar ? "استنشاق" : "Inhaled", INTRANASAL: ar ? "أنف" : "Intranasal", RECTAL: ar ? "شرجي" : "Rectal",
    INTRATRACHEAL: ar ? "داخل القصبة" : "Intratracheal", INTRAVESICAL: ar ? "داخل المثانة" : "Intravesical",
    EPIDURAL: "Epidural", INTRAARTICULAR: ar ? "داخل المفصل" : "Intra-articular", TRANSDERMAL: ar ? "عبر الجلد" : "Transdermal",
    INTRAPERITONEAL: ar ? "داخل الصفاق" : "Intraperitoneal", SUBLINGUAL: ar ? "تحت اللسان" : "Sublingual",
  };
  return labels[route] || route;
}

function formatDose(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function extractFrequency(text: string, expression: string, route: string) {
  const normalized = String(text || "").replace(/[–—]/g, "-");
  const chunks = normalized.split(/;|\n/).map((x) => x.trim()).filter(Boolean);
  const routePattern = route ? new RegExp(String.raw`\b(?:${route.toLowerCase()}|${route === "IV" ? "i\.v" : route === "IM" ? "i\.m" : route === "SC" ? "s\.c" : route === "PO" ? "p\.o" : route.toLowerCase()})\.?\b`, "i") : null;
  const frequencyPattern = /\bq\d+(?:\s*[-–]\s*\d+)?(?:h|d|w|mo)\b|\b(?:once|twice|three times|four times)\s+(?:daily|weekly|monthly)\b|\b(?:daily|weekly|monthly)\b|\bprn\b|\bas needed\b/ig;

  const ordered = [...chunks.filter((chunk) => expression && chunk.includes(expression)), ...chunks.filter((chunk) => !expression || !chunk.includes(expression))];
  for (const chunk of ordered) {
    if (routePattern && !routePattern.test(chunk) && !chunk.toLowerCase().includes(route.toLowerCase())) continue;
    const match = chunk.match(frequencyPattern);
    if (match?.[0]) return match[0].trim();
  }

  const fallback = normalized.match(frequencyPattern);
  return fallback?.[0]?.trim() || "";
}

function extractLiquidConcentrationMgPerMl(formulations: string, route: string) {
  const text = String(formulations || "");
  const candidates: { value: number; score: number }[] = [];
  const patterns = [
    /([0-9]+(?:\.[0-9]+)?)\s*mg\s*\/\s*([0-9]+(?:\.[0-9]+)?)\s*m[lL]/g,
    /([0-9]+(?:\.[0-9]+)?)\s*mg\s*\/\s*m[lL]/g,
  ];
  const lowerRoute = String(route || "").toUpperCase();
  const routeHints = lowerRoute === "PO" ? ["oral"] : ["injectable", "injection", "parenteral"];

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
      const mg = Number(match[1]);
      const denominator = match[2] ? Number(match[2]) : 1;
      if (!Number.isFinite(mg) || !Number.isFinite(denominator) || denominator <= 0) continue;
      const snippet = text.slice(Math.max(0, match.index - 100), Math.min(text.length, match.index + 40)).toLowerCase();
      let score = routeHints.some((hint) => snippet.includes(hint)) ? 10 : 0;
      if (/suspension|solution|liquid/.test(snippet)) score += 2;
      candidates.push({ value: mg / denominator, score });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const tied = candidates.filter((x) => x.score === best.score);
  const unique = [...new Set(tied.map((x) => x.value))];
  return unique.length === 1 ? unique[0] : best.value;
}

function unitToMg(value: number, unit: string) {
  const u = unit.toLowerCase();
  if (u === "μg" || u === "ug" || u === "µg") return value / 1000;
  if (u === "g") return value * 1000;
  return value;
}

function calculateForMeasurement(m: DoseMeasurement, weight: number | null) {
  const basis = (m.basis || "").toLowerCase();
  if (basis === "kg" && weight && weight > 0) {
    return {
      min: Number((m.value_min * weight).toFixed(4)),
      max: Number((m.value_max * weight).toFixed(4)),
      unit: m.unit,
    };
  }
  if (basis === "dog" || basis === "cat" || basis === "animal") {
    return { min: m.value_min, max: m.value_max, unit: m.unit };
  }
  return null;
}

export function BSAVAFormularyPicker({ language, darkMode, petSpecies, weightKg, drafts, onChange }: Props) {
  const [data, setData] = useState<Formulary | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [selectedMeasurementIndex, setSelectedMeasurementIndex] = useState(0);
  const [appliedDose, setAppliedDose] = useState("");
  const [isManualDose, setIsManualDose] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [clinicConcentrationInput, setClinicConcentrationInput] = useState("");

  const deferredQuery = useDeferredValue(query);
  const ar = language === "ar";
  const species = speciesAliases[(petSpecies || "").toLowerCase()] || null;

  useEffect(() => {
    void getClinicContext()
      .then((context) => {
        if (context?.clinic_id) setClinicId(context.clinic_id);
      })
      .catch((error) => console.error("VETRA CLINIC CONTEXT ERROR:", error));

    fetch("/data/vetra-bsava-formulary-10e-a-enhanced.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Formulary>;
      })
      .then(setData)
      .catch((error) => console.error("BSAVA FORMULARY LOAD ERROR:", error));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const smart = parseQuery(deferredQuery);
    const base = data.drugs.filter((drug) => {
      if (species && !drug.species.includes(species)) return false;
      if (smart.species.length && !smart.species.some((s) => drug.species.includes(s))) return false;
      if (smart.routes.length && !smart.routes.some((r) => drug.routes.includes(r))) return false;
      return true;
    });
    if (!deferredQuery.trim()) return base.slice(0, 8);
    return base
      .map((drug) => ({ drug, score: scoreDrug(drug, deferredQuery) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.drug.name.localeCompare(b.drug.name))
      .slice(0, 10)
      .map((x) => x.drug);
  }, [data, deferredQuery, species]);

  const compatibleProtocols = useMemo(() => {
    if (!selectedDrug) return [];
    return selectedDrug.protocols.filter((p) => !species || p.species.includes(species));
  }, [selectedDrug, species]);

  const routeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of compatibleProtocols) for (const r of p.routes) set.add(r);
    return [...set];
  }, [compatibleProtocols]);

  const selectedProtocol = compatibleProtocols.find((p) => p.routes.includes(selectedRoute)) || compatibleProtocols[0] || null;

  const measurementOptions = useMemo(() => {
    if (!selectedProtocol) return [];
    return selectedProtocol.dose_measurements
      .map((m, index) => ({ m, index }))
      .filter(({ m }) => {
        if (!selectedRoute) return true;
        return !m.routes?.length || m.routes.includes(selectedRoute);
      });
  }, [selectedProtocol, selectedRoute]);

  const selectedMeasurement = measurementOptions.find((x) => x.index === selectedMeasurementIndex)?.m || measurementOptions[0]?.m || null;
  const autoCalc = selectedMeasurement ? calculateForMeasurement(selectedMeasurement, weightKg) : null;

  useEffect(() => {
    if (!selectedDrug) return;
    const firstRoute = routeOptions[0] || "";
    setSelectedRoute((current) => current && routeOptions.includes(current) ? current : firstRoute);
    setSelectedMeasurementIndex(0);
    setAppliedDose("");
    setIsManualDose(false);
  }, [selectedDrug, routeOptions]);

  const sourceConcentrationMgPerMl = selectedDrug && selectedMeasurement
    ? extractLiquidConcentrationMgPerMl(selectedDrug.formulations || "", selectedRoute)
    : null;

  const clinicConcentrationStorageKey =
    clinicId && selectedDrug && selectedRoute
      ? `vetra-clinic-formulary-concentration:${clinicId}:${selectedDrug.id}:${selectedRoute}`
      : null;

  const clinicConcentrationMgPerMl =
    clinicConcentrationInput.trim() !== ""
      ? Number(clinicConcentrationInput)
      : null;

  const effectiveConcentrationMgPerMl =
    clinicConcentrationMgPerMl != null && Number.isFinite(clinicConcentrationMgPerMl) && clinicConcentrationMgPerMl > 0
      ? clinicConcentrationMgPerMl
      : sourceConcentrationMgPerMl;

  useEffect(() => {
    if (!clinicConcentrationStorageKey) {
      setClinicConcentrationInput("");
      return;
    }

    try {
      const saved = window.localStorage.getItem(clinicConcentrationStorageKey);
      setClinicConcentrationInput(saved || "");
    } catch {
      setClinicConcentrationInput("");
    }
  }, [clinicConcentrationStorageKey]);

  function saveClinicConcentration() {
    if (!clinicConcentrationStorageKey) return;
    const value = Number(clinicConcentrationInput);
    if (!Number.isFinite(value) || value <= 0) return;

    window.localStorage.setItem(
      clinicConcentrationStorageKey,
      String(value)
    );
  }

  function clearClinicConcentration() {
    if (clinicConcentrationStorageKey) {
      window.localStorage.removeItem(clinicConcentrationStorageKey);
    }
    setClinicConcentrationInput("");
  }


  const selectedVolumeCalc = autoCalc && effectiveConcentrationMgPerMl
    ? {
        min: Number((unitToMg(autoCalc.min, autoCalc.unit) / effectiveConcentrationMgPerMl).toFixed(4)),
        max: Number((unitToMg(autoCalc.max, autoCalc.unit) / effectiveConcentrationMgPerMl).toFixed(4)),
      }
    : null;

  useEffect(() => {
    if (!autoCalc || isManualDose) return;
    if (selectedVolumeCalc) {
      const value = selectedVolumeCalc.min === selectedVolumeCalc.max
        ? formatDose(selectedVolumeCalc.min)
        : `${formatDose(selectedVolumeCalc.min)}–${formatDose(selectedVolumeCalc.max)}`;
      setAppliedDose(value);
      return;
    }
    if (autoCalc.min === autoCalc.max) setAppliedDose(formatDose(autoCalc.min));
    else setAppliedDose("");
  }, [autoCalc?.min, autoCalc?.max, autoCalc?.unit, isManualDose, selectedVolumeCalc?.min, selectedVolumeCalc?.max, effectiveConcentrationMgPerMl]);

  function addSelectedProtocol() {
    if (!selectedDrug || !selectedMeasurement) return;
    const protocol = selectedProtocol;
    const route = selectedRoute || selectedMeasurement.routes?.[0] || protocol?.routes?.[0] || "";
    const calc = calculateForMeasurement(selectedMeasurement, weightKg);
    const formulationText = selectedDrug.formulations || "";
    const sourceConcentration = extractLiquidConcentrationMgPerMl(formulationText, route);
    const clinicConcentration =
      clinicConcentrationInput.trim() !== "" &&
      Number.isFinite(Number(clinicConcentrationInput)) &&
      Number(clinicConcentrationInput) > 0
        ? Number(clinicConcentrationInput)
        : null;
    const concentrationMgPerMl = clinicConcentration ?? sourceConcentration;
    const sourceUnit = selectedMeasurement.unit;
    const sourceMinMg = calc ? unitToMg(calc.min, calc.unit) : null;
    const sourceMaxMg = calc ? unitToMg(calc.max, calc.unit) : null;
    const volumeMin = sourceMinMg != null && concentrationMgPerMl ? Number((sourceMinMg / concentrationMgPerMl).toFixed(4)) : null;
    const volumeMax = sourceMaxMg != null && concentrationMgPerMl ? Number((sourceMaxMg / concentrationMgPerMl).toFixed(4)) : null;
    const frequency = extractFrequency(selectedProtocol?.dose_text || selectedDrug.dose_text, selectedMeasurement.expression, route);
    const adminDoseUnit = volumeMin != null ? "mL" : sourceUnit;
    const autoDisplay = volumeMin != null
      ? `${formatDose(volumeMin)}${volumeMax != null && volumeMax !== volumeMin ? `–${formatDose(volumeMax)}` : ""}`
      : calc
        ? `${formatDose(calc.min)}${calc.max !== calc.min ? `–${formatDose(calc.max)}` : ""}`
        : selectedMeasurement.expression;
    const draft: FormularyVisitDraft = {
      id: crypto.randomUUID(),
      drugId: selectedDrug.id,
      drugName: selectedDrug.name,
      activeIngredient: selectedDrug.active_ingredient,
      species: species || selectedDrug.species[0] || "",
      route,
      doseUnit: sourceUnit,
      doseBasis: selectedMeasurement.basis,
      doseExpression: selectedMeasurement.expression,
      doseText: selectedProtocol?.dose_text || selectedDrug.dose_text,
      sourcePage: selectedDrug.source_page,
      sourceMin: selectedMeasurement.value_min,
      sourceMax: selectedMeasurement.value_max,
      calculatedMin: calc?.min ?? null,
      calculatedMax: calc?.max ?? null,
      appliedDose: isManualDose ? appliedDose.trim() : autoDisplay,
      adminDoseUnit,
      calculatedVolumeMin: volumeMin,
      calculatedVolumeMax: volumeMax,
      concentrationMgPerMl,
      clinicConcentrationMgPerMl: clinicConcentration,
      frequency,
      autoCalculated: !isManualDose,
    };
    onChange([...drafts, draft]);
    setSelectedDrug(null);
    setQuery("");
    setAppliedDose("");
    setIsManualDose(false);
  }

  function updateDraft(id: string, patch: Partial<FormularyVisitDraft>) {
    onChange(drafts.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  }

  function removeDraft(id: string) {
    onChange(drafts.filter((draft) => draft.id !== id));
  }

  function resetDraftToAuto(draft: FormularyVisitDraft) {
    const min = draft.doseBasis === "kg" && weightKg ? draft.sourceMin * weightKg : draft.sourceMin;
    const max = draft.doseBasis === "kg" && weightKg ? draft.sourceMax * weightKg : draft.sourceMax;
    const unit = draft.doseUnit;
    const minMg = unitToMg(min, unit);
    const maxMg = unitToMg(max, unit);
    const volumeMin = draft.concentrationMgPerMl ? Number((minMg / draft.concentrationMgPerMl).toFixed(4)) : null;
    const volumeMax = draft.concentrationMgPerMl ? Number((maxMg / draft.concentrationMgPerMl).toFixed(4)) : null;
    updateDraft(draft.id, {
      calculatedMin: Number(min.toFixed(4)),
      calculatedMax: Number(max.toFixed(4)),
      calculatedVolumeMin: volumeMin,
      calculatedVolumeMax: volumeMax,
      adminDoseUnit: volumeMin != null ? "mL" : unit,
      appliedDose: volumeMin != null
        ? `${formatDose(volumeMin)}${volumeMax != null && volumeMax !== volumeMin ? `–${formatDose(volumeMax)}` : ""}`
        : (min === max ? formatDose(min) : ""),
      autoCalculated: true,
    });
  }

  useEffect(() => {
    if (!weightKg || weightKg <= 0) return;
    const next = drafts.map((draft) => {
      if (!draft.autoCalculated || draft.doseBasis !== "kg") return draft;
      const min = Number((draft.sourceMin * weightKg).toFixed(4));
      const max = Number((draft.sourceMax * weightKg).toFixed(4));
      const minMg = unitToMg(min, draft.doseUnit);
      const maxMg = unitToMg(max, draft.doseUnit);
      const volumeMin = draft.concentrationMgPerMl ? Number((minMg / draft.concentrationMgPerMl).toFixed(4)) : null;
      const volumeMax = draft.concentrationMgPerMl ? Number((maxMg / draft.concentrationMgPerMl).toFixed(4)) : null;
      return {
        ...draft,
        calculatedMin: min,
        calculatedMax: max,
        calculatedVolumeMin: volumeMin,
        calculatedVolumeMax: volumeMax,
        adminDoseUnit: volumeMin != null ? "mL" : draft.doseUnit,
        appliedDose: volumeMin != null
          ? `${formatDose(volumeMin)}${volumeMax != null && volumeMax !== volumeMin ? `–${formatDose(volumeMax)}` : ""}`
          : (min === max ? formatDose(min) : ""),
      };
    });
    const changed = next.some((draft, index) => draft.calculatedMin !== drafts[index]?.calculatedMin || draft.calculatedMax !== drafts[index]?.calculatedMax || draft.appliedDose !== drafts[index]?.appliedDose);
    if (changed) onChange(next);
  }, [weightKg]);

  return (
    <div className={`rounded-2xl border p-4 ${darkMode ? "border-blue-900/60 bg-slate-950/60" : "border-blue-200 bg-blue-50/40"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black">📚 BSAVA Formulary</div>
          <div className="text-[11px] text-slate-500">
            {ar ? "بحث ذكي + تصفية الحيوان والطريق + حساب الجرعة من البروتوكول" : "Fuzzy search + species/route filtering + protocol-based dose calculation"}
          </div>
        </div>
        <span className="rounded-full bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400">
          {species ? (species === "cat" ? (ar ? "قطط" : "CAT") : (ar ? "كلاب" : "DOG")) : "CAT / DOG"}
        </span>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={ar ? "مثال: amoxcillin iv أو marbofloxacin قِطط" : "Try: amoxcillin iv cat or marbofloxacin"}
        className={`mb-3 w-full rounded-xl border px-3 py-3 text-sm outline-none focus:border-blue-500 ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}
      />

      {!selectedDrug && (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-500">
              {ar ? "مفيش تطابق. جرّب الاسم التجاري أو المادة الفعالة أو Route." : "No match. Try a trade name, active ingredient, or route."}
            </div>
          ) : (
            filtered.map((drug) => (
              <button
                key={drug.id}
                type="button"
                onClick={() => setSelectedDrug(drug)}
                className={`w-full rounded-xl border p-3 text-start ${darkMode ? "border-slate-800 bg-slate-900 hover:border-blue-800" : "border-slate-200 bg-white hover:border-blue-300"}`}
              >
                <div className="font-bold">{drug.name}</div>
                <div className="mt-1 text-xs text-slate-500">{drug.active_ingredient}{drug.trade_names ? ` • ${drug.trade_names}` : ""}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {drug.routes.slice(0, 5).map((route) => <span key={route} className="rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-semibold text-slate-400">{routeLabel(route, ar)}</span>)}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {selectedDrug && (
        <div className={`rounded-2xl border p-4 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-black">{selectedDrug.name}</div>
              <div className="text-xs text-slate-500">{selectedDrug.active_ingredient}</div>
            </div>
            <button type="button" onClick={() => setSelectedDrug(null)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500">✕</button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {routeOptions.map((route) => (
              <button key={route} type="button" onClick={() => { setSelectedRoute(route); setSelectedMeasurementIndex(0); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selectedRoute === route ? "border-blue-500 bg-blue-600 text-white" : darkMode ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                {routeLabel(route, ar)}
              </button>
            ))}
          </div>

          {selectedRoute && (
            <div className={`mt-4 rounded-2xl border p-4 ${
              darkMode
                ? "border-emerald-900/60 bg-emerald-950/20"
                : "border-emerald-200 bg-emerald-50/60"
            }`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black">
                    {ar ? "التركيز المتاح في العيادة" : "Clinic concentration"}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {ar
                      ? "اكتب التركيز الموجود عندك. VETRA ستستخدمه لحساب الملي تلقائيًا."
                      : "Enter the concentration available at your clinic. VETRA will use it for mL calculation."}
                  </div>
                </div>
                {sourceConcentrationMgPerMl != null && (
                  <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-bold text-slate-400">
                    {ar
                      ? `المصدر: ${formatDose(sourceConcentrationMgPerMl)} mg/mL`
                      : `Source: ${formatDose(sourceConcentrationMgPerMl)} mg/mL`}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={clinicConcentrationInput}
                    onChange={(e) => setClinicConcentrationInput(e.target.value)}
                    placeholder={
                      sourceConcentrationMgPerMl != null
                        ? String(sourceConcentrationMgPerMl)
                        : "e.g. 150"
                    }
                    className={`w-full rounded-xl border px-3 py-3 text-sm outline-none focus:border-emerald-500 ${
                      darkMode
                        ? "border-slate-700 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-900"
                    }`}
                  />
                  <span className="shrink-0 text-xs font-bold text-slate-500">mg/mL</span>
                </div>

                <button
                  type="button"
                  onClick={saveClinicConcentration}
                  disabled={!clinicId || !clinicConcentrationInput.trim()}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {ar ? "حفظ التركيز" : "Save concentration"}
                </button>

                {clinicConcentrationInput.trim() && (
                  <button
                    type="button"
                    onClick={clearClinicConcentration}
                    className={`rounded-xl px-4 py-3 text-xs font-bold ${
                      darkMode
                        ? "bg-slate-800 text-slate-300"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    {ar ? "مسح" : "Clear"}
                  </button>
                )}
              </div>

              <div className="mt-2 text-[10px] font-semibold text-slate-500">
                {effectiveConcentrationMgPerMl != null
                  ? ar
                    ? `سيتم الحساب باستخدام: ${formatDose(effectiveConcentrationMgPerMl)} mg/mL`
                    : `Calculation will use: ${formatDose(effectiveConcentrationMgPerMl)} mg/mL`
                  : ar
                    ? "أدخل تركيز السائل لإظهار الجرعة بالملي."
                    : "Enter a liquid concentration to calculate the dose in mL."}
              </div>
            </div>
          )}

          {measurementOptions.length > 1 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs font-bold">{ar ? "اختيار بروتوكول الجرعة" : "Dose protocol"}</div>
              <select value={selectedMeasurementIndex} onChange={(e) => { setSelectedMeasurementIndex(Number(e.target.value)); setAppliedDose(""); setIsManualDose(false); }} className={`w-full rounded-xl border px-3 py-3 text-sm ${darkMode ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white"}`}>
                {measurementOptions.map(({ m, index }) => <option key={index} value={index}>{m.expression}</option>)}
              </select>
            </div>
          )}

          {selectedMeasurement && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className={`rounded-xl p-3 ${darkMode ? "bg-slate-950" : "bg-slate-50"}`}>
                <div className="text-[10px] font-bold text-slate-500">{ar ? "المصدر" : "Source protocol"}</div>
                <div className="mt-1 text-sm font-semibold">{selectedMeasurement.expression}</div>
                <div className="mt-1 text-[11px] text-slate-500">{selectedProtocol?.dose_text}</div>
              </div>

              <div className={`rounded-xl p-3 ${darkMode ? "bg-slate-950" : "bg-slate-50"}`}>
                <div className="text-[10px] font-bold text-slate-500">{ar ? "الجرعة المحسوبة" : "Calculated dose"}</div>
                <div className="mt-1 text-sm font-black">
                  {selectedVolumeCalc
                    ? `${formatDose(selectedVolumeCalc.min)}${selectedVolumeCalc.max !== selectedVolumeCalc.min ? `–${formatDose(selectedVolumeCalc.max)}` : ""} mL`
                    : autoCalc
                      ? `${formatDose(autoCalc.min)}${autoCalc.max !== autoCalc.min ? `–${formatDose(autoCalc.max)}` : ""} ${autoCalc.unit}`
                      : (ar ? "لا يمكن حسابها تلقائيًا بالوزن" : "Not weight-calculated")}
                </div>
              </div>

              <label className="md:col-span-2">
                <span className="mb-1.5 block text-xs font-bold">{ar ? "الجرعة المستخدمة (قابلة للتعديل)" : "Applied dose (editable)"}</span>
                <input
                  value={appliedDose}
                  onChange={(e) => { setAppliedDose(e.target.value); setIsManualDose(true); }}
                  placeholder={selectedVolumeCalc
                    ? `${formatDose(selectedVolumeCalc.min)}${selectedVolumeCalc.max !== selectedVolumeCalc.min ? `–${formatDose(selectedVolumeCalc.max)}` : ""} mL`
                    : autoCalc
                      ? `${formatDose(autoCalc.min)}${autoCalc.max !== autoCalc.min ? `–${formatDose(autoCalc.max)}` : ""} ${autoCalc.unit}`
                      : selectedMeasurement.expression}
                  className={`w-full rounded-xl border px-3 py-3 text-sm outline-none focus:border-blue-500 ${darkMode ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"}`}
                />
              </label>
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setSelectedDrug(null)} className={`rounded-xl px-4 py-2.5 text-xs font-bold ${darkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>{ar ? "إلغاء" : "Cancel"}</button>
            <button type="button" onClick={addSelectedProtocol} disabled={!selectedMeasurement} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40">+ {ar ? "إضافة للكشف" : "Add to visit"}</button>
          </div>
        </div>
      )}

      {drafts.length > 0 && (
        <div className="mt-4 space-y-2">
          {drafts.map((draft) => (
            <div key={draft.id} className={`rounded-xl border p-3 ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{draft.drugName}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{draft.route ? routeLabel(draft.route, ar) : ""} • {draft.doseExpression} • p.{draft.sourcePage}</div>
                </div>
                <button type="button" onClick={() => removeDraft(draft.id)} className="text-rose-500">✕</button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={draft.appliedDose}
                  onChange={(e) => updateDraft(draft.id, { appliedDose: e.target.value, autoCalculated: false })}
                  className={`min-w-[180px] flex-1 rounded-xl border px-3 py-2 text-sm ${darkMode ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`}
                  placeholder={draft.calculatedMin != null ? `${formatDose(draft.calculatedMin)}${draft.calculatedMax != null && draft.calculatedMax !== draft.calculatedMin ? `–${formatDose(draft.calculatedMax)}` : ""} ${draft.doseUnit}` : draft.doseExpression}
                />
                <span className="text-xs font-semibold text-slate-500">{draft.adminDoseUnit || draft.doseUnit}</span>
                {draft.doseBasis === "kg" && (
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-400">{weightKg ? `${weightKg} kg` : "—"}</span>
                )}
                {draft.concentrationMgPerMl != null && (
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    draft.clinicConcentrationMgPerMl != null
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-slate-500/10 text-slate-400"
                  }`}>
                    {draft.clinicConcentrationMgPerMl != null
                      ? (ar ? `عيادتي: ${formatDose(draft.clinicConcentrationMgPerMl)} mg/mL` : `Clinic: ${formatDose(draft.clinicConcentrationMgPerMl)} mg/mL`)
                      : `${formatDose(draft.concentrationMgPerMl)} mg/mL`}
                  </span>
                )}
                {draft.frequency && (
                  <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold text-violet-400">{draft.frequency}</span>
                )}
                {!draft.concentrationMgPerMl && (
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-400">{ar ? "لا يوجد تركيز سائل مناسب في المصدر" : "No liquid concentration found"}</span>
                )}
                {!draft.autoCalculated && draft.doseBasis === "kg" && (
                  <button type="button" onClick={() => resetDraftToAuto(draft)} className="rounded-lg bg-slate-500/10 px-2.5 py-1 text-[10px] font-bold text-slate-400">{ar ? "رجّع Auto" : "Reset auto"}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-[10px] leading-5 text-amber-500/80">
        {ar ? "مهم: الجرعة مستخرجة من الـFormulary كمصدر مرجعي. النتيجة المحسوبة لا تستبدل الحكم السريري ومراجعة الـprotocol الحالي." : "Important: doses are source-derived reference data. Calculated values do not replace clinical judgment or verification of the current protocol."}
      </div>
    </div>
  );
}
