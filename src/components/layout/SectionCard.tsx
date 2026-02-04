import { useEffect, useState } from "react";
import { loadImageAsBase64 } from "../../utils/pdfExport";

export function SectionCard({
  title,
  children,
  exportMode = false,
}: {
  title: string;
  children: React.ReactNode;
  exportMode?: boolean;
}) {
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  useEffect(() => {
    const buildLogo = async () => {
      const base64 = await loadImageAsBase64("/assets/diagrams/logo_square.PNG");

      setLogoBase64(base64); // ✅ triggers re-render
    };

    buildLogo();
  }, []);
  return (
    <div
      className={`bg-white border border-slate-200 rounded-2xl  shadow-md hover:shadow-lg transition-shadow ${exportMode ? "py-1 px-5 mb-2" : "p-5"}`}
    >
      <div className={`flex items-center justify-between ${exportMode ? "mb-2" : "mb-4"}`}>
        <h3 className="font-semibold text-slate-800 text-lg">{title}</h3>

        {exportMode && logoBase64 && (
          <img
            src={logoBase64}
            alt="Logo"
            className="h-14 object-contain mt-3" // small size
          />
        )}
      </div>
      {children}
    </div>
  );
}
