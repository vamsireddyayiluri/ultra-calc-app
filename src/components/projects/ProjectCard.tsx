import React from "react";
import { MapPin, Clock, ChevronRight } from "lucide-react";
import { RichProject } from "../../services/firebaseHelpers";
import { REGION_OPTIONS } from "../../models/presets";
import { formatRelativeTime } from "../../utils/formatRelativeTime";

interface ProjectCardProps {
  project: RichProject;
  /** Stable callback taking the project id — keeps this component's props
   *  referentially stable across parent re-renders so React.memo below is
   *  actually effective at dashboard scale (hundreds of cards). */
  onClick: (id: string) => void;
}

const REGION_SHORT_LABEL: Record<string, string> = {
  UK: "UK",
  EU: "EU",
  US: "US",
  CA_METRIC: "Canada",
  CA_IMPERIAL: "Canada",
};

function regionLabel(region: string | undefined): string {
  if (!region) return "—";
  return (
    REGION_SHORT_LABEL[region] ??
    REGION_OPTIONS.find((o) => o.key === region)?.label ??
    region
  );
}

const ProjectCardImpl: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  const isPublished = project.status === "published";
  const roomCount = project.rooms?.length ?? 0;

  return (
    <div
      onClick={() => project.id && onClick(project.id)}
      className="group cursor-pointer rounded-lg bg-white border border-slate-200 p-5 shadow-sm transition-all duration-150 hover:border-slate-300 hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-slate-800 line-clamp-1 transition-colors group-hover:text-[#1E3A8A]">
          {project.name || "Untitled Project"}
        </h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isPublished
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {isPublished ? "Published" : "Draft"}
        </span>
      </div>

      <p className="mt-1.5 flex items-center gap-1 text-sm text-slate-500 line-clamp-1">
        <MapPin size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
        {project.address || "No address set"}
      </p>

      <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-xs text-slate-400">
        <span>{regionLabel(project.region)}</span>
        <span aria-hidden="true">·</span>
        <span>
          {roomCount} {roomCount === 1 ? "room" : "rooms"}
        </span>
        <span aria-hidden="true">·</span>
        <span className="flex items-center gap-1">
          <Clock size={12} className="shrink-0" aria-hidden="true" />
          {formatRelativeTime(project.updatedAt)}
        </span>
        <ChevronRight
          size={14}
          className="ml-auto shrink-0 text-slate-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

// Memoized: with hundreds of projects on screen, typing in the search box
// or toggling a filter re-renders HomePage, but should not re-render
// every card whose own data hasn't changed. onClick is a stable
// (id)=>void callback from the parent (see HomePage.tsx), so this
// comparison is a real optimization, not a no-op.
export const ProjectCard = React.memo(ProjectCardImpl);
