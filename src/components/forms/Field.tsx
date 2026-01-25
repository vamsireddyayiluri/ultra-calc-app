export function Field({
  label,
  children,
  exportMode = false,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  exportMode?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block w-full">
      <span
        className={`block text-sm font-medium text-slate-700 ${exportMode ? "text-xs mb-0" : "mb-2"}`}
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      <div className="relative">{children}</div>
    </label>
  );
}
