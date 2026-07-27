import { LayoutGrid, List } from "lucide-react";

export type SortField = "title" | "created" | "updated";
export type SortDirection = "asc" | "desc";

export type SortDefinition = {
  value: string;
  field: SortField;
  direction: SortDirection;
  label: string;
  labelKey: string;
};

export const sorts: SortDefinition[] = [
  {
    label: "Name (A->Z)",
    labelKey: "title_asc",
    value: "title-asc",
    field: "title",
    direction: "asc",
  },
  {
    label: "Name (Z->A)",
    labelKey: "title_desc",
    value: "title-desc",
    field: "title",
    direction: "desc",
  },
  {
    label: "Created (New->Old)",
    labelKey: "created_new_to_old",
    value: "created-desc",
    field: "created",
    direction: "desc",
  },
  {
    label: "Created (Old->New)",
    labelKey: "created_old_to_new",
    value: "created-asc",
    field: "created",
    direction: "asc",
  },
  {
    label: "Updated (New->Old)",
    labelKey: "updated_new_to_old",
    value: "updated-desc",
    field: "updated",
    direction: "desc",
  },
  {
    label: "Updated (Old->New)",
    labelKey: "updated_old_to_new",
    value: "updated-asc",
    field: "updated",
    direction: "asc",
  },
];

export const views = [
  {
    label: "Grid",
    value: "grid",
    icon: LayoutGrid,
  },
  {
    label: "List",
    value: "list",
    icon: List,
  },
];
