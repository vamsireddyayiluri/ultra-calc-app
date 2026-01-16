export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-md hover:shadow-lg transition-shadow ">
      <h3 className="font-semibold text-slate-800 text-lg mb-4">{title}</h3>
      {children}
    </div>
  );
}
