export function Field({
  label,
  children,
  exportMode = false,
}: {
  label: string;
  children: React.ReactNode;
  exportMode?: boolean;
}) {
  return (
    <label className="block w-full">
      <span className={`block text-sm font-medium text-slate-700 ${exportMode ? "text-xs mb-0" : "mb-2"}`}>
        {label}
      </span>
      <div className="relative">{children}</div>
    </label>
  );
}
