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
    let nativeDetector: {
      detect: (
        source: CanvasImageSource
      ) => Promise<Array<{ rawValue?: string }>>;
    } | null = null;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;
    let zxingBusy = false;

    const sourceCanvas = document.createElement("canvas");
    const enhancedCanvas = document.createElement("canvas");
    const workCanvas = document.createElement("canvas");

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
          torch?: boolean;
        };

        const advanced: MediaTrackConstraintSet[] = [];

        if (capabilities.focusMode?.includes("continuous")) {
          advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        }

        // Mild optical/digital camera zoom only. Too much zoom can make
        // small/soft barcodes harder to decode.
        if (capabilities.zoom) {
          const minZoom = capabilities.zoom.min;
          const maxZoom = capabilities.zoom.max;
          const step = capabilities.zoom.step || 0.1;
          const targetZoom = Math.min(
            maxZoom,
            Math.max(minZoom, minZoom + Math.max(step, 0.5))
          );

          if (targetZoom > minZoom) {
            advanced.push({ zoom: targetZoom } as MediaTrackConstraintSet);
          }
        }

        if (advanced.length) {
          await track.applyConstraints({ advanced });
        }
      } catch {
        // Camera capabilities differ by device/browser.
      }
    };

    const getNativeBarcodeDetector = () => {
      const browserWindow = window as unknown as {
        BarcodeDetector?: new (options?: {
          formats?: string[];
        }) => {
          detect: (
            source: CanvasImageSource
          ) => Promise<Array<{ rawValue?: string }>>;
        };
      };

      if (!browserWindow.BarcodeDetector) return null;

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

    const getVideoDimensions = (video: HTMLVideoElement) => {
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      return { width, height };
    };

    const drawBarcodeRegion = (
      video: HTMLVideoElement,
      scale = 2
    ) => {
      const { width, height } = getVideoDimensions(video);

      // Large central ROI. It is intentionally generous so the user does not
      // have to place the barcode perfectly inside the guide.
      const cropWidth = Math.floor(width * 0.82);
      const cropHeight = Math.floor(height * 0.62);
      const sx = Math.floor((width - cropWidth) / 2);
      const sy = Math.floor((height - cropHeight) / 2);

      const targetWidth = Math.min(1800, Math.max(1000, Math.floor(cropWidth * scale)));
      const targetHeight = Math.min(1200, Math.max(600, Math.floor(cropHeight * scale)));

      sourceCanvas.width = targetWidth;
      sourceCanvas.height = targetHeight;

      const sourceContext = sourceCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!sourceContext) return null;

      sourceContext.imageSmoothingEnabled = true;
      sourceContext.imageSmoothingQuality = "high";
      sourceContext.drawImage(
        video,
        sx,
        sy,
        cropWidth,
        cropHeight,
        0,
        0,
        targetWidth,
        targetHeight
      );

      return sourceCanvas;
    };

    const makeEnhancedCanvas = (
      input: HTMLCanvasElement,
      mode: "contrast" | "threshold" | "sharpen"
    ) => {
      const width = input.width;
      const height = input.height;
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = width;
      outputCanvas.height = height;

      const inputContext = input.getContext("2d", {
        willReadFrequently: true,
      });
      const outputContext = outputCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!inputContext || !outputContext) return null;

      const image = inputContext.getImageData(0, 0, width, height);
      const src = image.data;
      const out = new Uint8ClampedArray(src.length);

      if (mode === "sharpen") {
        const copy = new Uint8ClampedArray(src);

        for (let y = 1; y < height - 1; y += 1) {
          for (let x = 1; x < width - 1; x += 1) {
            const i = (y * width + x) * 4;
            const left = i - 4;
            const right = i + 4;
            const top = i - width * 4;
            const bottom = i + width * 4;

            for (let channel = 0; channel < 3; channel += 1) {
              const value =
                copy[i + channel] * 3.5 -
                copy[left + channel] * 0.625 -
                copy[right + channel] * 0.625 -
                copy[top + channel] * 0.625 -
                copy[bottom + channel] * 0.625;

              out[i + channel] = Math.max(0, Math.min(255, value));
            }

            out[i + 3] = 255;
          }
        }
      } else {
        for (let i = 0; i < src.length; i += 4) {
          const r = src[i];
          const g = src[i + 1];
          const b = src[i + 2];
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          if (mode === "contrast") {
            gray = (gray - 128) * 1.45 + 128;
            gray = Math.max(0, Math.min(255, gray));
          } else {
            // Keep this variant deliberately mild. A hard threshold can
            // destroy thin bars when the source image is already blurry.
            gray = gray > 128 ? 255 : 0;
          }

          out[i] = gray;
          out[i + 1] = gray;
          out[i + 2] = gray;
          out[i + 3] = 255;
        }
      }

      outputContext.putImageData(new ImageData(out, width, height), 0, 0);
      return outputCanvas;
    };

    const makeTighterCrop = (input: HTMLCanvasElement) => {
      const width = input.width;
      const height = input.height;
      const cropWidth = Math.floor(width * 0.92);
      const cropHeight = Math.floor(height * 0.78);
      const sx = Math.floor((width - cropWidth) / 2);
      const sy = Math.floor((height - cropHeight) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = Math.min(1800, Math.max(1200, cropWidth));
      canvas.height = Math.min(1200, Math.max(800, cropHeight));

      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) return null;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        input,
        sx,
        sy,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      return canvas;
    };

    const tryNativeOnCanvases = async (
      canvases: HTMLCanvasElement[]
    ) => {
      if (!nativeDetector) return "";

      for (const canvas of canvases) {
        if (stopped) return "";

        try {
          const results = await nativeDetector.detect(canvas);
          const value = results
            .map((item) => item.rawValue?.trim() || "")
            .find(Boolean);

          if (value) return value;
        } catch {
          // Try the next processed frame.
        }
      }

      return "";
    };

    const tryZxingOnCanvases = async (
      reader: BrowserMultiFormatReader,
      canvases: HTMLCanvasElement[]
    ) => {
      for (const canvas of canvases) {
        if (stopped) return "";

        try {
          const result = reader.decodeFromCanvas(canvas);
          const value = result.getText().trim();
          if (value) return value;
        } catch {
          // Expected when a frame does not contain a decodable barcode.
        }
      }

      return "";
    };

    const buildProcessingVariants = (video: HTMLVideoElement) => {
      const base = drawBarcodeRegion(video, 2);
      if (!base) return [];

      const tighter = makeTighterCrop(base);
      const contrast = makeEnhancedCanvas(base, "contrast");
      const sharpen = makeEnhancedCanvas(base, "sharpen");

      return [
        base,
        tighter,
        contrast,
        sharpen,
      ].filter(Boolean) as HTMLCanvasElement[];
    };

    const finishScan = (value: string) => {
      if (!value || stopped) return;
      stopped = true;
      onScanRef.current(value);
      stopCamera();
    };

    async function startSmartScanner() {
      if (!navigator.mediaDevices?.getUserMedia) return false;

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

        const video = videoRef.current;

        if (stopped || !video) {
          stopCamera();
          return true;
        }

        video.srcObject = stream;
        await video.play();
        await applyCameraEnhancements(stream);

        nativeDetector = getNativeBarcodeDetector();

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 40,
          delayBetweenScanSuccess: 200,
          tryPlayVideoTimeout: 5000,
        });

        readerRef.current = reader;

        let lastSmartProcessTime = 0;
        let fastCanvas: HTMLCanvasElement | null = null;

        const prepareFastCanvas = () => {
          const width = video.videoWidth || 1280;
          const height = video.videoHeight || 720;
          const maxWidth = 1280;
          const scale = Math.min(1, maxWidth / width);
          const targetWidth = Math.max(640, Math.floor(width * scale));
          const targetHeight = Math.max(360, Math.floor(height * scale));

          if (!fastCanvas) fastCanvas = document.createElement("canvas");
          if (fastCanvas.width !== targetWidth || fastCanvas.height !== targetHeight) {
            fastCanvas.width = targetWidth;
            fastCanvas.height = targetHeight;
          }

          const ctx = fastCanvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return null;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          return fastCanvas;
        };

        const detectLoop = async (timestamp: number) => {
          if (stopped || !videoRef.current) return;
          animationFrame = requestAnimationFrame(detectLoop);

          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          if (zxingBusy || timestamp - lastDetectTime < 85) return;
          lastDetectTime = timestamp;
          zxingBusy = true;

          try {
            // FAST PATH: use the real video frame first. Large/clear barcodes
            // should normally be decoded here without any expensive processing.
            if (nativeDetector) {
              try {
                const nativeResults = await nativeDetector.detect(video);
                const value = nativeResults
                  .map((item) => item.rawValue?.trim() || "")
                  .find(Boolean);
                if (value) {
                  finishScan(value);
                  return;
                }
              } catch {
                // Continue to ZXing fast path.
              }
            }

            const fast = prepareFastCanvas();
            if (fast) {
              try {
                const value = reader.decodeFromCanvas(fast).getText().trim();
                if (value) {
                  finishScan(value);
                  return;
                }
              } catch {
                // Normal frame was not enough; smart processing may help.
              }
            }

            // SMART PATH: run only periodically, so the CPU is not hammered
            // while the user is simply moving a large/clear barcode around.
            if (timestamp - lastSmartProcessTime >= 650) {
              lastSmartProcessTime = timestamp;
              const canvases = buildProcessingVariants(video);
              if (canvases.length) {
                const nativeValue = await tryNativeOnCanvases(canvases);
                if (nativeValue) {
                  finishScan(nativeValue);
                  return;
                }

                const zxingValue = await tryZxingOnCanvases(reader, canvases);
                if (zxingValue) {
                  finishScan(zxingValue);
                  return;
                }
              }
            }
          } finally {
            zxingBusy = false;
          }
        };

        animationFrame = requestAnimationFrame(detectLoop);
        return true;
      } catch (error) {
        console.warn("Smart barcode scanner unavailable:", error);
        stopCamera();
        return false;
      }
    }

    async function startFallbackScanner() {
      try {
        const video = videoRef.current;
        if (!video || stopped) return;

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 40,
          delayBetweenScanSuccess: 200,
          tryPlayVideoTimeout: 5000,
        });

        readerRef.current = reader;

        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
            },
          },
          video,
          (result) => {
            if (!result || stopped) return;

            const value = result.getText().trim();
            if (value) finishScan(value);
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
      const started = await startSmartScanner();
      if (stopped) return;
      if (!started) await startFallbackScanner();
    }

    void startScanner();

    return () => {
      stopCamera();
      readerRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div>
            <div className="font-bold text-gray-900 dark:text-white">
              Scan Barcode V3.2
            </div>
            <div className="text-xs text-gray-500">
              تحسين تلقائي للباركود الصغير والـ low contrast
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
            className="h-[70vh] max-h-[520px] min-h-[320px] w-full object-cover"
            autoPlay
            muted
            playsInline
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-36 w-[88%] max-w-[420px]">
              <div className="absolute left-0 top-0 h-9 w-9 border-l-4 border-t-4 border-blue-500" />
              <div className="absolute right-0 top-0 h-9 w-9 border-r-4 border-t-4 border-blue-500" />
              <div className="absolute bottom-0 left-0 h-9 w-9 border-b-4 border-l-4 border-blue-500" />
              <div className="absolute bottom-0 right-0 h-9 w-9 border-b-4 border-r-4 border-blue-500" />
              <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-blue-500/90 shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
            </div>
          </div>
        </div>

        <div className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          خليك على مسافة طبيعية وثبّت الموبايل ثانية واحدة. الـ scanner بيكبّر المنطقة ويجرّب أكثر من معالجة للصورة تلقائيًا.
        </div>
      </div>
    </div>
  );
}
