export const SummaryRow: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
}> = ({ label, value, highlight = false }) => (
  <div
    className={`flex flex-col sm:flex-row sm:justify-between items-start sm:items-center p-3 rounded-xl border ${
      highlight
        ? "bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200"
        : "bg-slate-50 border-slate-200"
    } shadow-sm transition-all`}
  >
    <span className="text-sm text-slate-600 font-medium">{label}</span>
    <span
      className={`text-base font-semibold ${
        highlight ? "text-blue-700" : "text-slate-800"
      }`}
    >
      {value}
    </span>
  </div>
);