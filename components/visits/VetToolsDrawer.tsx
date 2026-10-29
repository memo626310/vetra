"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Language } from "./new-visit-types";

export type VetTool = "common" | "bsava" | "drugeye";

type Props = {
  language: Language;
  darkMode: boolean;
  children: (activeTool: VetTool) => ReactNode;
  onOpenChange: (open: boolean) => void;
};

export default function VetToolsDrawer({ language, darkMode, children, onOpenChange }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [activeTool, setActiveTool] = useState<VetTool>("common");
  const [collapsed, setCollapsed] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const isAr = language === "ar";
  const tools = [
    { id: "bsava", label: "BSAVA", icon: "book", description: isAr ? "مرجع الجرعات البيطرية" : "Veterinary formulary", color: "text-emerald-600 dark:text-emerald-300", fill: "bg-emerald-500/10" },
    { id: "drugeye", label: "DrugEye", icon: "search", description: isAr ? "بحث الأدوية" : "Medication search", color: "text-sky-600 dark:text-sky-300", fill: "bg-sky-500/10" },
    { id: "common", label: "Common Conditions", icon: "cross", description: isAr ? "بروتوكولات الأمراض الشائعة" : "Common condition protocols", color: "text-violet-600 dark:text-violet-300", fill: "bg-violet-500/10" },
  ] as const;

  function scheduleMobileCollapse() {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    collapseTimerRef.current = setTimeout(() => {
      if (!dialogRef.current?.open) setCollapsed(true);
    }, 3000);
  }

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 639px)");
    const schedule = () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      if (!mobile.matches) return;
      collapseTimerRef.current = setTimeout(() => {
        if (!dialogRef.current?.open) setCollapsed(true);
      }, 3000);
    };
    schedule();
    mobile.addEventListener("change", schedule);
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      mobile.removeEventListener("change", schedule);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    // Open after React commits the selected tool and its content. Calling
    // showModal during the click can focus the previous, empty dialog.
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  function openDrawer(tool: VetTool) {
    if (!dialogRef.current) return;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    setHasOpened(true);
    setActiveTool(tool);
    setOpen(true);
    onOpenChange(true);
  }

  function handleClose() {
    setOpen(false);
    onOpenChange(false);
    scheduleMobileCollapse();
  }

  return <>
    <button type="button" onClick={() => { setCollapsed(false); scheduleMobileCollapse(); }} aria-label={isAr ? "إظهار Vet Tools" : "Expand Vet Tools"} aria-expanded={false} aria-controls={`${id}-rail`} className={`${collapsed ? "flex sm:hidden" : "hidden"} fixed end-0 top-1/2 z-40 h-12 w-8 -translate-y-1/2 items-center justify-center rounded-s-xl border border-cyan-500/30 shadow-md ${darkMode ? "bg-[#15252C] text-cyan-300" : "bg-white text-cyan-700"}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d={isAr ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} /></svg>
    </button>
    <section id={`${id}-rail`} data-vet-tools-expanded={!collapsed} aria-label="Vet Tools" onPointerDown={scheduleMobileCollapse} onFocusCapture={scheduleMobileCollapse} className={`${collapsed ? "hidden sm:block" : ""} fixed end-1 top-1/2 z-40 max-h-[calc(100dvh-2rem)] w-[4.25rem] -translate-y-1/2 overflow-y-auto rounded-2xl border p-1.5 shadow-lg sm:end-3 sm:w-20 sm:p-2 ${darkMode ? "border-cyan-500/20 bg-gradient-to-b from-[#15252C] via-[#181B21] to-[#1E1C2A]" : "border-cyan-200/70 bg-gradient-to-b from-cyan-50 via-white to-violet-50"}`}>
      <div className="flex flex-col gap-3">
        <div className="flex shrink-0 flex-col items-center gap-2 border-b border-cyan-500/15 pb-3 text-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M4 7h16v13H4zM9 13h6m-3-3v6" /></svg>
          </span>
          <h2 className={`text-[10px] font-black sm:text-[11px] ${darkMode ? "text-white" : "text-slate-900"}`} dir="ltr">Vet Tools</h2>
        </div>
        <nav aria-label={isAr ? "أدوات الكشف" : "Visit tools"} className="grid min-w-0 grid-cols-1 gap-2">
          {tools.map((tool) => <button key={tool.id} type="button" onClick={() => openDrawer(tool.id)} title={`${tool.label} — ${tool.description}`} aria-label={tool.label} aria-haspopup="dialog" aria-expanded={open && activeTool === tool.id} aria-controls={id} className={`group flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2.5 text-center transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 ${darkMode ? "border-white/10 bg-white/[0.03] hover:border-cyan-500/40 hover:bg-white/[0.06]" : "border-white bg-white/90 shadow-sm hover:border-cyan-200 hover:shadow-md"}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tool.fill} ${tool.color}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-[18px] w-[18px]">{tool.icon === "book" ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v15M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z" /> : tool.icon === "search" ? <><circle cx="10.5" cy="10.5" r="6.5" /><path strokeLinecap="round" d="m16 16 4 4" /></> : <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z" />}</svg>
            </span>
            <span dir="ltr" className={`block max-w-full text-[9px] font-bold leading-3 sm:text-[10px] ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{tool.label}</span>
          </button>)}
        </nav>
      </div>
    </section>
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={`${id}-title`}
      dir={isAr ? "rtl" : "ltr"}
      onClose={handleClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialogRef.current?.close();
      }}
      className={`fixed inset-y-0 start-auto end-0 m-0 h-dvh max-h-dvh w-full max-w-full overflow-hidden border-0 p-0 shadow-2xl backdrop:bg-black/60 sm:w-[min(42rem,calc(100vw-2rem))] ${darkMode ? "bg-[#13161B] text-white" : "bg-white text-slate-900"}`}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className={`flex shrink-0 items-start justify-between gap-3 border-b p-4 sm:p-5 ${darkMode ? "border-white/10" : "border-slate-200"}`}>
          <div>
            <h2 id={`${id}-title`} className="text-xl font-black" dir="ltr">Vet Tools</h2>
            <p className="mt-1 text-xs text-slate-500">BSAVA · DrugEye · Common Conditions</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label={isAr ? "إغلاق Vet Tools" : "Close Vet Tools"} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${darkMode ? "hover:bg-white/10" : "hover:bg-slate-100"}`}>×</button>
        </header>
        <nav aria-label={isAr ? "اختيار أداة" : "Choose a tool"} className={`grid shrink-0 grid-cols-3 gap-1 border-b p-2 ${darkMode ? "border-white/10" : "border-slate-200"}`}>
          {tools.map((tool) => <button key={tool.id} type="button" aria-pressed={activeTool === tool.id} onClick={() => setActiveTool(tool.id)} className={`min-h-11 rounded-lg px-2 py-2 text-xs font-bold transition ${activeTool === tool.id ? "bg-cyan-600 text-white" : darkMode ? "text-slate-400 hover:bg-white/5" : "text-slate-600 hover:bg-slate-100"}`}>{tool.label}</button>)}
        </nav>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-5">
          {hasOpened && children(activeTool)}
        </div>
      </div>
    </dialog>
  </>;
}
