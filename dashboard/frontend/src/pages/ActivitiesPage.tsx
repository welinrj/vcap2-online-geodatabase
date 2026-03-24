import { useEffect, useState } from "react";
import api from "../api/client";
import type { Activity } from "../api/types";

const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  delayed: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  delayed: "Delayed",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function overallStatus(progress: Activity["progress"]): string {
  const priority: Record<string, number> = {
    completed: 4,
    in_progress: 3,
    delayed: 2,
    not_started: 1,
  };
  let best = "not_started";
  for (const p of Object.values(progress)) {
    if ((priority[p.status] ?? 0) > (priority[best] ?? 0)) best = p.status;
  }
  return best;
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOutput, setFilterOutput] = useState<string>("all");
  const [filterFund, setFilterFund] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<Activity[]>("/activities")
      .then((r) => setActivities(r.data))
      .catch(() => setError("Failed to load activities"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-500">Loading…</div>;
  if (error) return <div className="text-center py-16 text-red-500">{error}</div>;

  const outputs = Array.from(new Set(activities.map((a) => a.output))).sort();
  const funds = Array.from(new Set(activities.map((a) => a.fund))).sort();

  const filtered = activities.filter((a) => {
    if (filterOutput !== "all" && a.output !== filterOutput) return false;
    if (filterFund !== "all" && a.fund !== filterFund) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-blue-900">Activities</h1>
        <div className="flex gap-3">
          <select
            className="border rounded-md px-3 py-1.5 text-sm"
            value={filterOutput}
            onChange={(e) => setFilterOutput(e.target.value)}
          >
            <option value="all">All Outputs</option>
            {outputs.map((o) => (
              <option key={o} value={o}>
                Output {o}
              </option>
            ))}
          </select>
          <select
            className="border rounded-md px-3 py-1.5 text-sm"
            value={filterFund}
            onChange={(e) => setFilterFund(e.target.value)}
          >
            <option value="all">All Funds</option>
            {funds.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-sm text-gray-500">{filtered.length} activities shown</div>

      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Output</th>
              <th className="px-4 py-3">Fund</th>
              <th className="px-4 py-3 text-right">Budget (USD)</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((act) => {
              const status = overallStatus(act.progress);
              const isOpen = expanded === act.id;
              return (
                <>
                  <tr
                    key={act.id}
                    className="border-b hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => setExpanded(isOpen ? null : act.id)}
                  >
                    <td className="px-4 py-3 text-gray-400">{act.id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">{act.code}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-xs">{act.description}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                        {act.output}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{act.fund}</td>
                    <td className="px-4 py-3 text-right font-semibold">${fmt(act.budget_usd)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-500"}`}
                      >
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${act.id}-detail`} className="bg-blue-50 border-b">
                      <td colSpan={7} className="px-8 py-4">
                        <div className="grid grid-cols-4 gap-4">
                          {["Q1", "Q2", "Q3", "Q4"].map((q) => {
                            const p = act.progress[q];
                            const qBudget =
                              act[`q${q[1]}_budget` as "q1_budget" | "q2_budget" | "q3_budget" | "q4_budget"];
                            return (
                              <div key={q} className="bg-white rounded-lg p-3 shadow-sm">
                                <div className="font-semibold text-gray-700 mb-1">{q}</div>
                                <div className="text-xs text-gray-500 mb-1">
                                  Planned: ${fmt(qBudget)}
                                </div>
                                {p ? (
                                  <>
                                    <div className="text-xs mb-1">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-gray-100"}`}
                                      >
                                        {STATUS_LABELS[p.status] ?? p.status}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Actual: ${fmt(p.actual_usd)}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      Progress: {p.percent_done}%
                                    </div>
                                    {p.notes && (
                                      <div className="text-xs text-gray-400 mt-1 italic">
                                        {p.notes}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-xs text-gray-400">No data recorded</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {act.notes && (
                          <div className="mt-3 text-xs text-gray-500 italic">
                            Note: {act.notes}
                          </div>
                        )}
                        <div className="mt-2 text-xs text-gray-400">
                          GL Account: {act.gl_account} | Responsible: {act.responsible}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
