import type { ColumnDef, Row } from "@tanstack/react-table";
import { LOCATIONS, OUTCOME_LABELS, SOURCE_CATEGORY_LABELS, type JobSummary } from "../../api/jobsApi";
import { PIPELINE_PLACES, hasStage, pipelinePlaceOf } from "../../jobPlacement";
import {
  ActionsCell,
  ApplicationCell,
  CityCell,
  CompanyCell,
  LocationCell,
  PositionCell,
  SalaryCell,
  StageCell,
  StatusCell,
} from "./cells";
import type { ColumnFilterMeta } from "./JobsTableFilters";

// Undefined = no filter; empty array = nothing checked, so no row matches.
function listFilter(row: Row<JobSummary>, columnId: string, value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  return value.includes(row.getValue(columnId));
}

function salaryFilter(row: Row<JobSummary>, _columnId: string, value: string): boolean {
  if (!value) return true;
  const min = Number(value);
  if (Number.isNaN(min)) return true;
  const top = row.original.compMax ?? row.original.compMin;
  return top != null && top >= min;
}

// Stage in board terms, the way the picker shows it; DONE is every closed or decided job.
const STAGE_ORDER = [...PIPELINE_PLACES.map(place => place.id), "DONE"];
const STAGE_LABELS: Record<string, string> = {
  ...Object.fromEntries(PIPELINE_PLACES.map(place => [place.id, place.label])),
  DONE: "Done",
};
const stageOf = (job: JobSummary) => (hasStage(job) && pipelinePlaceOf(job)) || "DONE";

const list = (optionLabels?: Record<string, string>): ColumnFilterMeta => ({ filter: "list", optionLabels });

// Fixed at module level: a cell is a component reading the table's state from context, so nothing
// here changes between renders and an input being typed into is never remounted.
export const JOBS_TABLE_COLUMNS: ColumnDef<JobSummary, unknown>[] = [
  { accessorKey: "company", header: "Company", filterFn: listFilter, meta: list(), size: 150, minSize: 100, cell: CompanyCell },
  { id: "position", accessorKey: "role", header: "Position", filterFn: listFilter, meta: list(), size: 220, minSize: 140, cell: PositionCell },
  {
    accessorKey: "sourceCategory", header: "Application", filterFn: listFilter, meta: list(SOURCE_CATEGORY_LABELS),
    size: 165, minSize: 130, cell: ApplicationCell,
  },
  {
    accessorKey: "location", header: "Location", filterFn: listFilter,
    meta: list(Object.fromEntries(LOCATIONS.map(location => [location.value, location.label]))),
    size: 150, minSize: 110, cell: LocationCell,
  },
  { accessorKey: "city", header: "City", filterFn: listFilter, meta: list(), size: 140, minSize: 90, cell: CityCell },
  {
    id: "salary", accessorKey: "compMin", header: "Salary Range", filterFn: salaryFilter,
    meta: { filter: "salary" } satisfies ColumnFilterMeta, size: 170, minSize: 120, cell: SalaryCell,
  },
  {
    id: "stage", accessorFn: stageOf, header: "Stage", filterFn: listFilter, meta: list(STAGE_LABELS),
    // Pipeline order, not alphabetical.
    sortingFn: (a, b) => STAGE_ORDER.indexOf(stageOf(a.original)) - STAGE_ORDER.indexOf(stageOf(b.original)),
    size: 240, minSize: 170, cell: StageCell,
  },
  { accessorKey: "outcome", header: "Status", filterFn: listFilter, meta: list(OUTCOME_LABELS), size: 150, minSize: 110, cell: StatusCell },
  { id: "actions", header: "", size: 130, minSize: 100, cell: ActionsCell },
];
