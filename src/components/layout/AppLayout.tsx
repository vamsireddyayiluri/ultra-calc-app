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
    <div className="min-h-screen bg-gray-100">
      <Header title={title} subtitle={subtitle} />
      <main className="p-4 bg-gray-100">{children}</main>
    </div>
  );
};
