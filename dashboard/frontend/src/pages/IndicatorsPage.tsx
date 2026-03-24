import { useEffect, useState } from "react";
import api from "../api/client";
import type { Indicator } from "../api/types";

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function IndicatorsPage() {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Indicator[]>("/indicators")
      .then((r) => setIndicators(r.data))
      .catch(() => setError("Failed to load indicators"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-500">Loading…</div>;
  if (error) return <div className="text-center py-16 text-red-500">{error}</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-blue-900">Key Indicators</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {indicators.map((ind) => {
          const latestEntry = Object.values(ind.latest_by_quarter).sort(
            (a, b) =>
              new Date(b.recorded_at ?? 0).getTime() -
              new Date(a.recorded_at ?? 0).getTime()
          )[0];
          const latest = latestEntry?.value ?? null;
          const pct =
            latest != null && ind.target_ha && ind.target_ha !== 0
              ? Math.min((latest / ind.target_ha) * 100, 100)
              : null;

          return (
            <div key={ind.id} className="bg-white rounded-xl shadow p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {ind.code}
                  </span>
                  <h3 className="text-base font-semibold text-gray-800 mt-2">{ind.name}</h3>
                </div>
                {pct != null && (
                  <span className="text-lg font-bold text-vcap-green">{fmt(pct, 1)}%</span>
                )}
              </div>

              <div className="flex gap-6 text-sm text-gray-600 mb-3">
                <div>
                  <span className="text-xs text-gray-400 block">Baseline</span>
                  <span className="font-medium">
                    {fmt(ind.baseline_ha)} {ind.unit}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">Target</span>
                  <span className="font-medium">
                    {fmt(ind.target_ha)} {ind.unit}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block">Latest</span>
                  <span className="font-bold text-blue-800">
                    {latest != null ? `${fmt(latest)} ${ind.unit}` : "—"}
                  </span>
                </div>
              </div>

              {pct != null && (
                <div className="bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 bg-vcap-teal rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              {/* Quarterly breakdown */}
              {Object.keys(ind.latest_by_quarter).length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                    Quarterly records
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {["Q1", "Q2", "Q3", "Q4"].map((q) => {
                      const entry = ind.latest_by_quarter[q];
                      return (
                        <div key={q} className="text-center">
                          <div className="text-xs text-gray-400">{q}</div>
                          <div className="text-sm font-semibold text-gray-700">
                            {entry ? `${fmt(entry.value)}` : "—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
