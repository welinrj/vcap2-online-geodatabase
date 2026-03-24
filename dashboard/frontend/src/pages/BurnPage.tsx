import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";
import api from "../api/client";
import type { BurnRow } from "../api/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtK(n: number) {
  return `$${(n / 1000).toFixed(0)}k`;
}

export default function BurnPage() {
  const [burn, setBurn] = useState<BurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BurnRow[]>("/budget/burn")
      .then((r) => setBurn(r.data))
      .catch(() => setError("Failed to load budget burn data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-500">Loading…</div>;
  if (error) return <div className="text-center py-16 text-red-500">{error}</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-blue-900">Budget Burn</h1>

      {/* ── Quarterly bar chart ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">
          Planned vs Actual Spending per Quarter
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={burn} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="quarter" />
            <YAxis tickFormatter={fmtK} />
            <Tooltip formatter={(value: number) => `$${fmt(value)}`} />
            <Legend />
            <Bar dataKey="planned_usd" name="Planned" fill="#0066CC" />
            <Bar dataKey="actual_usd" name="Actual" fill="#009999" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Cumulative line chart ───────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">
          Cumulative Budget Burn
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={burn} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="quarter" />
            <YAxis tickFormatter={fmtK} />
            <Tooltip formatter={(value: number) => `$${fmt(value)}`} />
            <Legend />
            <Line
              type="monotone"
              dataKey="cumulative_planned"
              name="Cumulative Planned"
              stroke="#0066CC"
              strokeWidth={2}
              dot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="cumulative_actual"
              name="Cumulative Actual"
              stroke="#33AA44"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Data table ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr className="text-xs text-gray-500 uppercase tracking-wider text-right">
              <th className="px-4 py-3 text-left">Quarter</th>
              <th className="px-4 py-3">Planned (USD)</th>
              <th className="px-4 py-3">Actual (USD)</th>
              <th className="px-4 py-3">Variance</th>
              <th className="px-4 py-3">Cum. Planned</th>
              <th className="px-4 py-3">Cum. Actual</th>
            </tr>
          </thead>
          <tbody>
            {burn.map((row) => {
              const variance = row.actual_usd - row.planned_usd;
              return (
                <tr key={row.quarter} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-700">{row.quarter}</td>
                  <td className="px-4 py-3 text-right">${fmt(row.planned_usd)}</td>
                  <td className="px-4 py-3 text-right font-semibold">${fmt(row.actual_usd)}</td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${
                      variance < 0 ? "text-green-600" : variance > 0 ? "text-red-600" : "text-gray-500"
                    }`}
                  >
                    {variance >= 0 ? "+" : ""}${fmt(variance)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    ${fmt(row.cumulative_planned)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    ${fmt(row.cumulative_actual)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
