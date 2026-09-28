"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeTestPage() {
  const [barcode, setBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  return (
    <main className="min-h-screen bg-gray-50 p-6 dark:bg-gray-950">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Barcode Scanner Test
          </h1>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            جرّب قراءة الباركود بالكاميرا أو اكتبه يدويًا.
          </p>

          <div className="mt-6 flex gap-3">
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="اكتب الباركود يدويًا"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
            />

            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
            >
              📷 Scan
            </button>
          </div>

          <div className="mt-6 rounded-xl bg-blue-50 p-4 dark:bg-blue-950/30">
            <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
              Result
            </div>
            <div className="mt-1 break-all text-xl font-bold text-gray-900 dark:text-white">
              {barcode || "—"}
            </div>
          </div>
        </div>
      </div>

      {scannerOpen && (
        <BarcodeScanner
          onScan={(value) => {
            setBarcode(value);
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </main>
  );
}

function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    let stopped = false;

    const stopCamera = () => {
      stopped = true;

      const video = videoRef.current;

      if (video?.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };

    async function startScanner() {
      try {
        const devices =
          await BrowserMultiFormatReader.listVideoInputDevices();

        if (!devices.length) {
          alert("لم يتم العثور على كاميرا");
          onClose();
          return;
        }

        const deviceId = devices[devices.length - 1]?.deviceId;

        if (!videoRef.current || stopped) return;

        reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result) => {
            if (!result || stopped) return;

            const value = result.getText().trim();
            if (!value) return;

            stopped = true;
            onScan(value);
            stopCamera();
          }
        );
      } catch (error) {
        console.error("Barcode scanner error:", error);
        alert("تعذر تشغيل الكاميرا. تأكد من السماح للموقع باستخدام الكاميرا.");
        onClose();
      }
    }

    startScanner();

    return () => {
      stopCamera();
      readerRef.current = null;
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div>
            <div className="font-bold text-gray-900 dark:text-white">
              Scan Barcode
            </div>
            <div className="text-xs text-gray-500">
              وجّه الكاميرا ناحية الباركود
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close scanner"
          >
            ✕
          </button>
        </div>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="h-80 w-full object-cover"
            autoPlay
            muted
            playsInline
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-32 w-80">
              <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-blue-500" />
              <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-blue-500" />
              <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-blue-500" />
              <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-blue-500" />
              <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-blue-500" />
            </div>
          </div>
        </div>

        <div className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          بمجرد قراءة الباركود، الكاميرا هتقف تلقائيًا.
        </div>
      </div>
    </div>
  );
}
