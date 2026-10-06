function safeColorFallback(property: string): string {
  const p = property.toLowerCase();

  if (p.includes("background")) return "#ffffff";
  if (p.includes("border") || p.includes("outline")) return "#e2e8f0";
  if (p.includes("decoration")) return "#0f172a";
  if (p === "fill" || p === "stroke") return "#0f172a";
  return "#0f172a";
}

function normalizeCssValue(property: string, value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return trimmed;

  const unsupported = /(?:oklch|oklab|lch|lab)\(/i.test(trimmed);
  if (!unsupported) return trimmed;

  // html2canvas currently cannot parse lab()/lch()/oklab()/oklch().
  // Use the browser canvas parser where available; otherwise fall back to a
  // safe solid color or neutral value for the affected declaration.
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (context) {
    try {
      context.fillStyle = "#000000";
      context.fillStyle = trimmed;
      const parsed = context.fillStyle;
      if (parsed && !/(?:oklch|oklab|lch|lab)\(/i.test(parsed)) {
        return parsed;
      }
    } catch {
      // Continue to the safe fallback below.
    }
  }

  if (/gradient|image|url\(/i.test(trimmed)) {
    return "none";
  }

  return safeColorFallback(property);
}

function sanitizeCloneStyles(source: HTMLElement, clone: HTMLElement) {
  const sourceElements = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll("*"))];

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index];
    if (!(cloneElement instanceof HTMLElement)) return;

    const computed = window.getComputedStyle(sourceElement);
    const style = cloneElement.style;

    // Remove Tailwind/class-driven CSS from the clone. html2canvas otherwise
    // parses the original stylesheet and can choke on lab()/oklch() colors.
    cloneElement.removeAttribute("class");

    for (let i = 0; i < computed.length; i += 1) {
      const property = computed.item(i);
      if (!property || property.startsWith("--")) continue;

      let value = computed.getPropertyValue(property);
      if (!value) continue;

      if (/(?:oklch|oklab|lch|lab)\(/i.test(value)) {
        value = normalizeCssValue(property, value);
      }

      // Shadows/filters can contain unsupported color functions and are not
      // required for the prescription PDF.
      if (property === "box-shadow" || property === "text-shadow") {
        value = "none";
      }
      if (property === "filter" || property === "backdrop-filter") {
        value = "none";
      }

      try {
        style.setProperty(property, value);
      } catch {
        // Ignore individual declarations that a browser refuses to inline.
      }
    }

    // Make the generated sheet stable and printable.
    style.setProperty("box-shadow", "none", "important");
    style.setProperty("text-shadow", "none", "important");
    style.setProperty("transform", "none", "important");
  });
}

async function capturePrescription(element: HTMLElement): Promise<HTMLCanvasElement> {
  const [{ default: html2canvas }] = await Promise.all([
    import("html2canvas"),
  ]);

  if (!html2canvas) {
    throw new Error("PDF renderer could not be loaded.");
  }

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  const clone = element.cloneNode(true) as HTMLElement;
  const width = Math.max(element.scrollWidth, element.offsetWidth, 794);
  const height = Math.max(element.scrollHeight, element.offsetHeight, 1123);

  clone.style.width = `${width}px`;
  clone.style.maxWidth = "none";
  clone.style.minHeight = `${height}px`;
  clone.style.height = `${height}px`;
  clone.style.margin = "0";
  clone.style.position = "absolute";
  clone.style.left = "-100000px";
  clone.style.top = "0";
  clone.style.background = "#ffffff";
  clone.style.boxShadow = "none";
  clone.style.transform = "none";

  sanitizeCloneStyles(element, clone);

  const holder = document.createElement("div");
  holder.style.position = "absolute";
  holder.style.left = "0";
  holder.style.top = "0";
  holder.style.width = `${width}px`;
  holder.style.height = `${height}px`;
  holder.style.background = "#ffffff";
  holder.style.zIndex = "-1";
  holder.appendChild(clone);
  document.body.appendChild(holder);

  try {
    return await html2canvas(clone, {
      scale: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 15000,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      removeContainer: true,
      onclone: (clonedDocument) => {
        clonedDocument.documentElement.style.background = "#ffffff";
        clonedDocument.body.style.background = "#ffffff";

        // Remove author stylesheets from the cloned document. Every relevant
        // computed declaration has already been inlined above, so html2canvas
        // no longer needs to parse CSS containing lab()/oklch().
        clonedDocument
          .querySelectorAll("style, link[rel='stylesheet']")
          .forEach((node) => node.remove());
      },
    });
  } finally {
    holder.remove();
  }
}

export async function buildPrescriptionPdfBlob(
  element: HTMLElement
): Promise<Blob> {
  const canvas = await capturePrescription(element);
  const { jsPDF } = await import("jspdf");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const margin = 8;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;

  const pixelsPerPage = Math.max(
    1,
    Math.floor((canvas.width * contentHeight) / contentWidth)
  );

  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(
      pixelsPerPage,
      canvas.height - sourceY
    );

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;

    const pageContext = pageCanvas.getContext("2d");
    if (!pageContext) {
      throw new Error("Could not prepare the prescription PDF page.");
    }

    pageContext.fillStyle = "#ffffff";
    pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageContext.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const imageData = pageCanvas.toDataURL("image/jpeg", 0.94);
    const imageHeight = (sliceHeight * contentWidth) / canvas.width;

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(
      imageData,
      "JPEG",
      margin,
      margin,
      contentWidth,
      Math.min(imageHeight, contentHeight),
      undefined,
      "FAST"
    );

    sourceY += sliceHeight;
    pageIndex += 1;
  }

  const blob = pdf.output("blob");
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("The generated PDF is empty.");
  }

  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("The generated PDF is empty.");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.position = "fixed";
  anchor.style.left = "-10000px";
  anchor.style.top = "0";

  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
