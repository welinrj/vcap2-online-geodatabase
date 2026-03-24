export interface ActivityProgressRecord {
  id: number;
  activity_id: number;
  quarter: string;
  status: "not_started" | "in_progress" | "completed" | "delayed";
  actual_usd: number | null;
  percent_done: number;
  notes: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface Activity {
  id: number;
  code: string;
  description: string;
  output: string;
  fund: string;
  gl_account: string;
  budget_usd: number | null;
  q1_budget: number | null;
  q2_budget: number | null;
  q3_budget: number | null;
  q4_budget: number | null;
  responsible: string;
  notes: string | null;
  progress: Record<string, ActivityProgressRecord>;
}

export interface IndicatorProgressRecord {
  id: number;
  indicator_id: number;
  quarter: string;
  value: number | null;
  recorded_at: string | null;
  notes: string | null;
}

export interface Indicator {
  id: number;
  code: string;
  name: string;
  baseline_ha: number | null;
  target_ha: number | null;
  unit: string;
  latest_by_quarter: Record<string, IndicatorProgressRecord>;
}

export interface IndicatorSummary {
  code: string;
  name: string;
  target_ha: number | null;
  latest_value: number | null;
  percent_achieved: number | null;
}

export interface Summary {
  total_budget_usd: number;
  direct_budget_usd: number;
  component3_budget_usd: number;
  spent_usd: number;
  percent_spent: number;
  activities_total: number;
  activities_by_status: Record<string, number>;
  activities_by_output: Record<string, number>;
  budget_by_fund: Record<string, number>;
  budget_by_quarter: Record<string, number>;
  spent_by_quarter: Record<string, number>;
  indicators: IndicatorSummary[];
}

export interface BurnRow {
  quarter: string;
  planned_usd: number;
  actual_usd: number;
  cumulative_planned: number;
  cumulative_actual: number;
}
