export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block w-full">
      <span className="block mb-2 text-sm font-medium text-slate-700">
        {label}
      </span>
      <div className="relative">{children}</div>
    </label>
  );
}
