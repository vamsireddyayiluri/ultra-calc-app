import React from "react";
import { ProjectHeader } from "../../models/projectTypes";

interface ProjectCardProps {
  project: ProjectHeader;
  onClick: () => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl bg-white border border-slate-100 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 p-5"
    >
      <h3 className="text-lg font-semibold text-slate-800 group-hover:text-[#1E3A8A] transition-colors">
        {project.name || "Untitled Project"}
      </h3>
      <p className="text-sm text-slate-500 mt-1">
        {project.contractor || "No contractor set"}
      </p>

      <div className="mt-4 text-sm text-slate-600 space-y-1">
        <p>
          <span className="text-slate-500">Region:</span>{" "}
          <span className="font-medium text-slate-800">{project.region}</span>
        </p>
        <p>
          <span className="text-slate-500">Indoor / Outdoor:</span>{" "}
          <span className="font-medium">
            {project.designIndoorC}° / {project.designOutdoorC}°
          </span>
        </p>
        <p>
          <span className="text-slate-500">Standard:</span>{" "}
          <span className="font-medium">{project.standardsMode}</span>
        </p>
      </div>

      <div className="mt-4 pt-2 border-t border-slate-100 text-xs text-slate-400">
        Click to open project →
      </div>
    </div>
  );
};
