"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getClinicContext, getClinicDb } from "@/lib/clinic-db";
import type { ExternalMedicationDraft, Language, Medication } from "./new-visit-types";
import type { FormularyVisitDraft } from "@/components/BSAVAFormularyPicker";

type DrugEyeResult = {
  id: string;
  name: string;
  price: string | null;
  activeIngredient: string | null;
  category: string | null;
  manufacturer: string | null;
};

type BsavaDoseMeasurement = {
  value_min: number;
  value_max: number;
  unit: string;
  basis: string | null;
  expression: string;
  routes?: string[];
};

type BsavaProtocol = {
  species: string[];
  routes: string[];
  dose_text: string;
  dose_measurements: BsavaDoseMeasurement[];
};

type BsavaDrug = {
  id: number;
  name: string;
  trade_names?: string;
  aliases?: string[];
  active_ingredient?: string;
  species?: string[];
  routes?: string[];
  formulations?: string;
  dose_text?: string;
  protocols?: BsavaProtocol[];
  source_page?: number;
};

type BsavaDoseOption = {
  drug: BsavaDrug;
  protocol: BsavaProtocol;
  measurement: BsavaDoseMeasurement;
  measurementIndex: number;
  protocolIndex: number;
  route: string;
  calculated: { min: number; max: number; unit: string } | null;
  concentrationMgPerMl: number | null;
  volumeMin: number | null;
  volumeMax: number | null;
  displayDose: string;
  displayUnit: string;
  frequency: string;
  label: string;
};

type BsavaCatalog = { drugs?: BsavaDrug[] };

type SavedProductLink = {
  id: string;
  clinic_id: string;
  product_key: string;
  drug_eye_product_id: string | null;
  drug_eye_name: string;
  drug_eye_active_ingredient: string | null;
  drug_eye_category: string | null;
  drug_eye_manufacturer: string | null;
  drug_eye_price: string | null;
  vetra_medication_id: string | null;
  bsava_drug_id: number | null;
  bsava_drug_name: string | null;
  bsava_active_ingredient: string | null;
  link_status: "unmatched" | "partial" | "linked";
  match_method: string | null;
};

type Props = {
  results: DrugEyeResult[];
  language: Language;
  darkMode: boolean;
  medications: Medication[];
  petSpecies?: string | null;
  weightKg: number | null;
  onAddMedication: (medicationId: string) => void;
  onAddBsavaDraft: (draft: FormularyVisitDraft) => boolean;
  onAddManualDraft: (draft: ExternalMedicationDraft) => void;
};

const SELECT_FIELDS = [
  "id", "clinic_id", "product_key", "drug_eye_product_id", "drug_eye_name",
  "drug_eye_active_ingredient", "drug_eye_category", "drug_eye_manufacturer",
  "drug_eye_price", "vetra_medication_id", "bsava_drug_id", "bsava_drug_name",
  "bsava_active_ingredient", "link_status", "match_method",
].join(",");

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Stable across DrugEye searches; do not use DrugEye's result index as the key. */
function getProductKey(result: DrugEyeResult): string {
  return [result.name, result.activeIngredient, result.manufacturer]
    .map((value) => normalizeText(value))
    .join("|")
    .slice(0, 480);
}

/** Only infer a liquid concentration when the DrugEye product name states an explicit ratio. */
function getExplicitDrugEyeConcentrationMgPerMl(result: DrugEyeResult): number | null {
  const text = String(result.name || "").replace(/,/g, ".");
  const ratio = text.match(/(\d+(?:\.\d+)?)\s*mg\s*\/\s*(\d+(?:\.\d+)?)\s*ml\b/i);
  if (ratio) {
    const mg = Number(ratio[1]);
    const ml = Number(ratio[2]);
    return Number.isFinite(mg) && Number.isFinite(ml) && ml > 0 ? mg / ml : null;
  }
  const perMl = text.match(/(\d+(?:\.\d+)?)\s*mg\s*\/\s*ml\b/i);
  if (perMl) {
    const mg = Number(perMl[1]);
    return Number.isFinite(mg) && mg > 0 ? mg : null;
  }
  return null;
}

function scoreVetraMedication(result: DrugEyeResult, med: Medication): number {
  const ingredient = normalizeText(result.activeIngredient);
  const medIngredient = normalizeText(med.active_ingredient);
  const productName = normalizeText(result.name);
  const medName = normalizeText(med.name);
  // Exact product-name equality is the only auto-selection criterion. Ingredient matches
  // remain suggestions because the commercial strength/form may differ.
  if (productName && medName && productName === medName) return 100;
  if (ingredient && medIngredient && ingredient === medIngredient) return 90;
  if (productName && medName && (productName.startsWith(`${medName} `) || medName.startsWith(`${productName} `))) return 65;
  return 0;
}

function scoreBsavaDrug(result: DrugEyeResult, drug: BsavaDrug): number {
  const ingredient = normalizeText(result.activeIngredient);
  const bsavaIngredient = normalizeText(drug.active_ingredient);
  if (ingredient && bsavaIngredient && ingredient === bsavaIngredient) return 100;

  if (ingredient && (drug.aliases ?? []).some((alias) => normalizeText(alias) === ingredient)) return 95;

  const productName = normalizeText(result.name);
  const bsavaName = normalizeText(drug.name);
  if (productName && bsavaName && productName === bsavaName) return 90;

  const tradeNames = String(drug.trade_names ?? "")
    .split(/[;,|]/)
    .map((name) => normalizeText(name))
    .filter(Boolean);
  if (tradeNames.some((name) => productName === name || productName.startsWith(`${name} `))) return 82;
  if ((drug.aliases ?? []).some((alias) => {
    const normalized = normalizeText(alias);
    return normalized && (productName === normalized || productName.startsWith(`${normalized} `));
  })) return 75;
  return 0;
}

function speciesLabel(species: string[] | undefined, language: Language): string {
  if (!species?.length) return language === "ar" ? "الأنواع غير محددة" : "Species not specified";
  const normalized = species.map((item) => item.toLowerCase());
  const labels = normalized.map((item) => {
    if (item === "cat" || item === "cats" || item === "feline") return language === "ar" ? "قطط" : "Cats";
    if (item === "dog" || item === "dogs" || item === "canine") return language === "ar" ? "كلاب" : "Dogs";
    return item;
  });
  return [...new Set(labels)].join(" / ");
}

function speciesKind(value: string | null | undefined): "cat" | "dog" | null {
  const raw = String(value ?? "").trim().toLocaleLowerCase();
  const folded = normalizeText(raw);
  if (["cat", "cats", "feline"].includes(folded) || /قط/.test(raw)) return "cat";
  if (["dog", "dogs", "canine"].includes(folded) || /كلب/.test(raw)) return "dog";
  return null;
}

function isMedicationSpeciesCompatible(medication: Medication, petSpecies?: string | null): boolean {
  if (!medication.species?.length || !petSpecies?.trim()) return true;
  const patientKind = speciesKind(petSpecies);
  if (!patientKind) return true;
  return medication.species.some((value) => speciesKind(value) === patientKind);
}

export default function DrugEyeProductLinks({
  results,
  language,
  darkMode,
  medications,
  petSpecies,
  weightKg,
  onAddMedication,
  onAddBsavaDraft,
  onAddManualDraft,
}: Props) {
  const ar = language === "ar";
  const [clinicId, setClinicId] = useState("");
  const [savedLinks, setSavedLinks] = useState<Record<string, SavedProductLink>>({});
  const [linkStorageError, setLinkStorageError] = useState("");
  const [editingKey, setEditingKey] = useState("");
  const [selectedVetraMedicationId, setSelectedVetraMedicationId] = useState("");
  const [selectedBsavaDrugId, setSelectedBsavaDrugId] = useState("");
  const [bsavaSearch, setBsavaSearch] = useState("");
  const [bsavaDrugs, setBsavaDrugs] = useState<BsavaDrug[]>([]);
  const [bsavaLoading, setBsavaLoading] = useState(false);
  const [bsavaLoadError, setBsavaLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [dosePanelKey, setDosePanelKey] = useState("");
  const [doseOptionByProduct, setDoseOptionByProduct] = useState<Record<string, number>>({});
  const [manualDoseKey, setManualDoseKey] = useState("");
  const [manualDoseForms, setManualDoseForms] = useState<Record<string, { dose: string; route: string; frequency: string; duration: string; instructions: string }>>({});
  const bsavaPromiseRef = useRef<Promise<BsavaDrug[]> | null>(null);
  const editorKeyRef = useRef("");

  const productKeys = useMemo(
    () => [...new Set(results.map((result) => getProductKey(result)))],
    [results],
  );
  const productKeySignature = productKeys.join("\n");

  useEffect(() => {
    if (!productKeys.length) return;
    let cancelled = false;
    setLinkStorageError("");

    void (async () => {
      try {
        const context = await getClinicContext();
        const db = await getClinicDb();
        if (cancelled) return;
        setClinicId(context.clinic_id);
        const { data, error } = await db
          .from("clinic_drug_product_links")
          .select(SELECT_FIELDS)
          .eq("clinic_id", context.clinic_id)
          .in("product_key", productKeys);
        if (error) throw error;
        if (cancelled) return;

        const rows = (data ?? []) as unknown as SavedProductLink[];
        setSavedLinks((current) => {
          const next = { ...current };
          for (const key of productKeys) delete next[key];
          for (const row of rows) next[row.product_key] = row;
          return next;
        });
      } catch (error) {
        if (cancelled) return;
        setLinkStorageError(
          error instanceof Error && error.message
            ? error.message
            : (ar ? "تعذر تحميل روابط الأدوية المحفوظة." : "Could not load saved medication links."),
        );
      }
    })();

    return () => { cancelled = true; };
    // Keys are the only search-result fields needed by this lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeySignature]);

  async function loadBsavaCatalog(): Promise<BsavaDrug[]> {
    if (bsavaPromiseRef.current) return bsavaPromiseRef.current;
    setBsavaLoading(true);
    setBsavaLoadError("");
    bsavaPromiseRef.current = (async () => {
      try {
        const response = await fetch("/data/vetra-bsava-formulary-10e-a-enhanced.json", { cache: "force-cache" });
        if (!response.ok) throw new Error(`BSAVA catalog returned HTTP ${response.status}`);
        const data = await response.json() as BsavaCatalog;
        if (!Array.isArray(data.drugs)) throw new Error("BSAVA catalog format was unexpected.");
        const loaded = data.drugs.filter((drug) => Number.isFinite(Number(drug.id)) && Boolean(drug.name));
        setBsavaDrugs(loaded);
        return loaded;
      } catch (error) {
        bsavaPromiseRef.current = null;
        const message = error instanceof Error ? error.message : String(error);
        setBsavaLoadError(message);
        throw error;
      } finally {
        setBsavaLoading(false);
      }
    })();
    return bsavaPromiseRef.current;
  }

  const currentResultsByKey = useMemo(() => {
    const next: Record<string, DrugEyeResult> = {};
    for (const result of results) next[getProductKey(result)] = result;
    return next;
  }, [results]);

  // Load the local BSAVA index alongside DrugEye results so a clinician can use a
  // compatible protocol immediately without first opening the source-link editor.
  useEffect(() => {
    if (!results.length) return;
    void loadBsavaCatalog().catch(() => undefined);
    // Product identities are stable within one search result set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeySignature]);

  function openEditor(result: DrugEyeResult) {
    const key = getProductKey(result);
    const saved = savedLinks[key];
    editorKeyRef.current = key;
    setEditingKey(key);
    setSaveError("");
    setSaveNotice("");
    setSelectedVetraMedicationId(saved?.vetra_medication_id ?? (() => {
      const exactName = medications.filter((med) => normalizeText(med.name) === normalizeText(result.name) && isMedicationSpeciesCompatible(med, petSpecies));
      return exactName.length === 1 ? exactName[0].id : "";
    })());
    setSelectedBsavaDrugId(saved?.bsava_drug_id != null ? String(saved.bsava_drug_id) : "");
    setBsavaSearch(saved?.bsava_active_ingredient || result.activeIngredient || saved?.bsava_drug_name || result.name);

    void loadBsavaCatalog().then((catalog) => {
      if (editorKeyRef.current !== key || saved?.bsava_drug_id != null) return;
      const exact = catalog.filter((drug) => scoreBsavaDrug(result, drug) === 100);
      if (exact.length === 1) setSelectedBsavaDrugId(String(exact[0].id));
    }).catch(() => {
      // The product can still be saved and linked to VETRA even when the local BSAVA index fails to load.
    });
  }

  const editingResult = editingKey ? currentResultsByKey[editingKey] : undefined;
  const editingSavedLink = editingKey ? savedLinks[editingKey] : undefined;
  const rankedVetraMedications = useMemo(() => {
    if (!editingResult) return [];
    return medications
      .map((med) => ({ medication: med, score: scoreVetraMedication(editingResult, med) }))
      .sort((a, b) => b.score - a.score || a.medication.name.localeCompare(b.medication.name));
  }, [editingResult, medications]);

  const rankedBsavaDrugs = useMemo(() => {
    if (!editingResult) return [];
    const search = normalizeText(bsavaSearch);
    return bsavaDrugs
      .map((drug) => {
        const relationScore = scoreBsavaDrug(editingResult, drug);
        const searchText = normalizeText([
          drug.name,
          drug.active_ingredient,
          drug.trade_names,
          ...(drug.aliases ?? []),
        ].join(" "));
        const searchMatch = search ? searchText.includes(search) : false;
        return { drug, score: Math.max(relationScore, searchMatch ? 40 : 0) };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.drug.name.localeCompare(b.drug.name))
      .slice(0, 15);
  }, [editingResult, bsavaDrugs, bsavaSearch]);

  function calculateForMeasurement(measurement: BsavaDoseMeasurement, weight: number | null) {
    const basis = (measurement.basis || "").toLowerCase();
    if (basis === "kg" && weight && weight > 0) {
      return {
        min: Number((measurement.value_min * weight).toFixed(4)),
        max: Number((measurement.value_max * weight).toFixed(4)),
        unit: measurement.unit,
      };
    }
    if (basis === "dog" || basis === "cat" || basis === "animal") {
      return { min: measurement.value_min, max: measurement.value_max, unit: measurement.unit };
    }
    return null;
  }

  function formatDose(value: number) {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  }

  function unitToMg(value: number, unit: string) {
    const normalized = unit.toLowerCase();
    if (normalized === "μg" || normalized === "ug" || normalized === "µg" || normalized === "mcg") return value / 1000;
    if (normalized === "g") return value * 1000;
    return value;
  }

  function extractFrequency(text: string, expression: string, route: string) {
    const normalized = String(text || "").replace(/[–—]/g, "-");
    const chunks = normalized.split(/;|\n/).map((item) => item.trim()).filter(Boolean);
    const routeToken = route.toLowerCase();
    const routePattern = route ? new RegExp(String.raw`\b(?:${routeToken}|${route === "IV" ? "i\.v" : route === "IM" ? "i\.m" : route === "SC" ? "s\.c" : route === "PO" ? "p\.o" : routeToken})\.?\b`, "i") : null;
    const frequencyPattern = /\bq\d+(?:\s*[-–]\s*\d+)?(?:h|d|w|mo)\b|\b(?:once|twice|three times|four times)\s+(?:daily|weekly|monthly)\b|\b(?:daily|weekly|monthly)\b|\bprn\b|\bas needed\b/i;
    const ordered = [...chunks.filter((chunk) => expression && chunk.includes(expression)), ...chunks.filter((chunk) => !expression || !chunk.includes(expression))];
    for (const chunk of ordered) {
      if (routePattern && !routePattern.test(chunk) && !chunk.toLowerCase().includes(routeToken)) continue;
      const match = chunk.match(frequencyPattern);
      if (match?.[0]) return match[0].trim();
    }
    return normalized.match(frequencyPattern)?.[0]?.trim() || "";
  }


  function getBsavaOptions(result: DrugEyeResult, saved: SavedProductLink | undefined): BsavaDoseOption[] {
    if (!bsavaDrugs.length || (weightKg != null && (!Number.isFinite(weightKg) || weightKg <= 0))) return [];
    const savedDrug = saved?.bsava_drug_id != null
      ? bsavaDrugs.find((drug) => drug.id === saved.bsava_drug_id)
      : undefined;
    const exactIngredientMatches = savedDrug ? [savedDrug] : bsavaDrugs.filter((drug) =>
      normalizeText(drug.active_ingredient) &&
      normalizeText(drug.active_ingredient) === normalizeText(result.activeIngredient) &&
      isBsavaSpeciesCompatible(drug, petSpecies)
    );
    // Never guess between multiple BSAVA monographs with the same active ingredient.
    const candidates = savedDrug ? exactIngredientMatches : exactIngredientMatches.length === 1 ? exactIngredientMatches : [];
    const options: BsavaDoseOption[] = [];
    for (const drug of candidates) {
      if (!isBsavaSpeciesCompatible(drug, petSpecies)) continue;
      (drug.protocols ?? []).forEach((protocol, protocolIndex) => {
        if (!isProtocolSpeciesCompatible(protocol, petSpecies)) return;
        (protocol.dose_measurements ?? []).forEach((measurement, measurementIndex) => {
          const calculated = calculateForMeasurement(measurement, weightKg);
          // A kg-based protocol remains selectable without a weight so the UI can
          // explicitly ask for the missing weight rather than falling back silently.
          if (!calculated && (measurement.basis || "").toLowerCase() !== "kg") return;
          const measurementRoutes = measurement.routes?.length ? measurement.routes : [];
          const protocolRoutes = protocol.routes?.length ? protocol.routes : [];
          const routes = measurementRoutes.length
            ? measurementRoutes.filter((route) => !protocolRoutes.length || protocolRoutes.includes(route))
            : protocolRoutes;
          if (measurementRoutes.length && protocolRoutes.length && routes.length === 0) return;
          for (const route of (routes.length ? routes : [""])) {
            const concentration = getExplicitDrugEyeConcentrationMgPerMl(result);
            const volumeMin = calculated && concentration ? Number((unitToMg(calculated.min, calculated.unit) / concentration).toFixed(4)) : null;
            const volumeMax = calculated && concentration ? Number((unitToMg(calculated.max, calculated.unit) / concentration).toFixed(4)) : null;
            const displayDose = !calculated
              ? "—"
              : volumeMin != null
                ? `${formatDose(volumeMin)}${volumeMax != null && volumeMax !== volumeMin ? `–${formatDose(volumeMax)}` : ""}`
                : calculated.min === calculated.max
                  ? formatDose(calculated.min)
                  : `${formatDose(calculated.min)}–${formatDose(calculated.max)}`;
            const displayUnit = volumeMin != null ? "mL" : calculated?.unit || measurement.unit;
            const frequency = extractFrequency(protocol.dose_text || drug.dose_text || "", measurement.expression, route);
            options.push({
              drug, protocol, measurement, measurementIndex, protocolIndex, route,
              calculated, concentrationMgPerMl: concentration, volumeMin, volumeMax,
              displayDose, displayUnit, frequency,
              label: `${route || "Route unspecified"} · ${measurement.expression || `${measurement.value_min}–${measurement.value_max} ${measurement.unit}`} · ${protocol.dose_text || drug.dose_text || "BSAVA protocol"}`,
            });
          }
        });
      });
    }
    return options;
  }

  function isBsavaSpeciesCompatible(drug: BsavaDrug, patientSpecies?: string | null) {
    const patient = speciesKind(patientSpecies);
    if (!patient) return true;
    if (drug.species?.length && !drug.species.some((species) => speciesKind(species) === patient)) return false;
    return (drug.protocols ?? []).some((protocol) => isProtocolSpeciesCompatible(protocol, patientSpecies));
  }

  function isProtocolSpeciesCompatible(protocol: BsavaProtocol, patientSpecies?: string | null) {
    const patient = speciesKind(patientSpecies);
    if (!patient || !protocol.species?.length) return true;
    return protocol.species.some((species) => speciesKind(species) === patient);
  }

  function addBsavaDose(result: DrugEyeResult, option: BsavaDoseOption) {
    const measurement = option.measurement;
    if (!option.calculated) {
      setSaveError(ar ? "أدخل وزن الحيوان أولًا لحساب الجرعة من BSAVA." : "Enter the pet weight before calculating this BSAVA dose.");
      return;
    }
    const draft: FormularyVisitDraft = {
      id: crypto.randomUUID(),
      product_id: null,
      drugId: option.drug.id,
      drugName: result.name || option.drug.name,
      activeIngredient: option.drug.active_ingredient || result.activeIngredient || "",
      species: speciesKind(petSpecies) || option.drug.species?.[0] || "",
      route: option.route,
      doseUnit: measurement.unit,
      doseBasis: measurement.basis,
      doseExpression: measurement.expression,
      doseText: option.protocol.dose_text || option.drug.dose_text || "",
      sourcePage: Number(option.drug.source_page || 0),
      sourceMin: measurement.value_min,
      sourceMax: measurement.value_max,
      calculatedMin: option.calculated.min,
      calculatedMax: option.calculated.max,
      appliedDose: option.displayDose,
      adminDoseUnit: option.displayUnit,
      calculatedVolumeMin: option.volumeMin,
      calculatedVolumeMax: option.volumeMax,
      concentrationMgPerMl: option.concentrationMgPerMl,
      clinicConcentrationMgPerMl: null,
      frequency: option.frequency,
      autoCalculated: true,
    };
    const added = onAddBsavaDraft(draft);
    setDosePanelKey("");
    setSaveNotice(added
      ? (ar ? `تمت إضافة جرعة BSAVA لـ ${option.drug.name}؛ راجعها قبل اعتماد الكشف.` : `BSAVA dose added for ${option.drug.name}; review before saving the visit.`)
      : (ar ? "الجرعة نفسها مضافة بالفعل في الكشف." : "This exact BSAVA dose is already in the visit."));
  }

  function formFor(key: string) {
    return manualDoseForms[key] ?? { dose: "", route: "", frequency: "", duration: "", instructions: "" };
  }

  function updateManualForm(key: string, patch: Partial<ReturnType<typeof formFor>>) {
    setManualDoseForms((current) => ({ ...current, [key]: { ...formFor(key), ...patch } }));
  }

  function addManualDose(result: DrugEyeResult, key: string, bsavaDrugName: string | null) {
    const form = formFor(key);
    if (!form.dose.trim()) {
      setSaveError(ar ? "اكتب الجرعة ووحدتها أولًا." : "Enter the dose and unit first.");
      return;
    }
    const draft: ExternalMedicationDraft = {
      id: crypto.randomUUID(),
      product_id: null,
      productName: result.name,
      activeIngredient: result.activeIngredient,
      manufacturer: result.manufacturer,
      price: result.price,
      doseText: form.dose.trim(),
      route: form.route.trim(),
      frequency: form.frequency.trim(),
      duration: form.duration.trim(),
      instructions: form.instructions.trim(),
      weightKg: weightKg && Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null,
      source: "DrugEye",
      bsavaDrugName,
    };
    onAddManualDraft(draft);
    setManualDoseKey("");
    setManualDoseForms((current) => ({ ...current, [key]: { dose: "", route: "", frequency: "", duration: "", instructions: "" } }));
    setSaveError("");
    setSaveNotice(ar ? "تمت إضافة العلاج بجرعة يدوية؛ راجع الوحدات قبل الحفظ." : "Manual dose added; verify units before saving the visit.");
  }

  async function saveLink(result: DrugEyeResult) {
    const productKey = getProductKey(result);
    let activeClinicId = clinicId;
    if (!activeClinicId) {
      try {
        activeClinicId = (await getClinicContext()).clinic_id;
        setClinicId(activeClinicId);
      } catch {
        setSaveError(ar ? "لم يتم تحديد العيادة الحالية. أعد تحميل الصفحة وحاول مرة أخرى." : "The active clinic could not be identified. Reload the page and try again.");
        return;
      }
    }

    const selectedMedication = medications.find((med) => med.id === selectedVetraMedicationId) ?? null;
    const chosenBsava = bsavaDrugs.find((drug) => String(drug.id) === selectedBsavaDrugId) ?? null;
    if (selectedMedication && !isMedicationSpeciesCompatible(selectedMedication, petSpecies)) {
      setSaveError(ar ? "الدواء المختار غير مهيأ لنوع الحيوان الحالي." : "The selected VETRA medication is not configured for this species.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveNotice("");
    try {
      const db = await getClinicDb();
      const payload = {
        clinic_id: activeClinicId,
        product_key: productKey,
        drug_eye_product_id: result.id || null,
        drug_eye_name: result.name,
        drug_eye_active_ingredient: result.activeIngredient,
        drug_eye_category: result.category,
        drug_eye_manufacturer: result.manufacturer,
        drug_eye_price: result.price,
        vetra_medication_id: selectedMedication?.id ?? null,
        bsava_drug_id: chosenBsava?.id ?? null,
        bsava_drug_name: chosenBsava?.name ?? null,
        bsava_active_ingredient: chosenBsava?.active_ingredient ?? null,
        link_status: selectedMedication && chosenBsava ? "linked" : selectedMedication || chosenBsava ? "partial" : "unmatched",
        match_method: selectedMedication && normalizeText(selectedMedication.active_ingredient) === normalizeText(result.activeIngredient)
          ? "exact_active_ingredient_reviewed"
          : chosenBsava && normalizeText(chosenBsava.active_ingredient) === normalizeText(result.activeIngredient)
            ? "exact_active_ingredient_reviewed"
            : selectedMedication || chosenBsava ? "manual_review" : "saved_reference_only",
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from("clinic_drug_product_links")
        .upsert(payload, { onConflict: "clinic_id,product_key" })
        .select(SELECT_FIELDS)
        .single();
      if (error) throw error;
      const row = data as unknown as SavedProductLink;
      setSavedLinks((current) => ({ ...current, [productKey]: row }));
      setEditingKey("");
      editorKeyRef.current = "";
      setSaveNotice(ar ? "تم حفظ الربط. سيظهر تلقائيًا في عمليات البحث القادمة." : "Link saved. It will appear automatically in future searches.");
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : (ar ? "فشل حفظ الربط." : "Failed to save the link."));
    } finally {
      setSaving(false);
    }
  }

  const basePanel = darkMode ? "border-slate-700 bg-slate-950/70" : "border-slate-200 bg-white";
  const inputClass = `w-full min-w-0 rounded-lg border px-2.5 py-2 text-xs outline-none focus:border-blue-500 ${darkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`;
  const smallButton = `rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${darkMode ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`;

  return (
    <div className="space-y-2">
      {linkStorageError && (
        <div role="status" className={`rounded-lg border px-3 py-2 text-xs ${darkMode ? "border-amber-900 bg-amber-950/30 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <div className="font-semibold">{ar ? "تعذر تحميل روابط الأدوية المحفوظة" : "Could not load saved medication links"}</div>
          <div className="mt-1">{ar ? "تأكد من تشغيل ملف SQL المرفق على قاعدة بيانات العيادة ومن صلاحيات الوصول. البحث المحلي وDrugEye يظلان متاحين." : "Confirm the included SQL migration was run on the clinic database and access policies allow the active clinic. Local and DrugEye search remain available."}</div>
          <div className="mt-1 break-words opacity-80">{linkStorageError}</div>
        </div>
      )}
      {saveNotice && (
        <div role="status" className={`rounded-lg px-3 py-2 text-xs ${darkMode ? "bg-emerald-950/40 text-emerald-200" : "bg-emerald-50 text-emerald-800"}`}>{saveNotice}</div>
      )}

      {results.map((result) => {
        const key = getProductKey(result);
        const saved = savedLinks[key];
        const linkedMedication = saved?.vetra_medication_id
          ? medications.find((med) => med.id === saved.vetra_medication_id) ?? null
          : null;
        const canAddLinkedMedication = Boolean(linkedMedication && isMedicationSpeciesCompatible(linkedMedication, petSpecies));
        const isEditing = editingKey === key;
        const bsavaDoseOptions = getBsavaOptions(result, saved);
        const linkedBsavaCandidate = saved?.bsava_drug_id != null ? bsavaDrugs.find((drug) => drug.id === saved.bsava_drug_id) : undefined;
        const availableBsavaDrug = bsavaDoseOptions[0]?.drug ?? (linkedBsavaCandidate && isBsavaSpeciesCompatible(linkedBsavaCandidate, petSpecies) ? linkedBsavaCandidate : undefined);
        const isDosePanelOpen = dosePanelKey === key;
        const isManualPanelOpen = manualDoseKey === key;
        const selectedDoseOptionIndex = doseOptionByProduct[key] ?? 0;
        const selectedDoseOption = bsavaDoseOptions[selectedDoseOptionIndex] ?? bsavaDoseOptions[0];

        return (
          <div key={key} className={`rounded-xl border p-3 ${darkMode ? "border-slate-800 bg-slate-900/70" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${darkMode ? "text-slate-100" : "text-slate-900"}`}>{result.name}</div>
                {result.activeIngredient && <div className="mt-1 text-xs text-slate-500">{result.activeIngredient}</div>}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  {result.manufacturer && <span>{result.manufacturer}</span>}
                  {result.category && <span>{result.category}</span>}
                </div>
              </div>
              {result.price && <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">{result.price}</span>}
            </div>

            {saved && (
              <div className={`mt-2 space-y-1 rounded-lg px-2.5 py-2 text-[11px] ${darkMode ? "bg-slate-950/70 text-slate-300" : "bg-slate-50 text-slate-700"}`}>
                {linkedMedication
                  ? <div><span className="font-semibold text-emerald-600">VETRA:</span> {linkedMedication.name}</div>
                  : saved.vetra_medication_id
                    ? <div className="text-amber-600">{ar ? "الدواء المحلي المرتبط غير متاح حاليًا." : "The linked VETRA medication is no longer available."}</div>
                    : <div className="text-slate-500">{ar ? "لا يوجد ربط بمكتبة VETRA بعد." : "Not linked to a VETRA medication."}</div>}
                {saved.bsava_drug_name && <div><span className="font-semibold text-sky-600">BSAVA:</span> {saved.bsava_drug_name}</div>}
                {!saved.vetra_medication_id && !saved.bsava_drug_id && <div className="text-slate-500">{ar ? "محفوظ كمرجع خارجي فقط." : "Saved as an external reference only."}</div>}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canAddLinkedMedication && linkedMedication && (
                <button type="button" onClick={() => onAddMedication(linkedMedication.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">
                  {ar ? "+ إضافة للعلاج" : "+ Add to treatment"}
                </button>
              )}
              {linkedMedication && !canAddLinkedMedication && (
                <span className="text-[11px] text-amber-600">{ar ? "الدواء المرتبط غير مهيأ لهذا النوع." : "Linked medication is not configured for this species."}</span>
              )}
              {bsavaDoseOptions.length > 0 && (
                <button type="button" onClick={() => { setDosePanelKey(isDosePanelOpen ? "" : key); setManualDoseKey(""); setSaveError(""); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">
                  {ar ? "حساب جرعة BSAVA" : "Calculate BSAVA dose"}
                </button>
              )}
              <button type="button" onClick={() => { setManualDoseKey(isManualPanelOpen ? "" : key); setDosePanelKey(""); setSaveError(""); }} className={smallButton}>
                {isManualPanelOpen ? (ar ? "إغلاق الجرعة اليدوية" : "Close manual dose") : (ar ? "جرعة يدوية" : "Manual dose")}
              </button>
              <button type="button" onClick={() => isEditing ? (setEditingKey(""), editorKeyRef.current = "") : openEditor(result)} className={smallButton}>
                {isEditing ? (ar ? "إغلاق الربط" : "Close link") : saved ? (ar ? "تعديل الربط" : "Link settings") : (ar ? "ربط المصادر" : "Link sources")}
              </button>
            </div>

            {!bsavaLoading && bsavaDrugs.length > 0 && bsavaDoseOptions.length === 0 && (
              <div className={`mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-5 ${darkMode ? "bg-amber-950/25 text-amber-200" : "bg-amber-50 text-amber-800"}`}>
                {ar ? "لم يظهر بروتوكول BSAVA واحد مؤكد ومناسب تلقائيًا لهذا المنتج ونوع الحيوان. اربط مرجعًا يدويًا أو أدخل جرعة الطبيب." : "No single confirmed, species-compatible BSAVA protocol was found for this product. Link a reference manually or enter the clinician's dose."}
              </div>
            )}

            {isDosePanelOpen && (
              <div className={`mt-3 space-y-2 rounded-xl border p-3 ${basePanel}`}>
                <div className="text-xs font-bold">{ar ? `جرعة BSAVA — وزن الحيوان الحالي: ${weightKg || "—"} كجم` : `BSAVA dose — current animal weight: ${weightKg || "—"} kg`}</div>
                {selectedDoseOption && !selectedDoseOption.calculated ? (
                  <div className="text-xs text-amber-600">{ar ? "أدخل وزن الحيوان أولًا لحساب الجرعة المرتبطة بالوزن." : "Enter the pet's weight first to calculate a weight-based dose."}</div>
                ) : bsavaDoseOptions.length > 1 ? (
                  <select className={inputClass} value={String(selectedDoseOptionIndex)} onChange={(event) => setDoseOptionByProduct((current) => ({ ...current, [key]: Number(event.target.value) }))}>
                    {bsavaDoseOptions.map((option, index) => (
                      <option key={`${option.drug.id}-${option.protocolIndex}-${option.measurementIndex}-${option.route}-${index}`} value={String(index)}>{option.label}</option>
                    ))}
                  </select>
                ) : null}
                {selectedDoseOption && selectedDoseOption.calculated && (
                  <div className={`rounded-lg px-3 py-2 text-xs ${darkMode ? "bg-slate-900 text-slate-200" : "bg-slate-50 text-slate-700"}`}>
                    <div className="font-bold">{selectedDoseOption.drug.name}</div>
                    <div className="mt-1">{ar ? "الجرعة المحسوبة:" : "Calculated dose:"} {selectedDoseOption.displayDose} {selectedDoseOption.displayUnit}{selectedDoseOption.route ? ` · ${selectedDoseOption.route}` : ""}{selectedDoseOption.frequency ? ` · ${selectedDoseOption.frequency}` : ""}</div>
                    <div className="mt-1 whitespace-pre-wrap text-[11px] text-slate-500">{selectedDoseOption.protocol.dose_text || selectedDoseOption.measurement.expression}</div>
                    <div className="mt-1 text-[11px] text-amber-600">{ar ? "راجع الاستطباب والطريق والجرعة قبل اعتمادها؛ الحساب لا يختار التشخيص بدل الطبيب." : "Review indication, route, and dose before use; calculation does not select the indication for you."}</div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={!selectedDoseOption || !selectedDoseOption.calculated} onClick={() => selectedDoseOption && addBsavaDose(result, selectedDoseOption)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{ar ? "إضافة الجرعة المحسوبة" : "Add calculated dose"}</button>
                  <button type="button" onClick={() => { setDosePanelKey(""); setManualDoseKey(key); }} className={smallButton}>{ar ? "اكتب الجرعة يدويًا" : "Enter dose manually"}</button>
                </div>
              </div>
            )}

            {isManualPanelOpen && (
              <div className={`mt-3 space-y-2 rounded-xl border p-3 ${basePanel}`}>
                <div className="text-xs font-bold">{ar ? "جرعة يدوية يحددها الطبيب" : "Clinician-entered dose"}</div>
                <div className="text-[11px] leading-5 text-slate-500">{ar ? "لن يحسب VETRA الجرعة من بيانات DrugEye وحدها. اكتب الجرعة ووحدتها بوضوح؛ هذه الإضافة تُحفظ كنص علاجي مرجعي وليست إعداد دواء معتمدًا في المكتبة." : "VETRA will not infer a dose from DrugEye data alone. Enter the dose with explicit units; this is saved as treatment text, not as an approved library dose setting."}</div>
                <label className="block text-xs font-semibold">{ar ? "الجرعة + الوحدة (مطلوب)" : "Dose + unit (required)"}</label>
                <input className={inputClass} value={formFor(key).dose} onChange={(event) => updateManualForm(key, { dose: event.target.value })} placeholder={ar ? "مثال: 0.2 mL لكل جرعة أو 5 mg/kg" : "e.g. 0.2 mL per dose or 5 mg/kg"} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div><label className="mb-1 block text-[11px]">{ar ? "طريق الإعطاء" : "Route"}</label><input className={inputClass} value={formFor(key).route} onChange={(event) => updateManualForm(key, { route: event.target.value })} placeholder={ar ? "فموي / وريدي / موضعي" : "Oral / IV / topical"} /></div>
                  <div><label className="mb-1 block text-[11px]">{ar ? "التكرار" : "Frequency"}</label><input className={inputClass} value={formFor(key).frequency} onChange={(event) => updateManualForm(key, { frequency: event.target.value })} placeholder={ar ? "مثال: كل 12 ساعة" : "e.g. every 12 hours"} /></div>
                  <div><label className="mb-1 block text-[11px]">{ar ? "المدة" : "Duration"}</label><input className={inputClass} value={formFor(key).duration} onChange={(event) => updateManualForm(key, { duration: event.target.value })} placeholder={ar ? "مثال: 5 أيام" : "e.g. 5 days"} /></div>
                  <div><label className="mb-1 block text-[11px]">{ar ? "تعليمات إضافية" : "Instructions"}</label><input className={inputClass} value={formFor(key).instructions} onChange={(event) => updateManualForm(key, { instructions: event.target.value })} placeholder={ar ? "اختياري" : "Optional"} /></div>
                </div>
                {saveError && manualDoseKey === key && <div className="text-xs text-rose-600">{saveError}</div>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => addManualDose(result, key, availableBsavaDrug?.name || saved?.bsava_drug_name || null)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">{ar ? "إضافة الجرعة اليدوية للكشف" : "Add manual dose to visit"}</button>
                  <button type="button" onClick={() => { setManualDoseKey(""); setSaveError(""); }} className={smallButton}>{ar ? "إلغاء" : "Cancel"}</button>
                </div>
              </div>
            )}

            {isEditing && editingResult && (
              <div className={`mt-3 space-y-3 rounded-xl border p-3 ${basePanel}`}>
                <div>
                  <div className="text-xs font-bold">{ar ? "ربط المنتج مرة واحدة" : "Link this product once"}</div>
                  <div className="mt-1 text-[11px] leading-5 text-slate-500">{ar ? "التطابق حسب المادة الفعالة اقتراح فقط؛ راجع التركيز والشكل الصيدلي قبل الحفظ. لو المصدر مش موجود، اتركه بدون ربط." : "Ingredient matches are suggestions only. Check strength and formulation before saving; leave a source unlinked if no safe match exists."}</div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold">{ar ? "دواء مكتبة VETRA" : "VETRA library medication"}</label>
                  <select className={inputClass} value={selectedVetraMedicationId} onChange={(event) => setSelectedVetraMedicationId(event.target.value)}>
                    <option value="">{ar ? "لا يوجد تطابق — احفظ كمرجع فقط" : "No match — save as reference only"}</option>
                    {rankedVetraMedications.map(({ medication, score }) => (
                      <option key={medication.id} value={medication.id}>
                        {score === 100 ? "✓ Exact name · " : score === 90 ? "● Same ingredient · " : ""}{medication.name}{medication.active_ingredient ? ` — ${medication.active_ingredient}` : ""}{medication.concentration != null ? ` · ${medication.concentration} ${medication.concentration_unit || ""}` : ""}{medication.species?.length ? ` (${medication.species.join("/")})` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedVetraMedicationId && (() => {
                    const selected = medications.find((med) => med.id === selectedVetraMedicationId);
                    if (selected && !isMedicationSpeciesCompatible(selected, petSpecies)) {
                      return <div className="text-[11px] text-rose-600">{ar ? "تحذير: إعدادات هذا الدواء لا تشمل نوع الحيوان الحالي." : "Warning: this medication's settings do not include the current species."}</div>;
                    }
                    if (selected && normalizeText(selected.active_ingredient) === normalizeText(editingResult.activeIngredient) && normalizeText(selected.name) !== normalizeText(editingResult.name)) {
                      return <div className="text-[11px] text-amber-600">{ar ? "المادة الفعالة متطابقة، لكن راجع التركيز والشكل الصيدلي قبل الحفظ." : "Same active ingredient; verify strength and dosage form before saving."}</div>;
                    }
                    return null;
                  })()}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold">{ar ? "مرجع BSAVA (اختياري)" : "BSAVA reference (optional)"}</label>
                  <input
                    className={inputClass}
                    value={bsavaSearch}
                    onChange={(event) => setBsavaSearch(event.target.value)}
                    placeholder={ar ? "البحث باسم المادة الفعالة أو المرجع…" : "Search ingredient or reference…"}
                    autoComplete="off"
                  />
                  <select className={inputClass} value={selectedBsavaDrugId} onChange={(event) => setSelectedBsavaDrugId(event.target.value)} disabled={bsavaLoading || !bsavaDrugs.length}>
                    <option value="">{bsavaLoading ? (ar ? "تحميل فهرس BSAVA…" : "Loading BSAVA index…") : (ar ? "لا يوجد مرجع مناسب / اتركه بدون ربط" : "No matching reference / leave unlinked")}</option>
                    {rankedBsavaDrugs.map(({ drug, score }) => (
                      <option key={drug.id} value={String(drug.id)}>
                        {score === 100 ? "✓ " : ""}{drug.name} — {drug.active_ingredient || ""}{drug.species?.length ? ` (${speciesLabel(drug.species, language)})` : ""}
                      </option>
                    ))}
                  </select>
                  {bsavaLoadError && <div className="text-[11px] text-amber-600">{ar ? "تعذر تحميل فهرس BSAVA؛ تقدر تحفظ ربط VETRA فقط." : "Could not load the local BSAVA index; you can still save a VETRA link."}</div>}
                  {!bsavaLoading && bsavaDrugs.length > 0 && rankedBsavaDrugs.length === 0 && <div className="text-[11px] text-slate-500">{ar ? "لم يظهر تطابق واضح؛ لم نربط مرجعًا تلقائيًا." : "No clear matching reference; none was linked automatically."}</div>}
                </div>

                {saveError && <div role="alert" className="rounded-lg bg-rose-500/10 px-2.5 py-2 text-xs text-rose-600">{saveError}</div>}
                {saveNotice && <div role="status" className="rounded-lg bg-emerald-500/10 px-2.5 py-2 text-xs text-emerald-700">{saveNotice}</div>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={saving || Boolean(linkStorageError)} onClick={() => void saveLink(editingResult)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {saving ? (ar ? "جاري الحفظ…" : "Saving…") : (ar ? "حفظ الربط" : "Save link")}
                  </button>
                  <button type="button" disabled={saving} onClick={() => { setEditingKey(""); editorKeyRef.current = ""; }} className={smallButton}>{ar ? "إلغاء" : "Cancel"}</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
