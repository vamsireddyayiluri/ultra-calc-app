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
  height: number
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

export const exportPDF = async (ref: React.RefObject<HTMLDivElement>) => {
  if (!ref.current) return;

  const canvas = await html2canvas(ref.current, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  // First page
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  // Additional pages
  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save("project-export.pdf");
};
