import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Visit } from "./new-visit-types";
import { formatDate, getDelta } from "./new-visit-utils";

export function WheelPicker({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  defaultValue,
  hint,
  darkMode,
}: {
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  hint: string;
  darkMode: boolean;
}) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const selectedIndexRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const dragStartY = useRef<number | null>(null);
  const dragDistance = useRef(0);

  const values = useMemo(() => {
    const count = Math.round((max - min) / step);
    return Array.from({ length: count + 1 }, (_, index) =>
      Number((min + index * step).toFixed(4))
    );
  }, [min, max, step]);

  const fallbackIndex = Math.max(0, Math.min(
    values.length - 1,
    Math.round((defaultValue - min) / step)
  ));

  const numericValue = value === "" ? null : Number(value);
  const selectedIndex =
    numericValue !== null && Number.isFinite(numericValue)
      ? Math.max(0, Math.min(values.length - 1, Math.round((numericValue - min) / step)))
      : fallbackIndex;

  selectedIndexRef.current = selectedIndex;
  onChangeRef.current = onChange;

  function commitIndex(nextIndex: number) {
    const clamped = Math.max(0, Math.min(values.length - 1, nextIndex));
    onChange(values[clamped].toFixed(step < 0.1 ? 2 : 1));
  }

  function moveBy(delta: number) {
    commitIndex(selectedIndex + delta);
  }

  useEffect(() => {
    const element = pickerRef.current;
    if (!element) return;

    const handleNativeWheel = (event: WheelEvent) => {
      // The picker owns the wheel. Prevent the document from scrolling.
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();

      const delta = event.deltaY > 0 ? 1 : -1;
      const nextIndex = Math.max(
        0,
        Math.min(values.length - 1, selectedIndexRef.current + delta)
      );

      selectedIndexRef.current = nextIndex;
      onChangeRef.current(
        values[nextIndex].toFixed(step < 0.1 ? 2 : 1)
      );
    };

    // Native non-passive listener is intentional here. React/browser scrolling
    // can otherwise remain active while the pointer is over the picker.
    element.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      element.removeEventListener("wheel", handleNativeWheel);
    };
  }, [step, values]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragStartY.current = event.clientY;
    dragDistance.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current === null) return;
    const delta = dragStartY.current - event.clientY;
    dragDistance.current += delta;
    dragStartY.current = event.clientY;

    const pixelsPerStep = 24;
    while (dragDistance.current >= pixelsPerStep) {
      moveBy(1);
      dragDistance.current -= pixelsPerStep;
    }
    while (dragDistance.current <= -pixelsPerStep) {
      moveBy(-1);
      dragDistance.current += pixelsPerStep;
    }
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStartY.current !== null) {
      dragStartY.current = null;
      dragDistance.current = 0;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const itemIndexes = [-2, -1, 0, 1, 2];

  return (
    <div
      ref={pickerRef}
      className={`relative select-none overflow-hidden rounded-2xl border ${
        darkMode
          ? "border-slate-700 bg-slate-950"
          : "border-slate-200 bg-slate-50"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      style={{ touchAction: "none", overscrollBehavior: "contain" }}
      role="spinbutton"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={numericValue ?? undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveBy(1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          moveBy(-1);
        }
      }}
    >
      <div
        className={`pointer-events-none absolute inset-x-2 top-1/2 z-10 h-12 -translate-y-1/2 rounded-xl border-2 ${
          darkMode ? "border-blue-500/60 bg-blue-500/10" : "border-blue-500/50 bg-blue-50/70"
        }`}
      />

      <div className="flex h-32 flex-col items-center justify-center gap-0 overflow-hidden">
        {itemIndexes.map((offset) => {
          const rawIndex = selectedIndex + offset;
          const index = Math.max(0, Math.min(values.length - 1, rawIndex));
          const isSelected = offset === 0;
          const displayValue =
            isSelected && numericValue === null ? "—" : values[index].toFixed(1);

          return (
            <div
              key={`${offset}-${index}`}
              className={`flex h-8 items-center justify-center leading-none transition-all duration-100 ${
                isSelected
                  ? darkMode
                    ? "text-2xl font-black text-white"
                    : "text-2xl font-black text-slate-900"
                  : darkMode
                  ? "text-sm font-medium text-slate-500"
                  : "text-sm font-medium text-slate-400"
              }`}
            >
              {displayValue}{isSelected && numericValue !== null ? ` ${unit}` : ""}
            </div>
          );
        })}
      </div>

      <div
        className={`border-t px-3 py-1.5 text-center text-[10px] font-medium ${
          darkMode
            ? "border-slate-800 text-slate-500"
            : "border-slate-200 text-slate-400"
        }`}
      >
        ↕ {hint}
      </div>
    </div>
  );
}

function MiniGraph({
  values,
  color,
  onPointClick,
  unit,
  darkMode,
  compact,
}: {
  values: {
    value: number;
    visit: Visit;
  }[];
  color: string;
  onPointClick: (visit: Visit) => void;
  unit: string;
  darkMode: boolean;
  compact?: boolean;
}) {
  if (values.length === 0) {
    return (
      <div
        className={`flex ${compact ? "h-10 sm:h-28" : "h-28"} items-center justify-center rounded-xl ${
          darkMode ? "bg-slate-800/60" : "bg-slate-50"
        }`}
      >
        <span
          className={`text-xs ${
            darkMode ? "text-slate-500" : "text-slate-400"
          }`}
        >
          No data
        </span>
      </div>
    );
  }

  const ordered = [...values].reverse();

  const numericValues = ordered.map((item) => item.value);

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);

  const range = max - min || 1;

  const width = 300;
  const height = 105;
  const paddingX = 14;
  const paddingY = 16;

  const points = ordered.map((item, index) => {
    const x =
      ordered.length === 1
        ? width / 2
        : paddingX +
          (index / (ordered.length - 1)) * (width - paddingX * 2);

    const normalized = (item.value - min) / range;

    const y =
      height -
      paddingY -
      normalized * (height - paddingY * 2);

    return {
      x,
      y,
      item,
    };
  });

  const path = points
    .map((point, index) =>
      index === 0
        ? `M ${point.x} ${point.y}`
        : `L ${point.x} ${point.y}`
    )
    .join(" ");

  return (
    <div className={`relative ${compact ? "h-10 sm:h-28" : "h-28"} w-full overflow-hidden rounded-xl`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="25"
          x2={width}
          y2="25"
          stroke={darkMode ? "#334155" : "#e2e8f0"}
          strokeWidth="1"
        />

        <line
          x1="0"
          y1="53"
          x2={width}
          y2="53"
          stroke={darkMode ? "#334155" : "#e2e8f0"}
          strokeWidth="1"
        />

        <line
          x1="0"
          y1="81"
          x2={width}
          y2="81"
          stroke={darkMode ? "#334155" : "#e2e8f0"}
          strokeWidth="1"
        />

        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point) => (
          <g key={point.item.visit.id}>
            <circle
              cx={point.x}
              cy={point.y}
              r="7"
              fill={darkMode ? "#0f172a" : "#ffffff"}
              stroke={color}
              strokeWidth="3"
              className="cursor-pointer transition-all duration-200 hover:scale-125"
              onClick={() => onPointClick(point.item.visit)}
            />

            <title>
              {point.item.value} {unit} —{" "}
              {formatDate(point.item.visit.visit_date, "en")}
            </title>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function VitalCard({
  title,
  icon,
  latest,
  previous,
  unit,
  color,
  values,
  onPointClick,
  darkMode,
  compact = false,
}: {
  title: string;
  icon: string;
  latest: number | null;
  previous: number | null;
  unit: string;
  color: string;
  values: {
    value: number;
    visit: Visit;
  }[];
  onPointClick: (visit: Visit) => void;
  darkMode: boolean;
  compact?: boolean;
}) {
  const delta = getDelta(latest, previous);

  return (
    <div
      className={`group rounded-2xl border ${compact ? "p-2 sm:p-4" : "p-4"} transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
        darkMode
          ? "border-slate-800 bg-slate-900 hover:border-slate-700"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className={`${compact ? "mb-1 sm:mb-3" : "mb-3"} flex items-start justify-between`}>
        <div>
          <div className="mb-0.5 flex items-center gap-1 sm:mb-1 sm:gap-2">
            <span className={`text-sm sm:text-lg ${compact ? "hidden sm:inline" : ""}`}>{icon}</span>

            <h3
              className={`${compact ? "text-[11px] sm:text-sm" : "text-sm"} font-semibold ${
                darkMode ? "text-slate-200" : "text-slate-700"
              }`}
            >
              {title}
            </h3>
          </div>

          <div className="flex items-baseline gap-1">
            <span
              className={`${compact ? "text-lg sm:text-xl" : "text-xl"} font-bold ${
                darkMode ? "text-white" : "text-slate-900"
              }`}
            >
              {latest !== null ? latest : "—"}
            </span>

            {latest !== null && (
              <span
                className={`text-xs ${
                  darkMode ? "text-slate-500" : "text-slate-400"
                }`}
              >
                {unit}
              </span>
            )}
          </div>
        </div>

        {delta !== null && (
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              Number(delta) > 0
                ? darkMode
                  ? "bg-emerald-950 text-emerald-400"
                  : "bg-emerald-50 text-emerald-600"
                : Number(delta) < 0
                ? darkMode
                  ? "bg-rose-950 text-rose-400"
                  : "bg-rose-50 text-rose-600"
                : darkMode
                ? "bg-slate-800 text-slate-400"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {delta}
          </span>
        )}
      </div>

      <MiniGraph
        values={values}
        color={color}
        onPointClick={onPointClick}
        unit={unit}
        darkMode={darkMode}
        compact={compact}
      />

      <div
        className={`${compact ? "hidden sm:flex" : "mt-2 flex"} mt-2 justify-between text-[10px] ${
          darkMode ? "text-slate-500" : "text-slate-400"
        }`}
      >
        <span>
          {previous !== null ? `Prev: ${previous}` : "No previous"}
        </span>

        <span>{values.length} readings</span>
      </div>
    </div>
  );
}

