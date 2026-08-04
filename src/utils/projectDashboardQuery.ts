// src/utils/projectDashboardQuery.ts
//
// Framework-independent search/filter/sort engine for the dashboard's
// project list. One pure function (queryProjects) is the single source
// of truth — HomePage.tsx only calls it inside a useMemo, it never
// re-implements any of this logic itself.
//
// Deliberately extensible: adding a future filter (tags, folders,
// archived, shared) means adding one field to DashboardQuery and one
// match*() predicate below — nothing about the shape of queryProjects()
// itself needs to change, and nothing calling it needs to change either
// beyond passing the new field.

import { Region } from "../models/projectTypes";
import { RichProject } from "../services/firebaseHelpers";

export type StatusFilter = "all" | "draft" | "published";

// "CA" groups CA_METRIC + CA_IMPERIAL under one user-facing "Canada"
// filter option, matching how the region picker is grouped in the
// dashboard UI (the underlying data still distinguishes them everywhere
// else — this grouping is a dashboard-filter-only convenience).
export type RegionFilter = "all" | "UK" | "EU" | "US" | "CA";

export type SortOption =
  | "updated_desc"
  | "created_desc"
  | "name_asc"
  | "name_desc";

export interface DashboardQuery {
  search: string;
  status: StatusFilter;
  region: RegionFilter;
  sort: SortOption;
}

export const DEFAULT_DASHBOARD_QUERY: DashboardQuery = {
  search: "",
  status: "all",
  region: "all",
  sort: "updated_desc",
};

export function isDashboardQueryActive(query: DashboardQuery): boolean {
  return (
    query.search.trim() !== "" ||
    query.status !== "all" ||
    query.region !== "all"
  );
}

function regionGroup(region: Region | undefined): RegionFilter {
  if (region === "CA_METRIC" || region === "CA_IMPERIAL") return "CA";
  if (region === "UK" || region === "EU" || region === "US") return region;
  return "all"; // unknown/missing region never matches a specific region filter
}

function matchesSearch(project: RichProject, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    (project.name ?? "").toLowerCase().includes(q) ||
    (project.address ?? "").toLowerCase().includes(q) ||
    (project.region ?? "").toLowerCase().includes(q)
  );
}

function matchesStatus(project: RichProject, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  // Missing status is treated as "draft" everywhere — see
  // models/projectTypes.ts#ProjectStatus.
  const status = project.status ?? "draft";
  return status === filter;
}

function matchesRegion(project: RichProject, filter: RegionFilter): boolean {
  if (filter === "all") return true;
  return regionGroup(project.region) === filter;
}

function compareProjects(a: RichProject, b: RichProject, sort: SortOption): number {
  switch (sort) {
    case "name_asc":
      return (a.name ?? "").localeCompare(b.name ?? "");
    case "name_desc":
      return (b.name ?? "").localeCompare(a.name ?? "");
    case "created_desc":
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    case "updated_desc":
    default:
      return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
  }
}

/** Sort only, no filtering — exported for callers (e.g. the dashboard's sectioned view) that already have their own subset and just need the same ordering rules queryProjects() uses internally. */
export function sortProjects(projects: RichProject[], sort: SortOption): RichProject[] {
  return projects.slice().sort((a, b) => compareProjects(a, b, sort));
}

/**
 * Search + filter + sort in one pass. Pure and deterministic — same
 * inputs always produce the same output array (a new array; the input
 * is never mutated), so it's safe to call inside a useMemo keyed on
 * [projects, query].
 */
export function queryProjects(
  projects: RichProject[],
  query: DashboardQuery,
): RichProject[] {
  const filtered = projects.filter(
    (p) =>
      matchesSearch(p, query.search) &&
      matchesStatus(p, query.status) &&
      matchesRegion(p, query.region),
  );
  return sortProjects(filtered, query.sort);
}

/** Top-N most recently touched projects, for a "Recent Projects" shortcut section. */
export function recentProjects(projects: RichProject[], limit: number): RichProject[] {
  const withTimestamps = projects.filter((p) => p.updatedAt != null || p.createdAt != null);
  return sortProjects(withTimestamps, "updated_desc").slice(0, limit);
}
