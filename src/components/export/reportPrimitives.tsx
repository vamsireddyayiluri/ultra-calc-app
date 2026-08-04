// src/components/export/reportPrimitives.tsx
//
// Small shared presentational pieces used across the report's content
// pages (cover, design parameters, materials summary) so each page isn't
// re-defining its own label/value row and section heading styling.
// Purely typographic — renders whatever value it's given, never computes
// one.
import React from "react";

export const ReportSectionHeading: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      fontSize: "10px",
      fontWeight: 700,
      color: "#0f172a",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      borderBottom: "1px solid #e2e8f0",
      paddingBottom: "4px",
      marginBottom: "8px",
      ...style,
    }}
  >
    {children}
  </div>
);

export const ReportRow: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      gap: "10px",
      padding: "4.5px 0",
      borderBottom: "1px solid #f1f5f9",
    }}
  >
    <span style={{ fontSize: "9.5px", color: "#64748b", fontWeight: 600 }}>
      {label}
    </span>
    <span
      style={{
        fontSize: "10px",
        color: "#0f172a",
        fontWeight: 500,
        textAlign: "right",
      }}
    >
      {value === undefined || value === null || value === "" ? "—" : value}
    </span>
  </div>
);
