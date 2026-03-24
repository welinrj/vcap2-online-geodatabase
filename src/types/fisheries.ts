export type ActivityStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed'
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'
export type FundSource = 'GEF/TF' | 'LDCF'
export type OutputCode = '1.1.1' | '1.1.2' | '1.1.3' | '3.2.1'

export interface FisheriesActivity {
  id: string
  code: string           // e.g. "1.1.1.2.a"
  description: string
  output: OutputCode
  fund: FundSource
  glAccount: string      // e.g. "72100"
  budgetUsd: number
  q1Budget: number
  q2Budget: number
  q3Budget: number
  q4Budget: number
  responsible: string
  notes?: string
}

export interface ActivityProgress {
  id: string
  activityId: string
  quarter: Quarter
  status: ActivityStatus
  actualUsd: number
  percentDone: number   // 0-100
  notes: string
  updatedAt: string
  updatedBy: string
}

export interface FisheriesIndicator {
  id: string
  code: string           // "2.1" | "2.2" | "CI5" | "5.1"
  name: string
  baselineValue: number
  targetValue: number
  unit: string
}

export interface IndicatorProgress {
  id: string
  indicatorId: string
  quarter: Quarter
  value: number
  recordedAt: string
  notes: string
}
