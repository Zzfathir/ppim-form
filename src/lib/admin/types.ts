import type { Database } from "@/lib/database.types";

export type FormStatus = Database["public"]["Enums"]["form_status"];

/** Shape of public.admin_overview(). */
export type Overview = {
  bucket: "day" | "week";
  kpis: {
    total_forms: number;
    open_forms: number;
    total_responses: number;
    forms_in_period: number;
    responses_in_period: number;
    departments_active: number;
    pending_approvals: number;
  };
  departments: {
    id: string;
    name: string;
    color: string;
    is_archived: boolean;
    forms_in_period: number;
    forms_total: number;
    open_now: number;
    responses_in_period: number;
    last_activity: string | null;
  }[];
  chapters: { id: string | null; name: string | null; count: number }[];
  categories: { id: string; name: string; count: number }[];
  responses_series: { bucket: string; count: number }[];
  forms_series: { bucket: string; count: number }[];
  recent_forms: {
    id: string;
    title: string;
    status: FormStatus;
    created_at: string;
    department_name: string | null;
    department_color: string | null;
  }[];
};
