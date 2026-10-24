"use client";

type Props = {
  ar?: boolean;
  darkMode?: boolean;
  loading?: boolean;
  compact?: boolean;
  onRefresh: () => void;
};

export default function ClinicCacheRefreshButton({
  ar = true,
  darkMode = false,
  loading = false,
  compact = false,
  onRefresh,
}: Props) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={loading}
      title={ar ? "مسح الكاش وتحميل أحدث البيانات" : "Clear cache and load the latest data"}
      aria-label={ar ? "تحديث الكاش" : "Refresh cache"}
      className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition sm:h-12 sm:gap-2 sm:rounded-2xl sm:px-3 sm:text-sm ${darkMode ? "border-white/[0.06] bg-[#181B21] text-slate-200 hover:bg-[#1D2128]" : "border-slate-100 bg-white text-slate-700 hover:bg-slate-50"} ${compact ? "sm:h-10 sm:rounded-xl sm:px-2.5" : ""} disabled:cursor-wait disabled:opacity-60`}
    >
      <span aria-hidden="true" className={loading ? "animate-spin" : ""}>↻</span>
      <span className={compact ? "hidden" : "hidden sm:inline"}>
        {loading ? (ar ? "جاري التحديث..." : "Refreshing...") : (ar ? "تحديث الكاش" : "Refresh cache")}
      </span>
    </button>
  );
}
