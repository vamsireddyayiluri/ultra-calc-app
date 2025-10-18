// src/components/layout/AppLayout.tsx
import React from "react";
import { Header } from "./Header";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title,
  subtitle,
}) => {
  return (
    <div className="min-h-screen bg-[#FFF8EE]">
      <Header title={title} subtitle={subtitle} />
      <main className="p-6 bg-[#FFF8EE]">{children}</main>
    </div>
  );
};
