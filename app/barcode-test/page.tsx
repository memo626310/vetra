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

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    let stopped = false;
    let animationFrame = 0;
    let lastDetectTime = 0;
    let controls: { stop: () => void } | null = null;
    let stream: MediaStream | null = null;

    const stopCamera = () => {
      stopped = true;

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      try {
        controls?.stop();
      } catch {
        // ignore
      }

      controls = null;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      const video = videoRef.current;

      if (video?.srcObject) {
        const currentStream = video.srcObject as MediaStream;
        currentStream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };

    const applyCameraEnhancements = async (
      currentStream: MediaStream
    ) => {
      const track = currentStream.getVideoTracks()[0];

      if (!track) return;

      try {
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
          zoom?: {
            min: number;
            max: number;
            step?: number;
          };
        };

        const advanced: MediaTrackConstraintSet[] = [];

        if (capabilities.focusMode?.includes("continuous")) {
          advanced.push({
            focusMode: "continuous",
          } as MediaTrackConstraintSet);
        }

        /*
         * Zoom بسيط فقط لو الكاميرا بتدعمه.
         * الهدف إن الباركود الصغير يفضل مقروء من مسافة طبيعية،
         * من غير ما نقص الـ field of view بشكل مبالغ فيه.
         */
        if (capabilities.zoom) {
          const minZoom = capabilities.zoom.min;
          const maxZoom = capabilities.zoom.max;
          const targetZoom = Math.min(
            maxZoom,
            Math.max(minZoom, minZoom + 0.5)
          );

          if (targetZoom > minZoom) {
            advanced.push({
              zoom: targetZoom,
            } as MediaTrackConstraintSet);
          }
        }

        if (advanced.length) {
          await track.applyConstraints({ advanced });
        }
      } catch {
        // Focus/zoom controls are optional and unsupported on some devices.
      }
    };

    const getNativeBarcodeDetector = () => {
      const browserWindow = window as unknown as {
        BarcodeDetector?: new (options?: {
          formats?: string[];
        }) => {
          detect: (
            source: HTMLVideoElement
          ) => Promise<
            Array<{
              rawValue?: string;
            }>
          >;
        };
      };

      if (!browserWindow.BarcodeDetector) {
        return null;
      }

      try {
        return new browserWindow.BarcodeDetector({
          formats: [
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
            "itf",
            "codabar",
          ],
        });
      } catch {
        return null;
      }
    };

    async function startNativeScanner() {
      const detector = getNativeBarcodeDetector();

      if (!detector || !navigator.mediaDevices?.getUserMedia) {
        return false;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 60 },
          },
        });

        if (stopped || !videoRef.current) {
          stopCamera();
          return true;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        await applyCameraEnhancements(stream);

        const detectLoop = async (timestamp: number) => {
          if (stopped || !videoRef.current) return;

          animationFrame = requestAnimationFrame(detectLoop);

          if (timestamp - lastDetectTime < 45) return;
          lastDetectTime = timestamp;

          if (
            videoRef.current.readyState <
            HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            return;
          }

          try {
            const results = await detector.detect(
              videoRef.current
            );

            if (stopped) return;

            const value = results
              .map((item) => item.rawValue?.trim() || "")
              .find(Boolean);

            if (!value) return;

            stopped = true;
            onScanRef.current(value);
            stopCamera();
          } catch {
            // Keep scanning. Detection can fail on individual frames.
          }
        };

        animationFrame = requestAnimationFrame(detectLoop);
        return true;
      } catch (error) {
        console.warn(
          "Native barcode scanner unavailable:",
          error
        );

        stopCamera();
        return false;
      }
    }

    async function startZxingFallback() {
      try {
        const video = videoRef.current;

        if (!video || stopped) return;

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 40,
          delayBetweenScanSuccess: 200,
          tryPlayVideoTimeout: 5000,
        });

        readerRef.current = reader;

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 60 },
          },
        };

        controls = await reader.decodeFromConstraints(
          constraints,
          video,
          async (result) => {
            if (!result || stopped) return;

            const value = result.getText().trim();

            if (!value) return;

            stopped = true;
            onScanRef.current(value);
            stopCamera();
          }
        );

        if (stopped) return;

        const currentStream = video.srcObject as MediaStream | null;

        if (currentStream) {
          stream = currentStream;
          await applyCameraEnhancements(currentStream);
        }
      } catch (error) {
        console.error("Barcode scanner error:", error);
        stopCamera();
        onCloseRef.current();
      }
    }

    async function startScanner() {
      const nativeStarted = await startNativeScanner();

      if (stopped) return;

      if (!nativeStarted) {
        await startZxingFallback();
      }
    }

    void startScanner();

    return () => {
      stopCamera();
      readerRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div>
            <div className="font-bold text-gray-900 dark:text-white">
              Scan Barcode
            </div>

            <div className="text-xs text-gray-500">
              وجّه الكاميرا للباركود — مش لازم تقرّبه جدًا
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
          حرّك الموبايل بهدوء — الـ autofocus والـ scanner هيحاولوا يلقطوا
          الباركود حتى لو بعيد نسبيًا.
        </div>
      </div>
    </div>
  );
}

