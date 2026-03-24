import { useEffect, useState } from "react";
import api from "../api/client";
import type { Summary } from "../api/types";

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-400",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  delayed: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  delayed: "Delayed",
};

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold text-blue-900">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

export default function SummaryPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Summary>("/summary")
      .then((r) => setSummary(r.data))
      .catch(() => setError("Failed to load summary data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-500">Loading…</div>;
  if (error || !summary) return <div className="text-center py-16 text-red-500">{error}</div>;

  const pctSpent = Math.min(summary.percent_spent, 100);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-blue-900">Dashboard Summary</h1>

      {/* ── KPI cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Budget" value={`$${fmt(summary.total_budget_usd)}`} sub="USD" />
        <StatCard label="Spent to Date" value={`$${fmt(summary.spent_usd)}`} sub={`${fmt(summary.percent_spent, 1)}% of total`} />
        <StatCard label="Activities" value={String(summary.activities_total)} sub="total tracked" />
        <StatCard
          label="Completed"
          value={String(summary.activities_by_status.completed ?? 0)}
          sub={`of ${summary.activities_total}`}
        />
      </div>

      {/* ── Budget burn bar ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">
          Budget Utilisation
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="h-4 bg-vcap-teal rounded-full transition-all"
              style={{ width: `${pctSpent}%` }}
            />
          </div>
          <span className="text-sm font-semibold w-12 text-right">{fmt(summary.percent_spent, 1)}%</span>
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-400">
          <span>$0</span>
          <span>${fmt(summary.total_budget_usd)}</span>
        </div>
      </div>

      {/* ── Status breakdown ─────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">
            Activity Status
          </h2>
          <div className="space-y-2">
            {Object.entries(summary.activities_by_status).map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <span className={`inline-block w-3 h-3 rounded-full ${STATUS_COLORS[status] ?? "bg-gray-300"}`} />
                <span className="text-sm text-gray-700 flex-1">{STATUS_LABELS[status] ?? status}</span>
                <span className="text-sm font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">
            Activities by Output
          </h2>
          <div className="space-y-2">
            {Object.entries(summary.activities_by_output).map(([output, count]) => (
              <div key={output} className="flex items-center gap-3">
                <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded w-14 text-center">
                  {output}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 bg-vcap-blue rounded-full"
                    style={{ width: `${(count / summary.activities_total) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Budget by fund ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">
          Budget by Fund
        </h2>
        <div className="flex gap-8">
          {Object.entries(summary.budget_by_fund).map(([fund, amount]) => (
            <div key={fund} className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">{fund}</span>
              <span className="text-xl font-bold text-blue-900">${fmt(amount)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quarterly budget vs spent ─────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">
          Quarterly Budget vs Spent
        </h2>
        <div className="grid grid-cols-4 gap-4">
          {["Q1", "Q2", "Q3", "Q4"].map((q) => {
            const planned = summary.budget_by_quarter[q] ?? 0;
            const actual = summary.spent_by_quarter[q] ?? 0;
            const pct = planned > 0 ? Math.min((actual / planned) * 100, 100) : 0;
            return (
              <div key={q} className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-gray-700">{q}</span>
                <div className="bg-gray-100 rounded-full h-2">
                  <div className="h-2 bg-vcap-green rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-gray-500">
                  ${fmt(actual)} / ${fmt(planned)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Indicators ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">
          Key Indicators
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="pb-2 pr-4">Code</th>
                <th className="pb-2 pr-4">Indicator</th>
                <th className="pb-2 pr-4 text-right">Target</th>
                <th className="pb-2 pr-4 text-right">Latest</th>
                <th className="pb-2 text-right">% Achieved</th>
              </tr>
            </thead>
            <tbody>
              {summary.indicators.map((ind) => (
                <tr key={ind.code} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 pr-4 font-mono text-xs text-blue-600">{ind.code}</td>
                  <td className="py-2 pr-4 text-gray-800">{ind.name}</td>
                  <td className="py-2 pr-4 text-right text-gray-600">
                    {fmt(ind.target_ha)}
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold">
                    {ind.latest_value != null ? fmt(ind.latest_value) : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {ind.percent_achieved != null ? (
                      <span className="text-vcap-green font-semibold">
                        {fmt(ind.percent_achieved, 1)}%
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
