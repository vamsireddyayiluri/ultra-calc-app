import html2canvas from "html2canvas";
import jsPDF from "jspdf";
export async function loadImageAsBase64(src: string): Promise<string> {
  const res = await fetch(src);
  const blob = await res.blob();

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
export async function svgBase64ToPng(
  svgBase64: string,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      resolve(canvas.toDataURL("image/png"));
    };
    img.src = svgBase64;
  });
}

export async function inlineNestedSvgImages(svgUrl: string): Promise<string> {
  if (!svgUrl) return null;
  const svgText = await fetch(svgUrl).then((r) => r.text());

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");

  const images = Array.from(doc.querySelectorAll("image"));

  for (const img of images) {
    const href =
      img.getAttribute("href") ||
      img.getAttributeNS("http://www.w3.org/1999/xlink", "href");

    if (!href || href.startsWith("data:") || href === "null") continue;

    if (!href || href.startsWith("data:")) continue;

    try {
      const base64 = await loadImageAsBase64(href);
      img.setAttribute("href", base64);
      img.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", base64);
    } catch (e) {
      console.warn("Failed to inline image:", href, e);
    }
  }

  const serialized = new XMLSerializer().serializeToString(doc);

  return (
    "data:image/svg+xml;base64," +
    btoa(unescape(encodeURIComponent(serialized)))
  );
}

async function renderPage(
  pdf: jsPDF,
  element?: HTMLElement | null,
  mode: "text" | "layout" = "text",
) {
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: mode === "layout" ? 2 : 1.5,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  if (mode === "layout") {
    // 🔹 PNG keeps transparency → layout works
    const img = canvas.toDataURL("image/png");
    pdf.addImage(
      img,
      "PNG",
      0,
      0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight(),
    );
  } else {
    // 🔹 JPEG compresses text pages
    const img = canvas.toDataURL("image/jpeg", 0.85);
    pdf.addImage(
      img,
      "JPEG",
      0,
      0,
      pdf.internal.pageSize.getWidth(),
      pdf.internal.pageSize.getHeight(),
    );
  }
}

export async function exportPDF(
  headerRef: HTMLDivElement | null,
  detailRefs: HTMLDivElement[],
  layoutRefs: HTMLDivElement[],
  summaryRef?: HTMLDivElement | null,
) {
  const pdf = new jsPDF("p", "mm", "a4");
  let firstPage = true;

  const addPage = async (
    el?: HTMLElement | null,
    mode: "text" | "layout" = "text",
  ) => {
    if (!el) return;
    if (!firstPage) pdf.addPage();
    await renderPage(pdf, el, mode);
    firstPage = false;
  };

  /* ───────────── ROOMS ───────────── */
  for (let i = 0; i < detailRefs.length; i++) {
    await addPage(detailRefs[i], "text"); // ✅ details → JPEG
    await addPage(layoutRefs[i], "layout"); // ✅ layout → PNG
  }

  /* ───────────── SUMMARY ───────────── */
  if (summaryRef) {
    await addPage(summaryRef, "text");
  }

  pdf.save("project-export.pdf");
}
