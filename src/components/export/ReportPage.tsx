// src/components/export/ReportPage.tsx
//
// Shared A4 page chrome for the PDF export: consistent margins, a running
// header (logo + project name + optional page label) and a footer
// (generation date, branding, page number). Every export page renders its
// own content as children of this wrapper instead of hand-rolling its own
// header/logo/margin block — see docs/AGENTS.md §5 "PDF Generator" for the
// previous inconsistency this replaces.
//
// Presentational only: renders values already computed/stored elsewhere
// (project name, room name, page numbers passed in by the caller). Does
// not read from or affect any calculation engine.
import React from "react";

const PAGE_MARGIN_MM = "14mm";

interface ReportPageProps {
  logoBase64: string | null;
  projectName: string;
  /** Shown at the right of the header — e.g. a room name, "Project Summary". Omitted on the cover page, which already states its own identity in the content area. */
  pageLabel?: string;
  pageNumber: number;
  totalPages: number;
  children: React.ReactNode;
}

export const ReportPage = React.forwardRef<HTMLDivElement, ReportPageProps>(
  ({ logoBase64, projectName, pageLabel, pageNumber, totalPages, children }, ref) => {
    const generatedOn = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    return (
      <div
        ref={ref}
        style={{
          width: "210mm",
          height: "297mm",
          padding: PAGE_MARGIN_MM,
          boxSizing: "border-box",
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Arial, Helvetica, sans-serif",
          color: "#1e293b",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "8px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {logoBase64 && (
              <img
                src={logoBase64}
                alt="Ultra-Calc"
                style={{ height: "28px", width: "auto", objectFit: "contain" }}
              />
            )}
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                {projectName || "Untitled Project"}
              </div>
              <div style={{ fontSize: "9px", color: "#64748b" }}>
                Heat Loss &amp; Radiant Floor Design Report
              </div>
            </div>
          </div>
          {pageLabel && (
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#334155",
                textAlign: "right",
              }}
            >
              {pageLabel}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, paddingTop: "10px", minHeight: 0 }}>{children}</div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "6px",
            marginTop: "8px",
            borderTop: "1px solid #e2e8f0",
            fontSize: "8px",
            color: "#94a3b8",
          }}
        >
          <span>Generated {generatedOn}</span>
          <span>Ultra-Calc — Radiant Floor Heat Loss &amp; Material Calculator</span>
          <span>
            Page {pageNumber} of {totalPages}
          </span>
        </div>
      </div>
    );
  },
);
