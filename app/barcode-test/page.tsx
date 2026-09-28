"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeTestPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const [scanning, setScanning] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState("");
  const [manualCode, setManualCode] = useState("");

  async function startScanner() {
    setError("");
    setBarcode("");
    setScanning(true);

    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      const devices =
        await BrowserMultiFormatReader.listVideoInputDevices();

      if (!devices.length) {
        throw new Error("No camera found");
      }

      const selectedDevice = devices[devices.length - 1];

      await reader.decodeFromVideoDevice(
        selectedDevice.deviceId,
        videoRef.current!,
        (result) => {
          if (result) {
            const value = result.getText();

            setBarcode(value);
            setScanning(false);

            reader.reset();
          }
        }
      );
    } catch (err) {
      console.error(err);
      setScanning(false);
      setError(
        "مش قادر أفتح الكاميرا. تأكد إنك سمحت للموقع باستخدام الكاميرا."
      );
    }
  }

  function stopScanner() {
    try {
      readerRef.current?.reset();
    } catch {}

    setScanning(false);
  }

  function useManualCode() {
    const value = manualCode.trim();

    if (!value) return;

    setBarcode(value);
    setManualCode("");
  }

  useEffect(() => {
    return () => {
      try {
        readerRef.current?.reset();
      } catch {}
    };
  }, []);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#F7F8FA] px-5 py-10 text-slate-900"
    >
      <div className="mx-auto max-w-xl">

        {/* HEADER */}

        <div className="mb-8">
          <a
            href="/"
            className="text-sm font-bold text-slate-400 hover:text-blue-600"
          >
            ← الرئيسية
          </a>

          <h1 className="mt-5 text-3xl font-black">
            تجربة قارئ الباركود
          </h1>

          <p className="mt-2 text-slate-500">
            تجربة الكاميرا وقراءة الباركود قبل دمجه مع المخزون
          </p>
        </div>

        {/* SCANNER */}

        <section className="overflow-hidden rounded-[28px] bg-white shadow-sm">

          <div className="relative aspect-square bg-black">

            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              muted
              playsInline
            />

            {!scanning && !barcode && (
              <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                <div>
                  <div className="mb-4 text-6xl">📷</div>

                  <p className="font-bold text-white">
                    اضغط فتح الكاميرا
                  </p>

                  <p className="mt-2 text-sm text-white/60">
                    ووجّه الكاميرا ناحية الباركود
                  </p>
                </div>
              </div>
            )}

            {scanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-40 w-72 rounded-2xl border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            )}

          </div>

          {/* CONTROLS */}

          <div className="p-6">

            {!scanning ? (
              <button
                onClick={startScanner}
                className="w-full rounded-2xl bg-slate-900 px-6 py-4 font-black text-white transition hover:bg-slate-800"
              >
                📷 فتح الكاميرا
              </button>
            ) : (
              <button
                onClick={stopScanner}
                className="w-full rounded-2xl bg-red-600 px-6 py-4 font-black text-white transition hover:bg-red-700"
              >
                إيقاف الكاميرا
              </button>
            )}

            {/* ERROR */}

            {error && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-center font-bold text-red-600">
                {error}
              </div>
            )}

            {/* RESULT */}

            {barcode && (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">

                <p className="text-sm font-bold text-emerald-600">
                  تم قراءة الباركود ✓
                </p>

                <div
                  dir="ltr"
                  className="mt-2 break-all text-center text-2xl font-black text-emerald-900"
                >
                  {barcode}
                </div>

                <button
                  onClick={() => {
                    setBarcode("");
                    startScanner();
                  }}
                  className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white"
                >
                  قراءة باركود آخر
                </button>

              </div>
            )}

            {/* MANUAL */}

            <div className="mt-8 border-t border-slate-100 pt-6">

              <p className="mb-3 text-sm font-bold text-slate-600">
                أو أدخل الباركود يدويًا
              </p>

              <div className="flex gap-2">

                <input
                  dir="ltr"
                  value={manualCode}
                  onChange={(e) =>
                    setManualCode(e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      useManualCode();
                    }
                  }}
                  placeholder="Barcode"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                />

                <button
                  onClick={useManualCode}
                  className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
                >
                  إضافة
                </button>

              </div>

            </div>

          </div>

        </section>

        {/* INFO */}

        <div className="mt-5 rounded-2xl bg-white p-5 text-sm text-slate-500 shadow-sm">

          <p className="font-bold text-slate-700">
            🧪 Prototype
          </p>

          <p className="mt-2">
            الرقم المقروء حاليًا لا يتم حفظه في قاعدة البيانات.
            دي مجرد تجربة للـ Barcode Scanner.
          </p>

        </div>

      </div>
    </main>
  );
}