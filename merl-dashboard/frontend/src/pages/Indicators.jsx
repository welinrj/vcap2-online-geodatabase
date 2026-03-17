import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';
import { BarChart2, Plus, X, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import axios from 'axios';
import IndicatorValueForm from '../components/DataEntryForm/IndicatorValueForm';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DOMAINS = ['All', 'Governance', 'Finance', 'Community', 'Environment', 'GEDSI', 'Knowledge'];

function ProgressBar({ value, target, colour = 'bg-blue-600' }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const colourClass =
    pct >= 100 ? 'bg-green-500' :
    pct >= 75  ? 'bg-blue-500'  :
    pct >= 50  ? 'bg-yellow-400':
                 'bg-red-400';

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colourClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-600 w-9 text-right">{pct}%</span>
    </div>
  );
}

// ── Trend Modal ───────────────────────────────────────────────────────────────
function TrendModal({ indicator, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['indicator-values', indicator.id],
    queryFn: () => axios.get(`/api/indicators/${indicator.id}/values`).then((r) => r.data),
  });

  const chartData = useMemo(() => {
    const values = data?.values ?? data ?? [];
    return values
      .slice()
      .sort((a, b) => new Date(a.reporting_period) - new Date(b.reporting_period))
      .map((v) => ({
        period: v.reporting_period ? format(parseISO(v.reporting_period), 'MMM yy') : '—',
        value: v.value,
        target: indicator.target_value,
      }));
  }, [data, indicator]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-lg leading-snug">{indicator.indicator_name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{indicator.domain} — Target: {indicator.target_value} {indicator.unit}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No values recorded yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={indicator.target_value} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'Target', fontSize: 11, fill: '#22c55e' }} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                name={indicator.unit ?? 'Value'}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        <div className="flex justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Indicators Page ───────────────────────────────────────────────────────────
export default function Indicators() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState('All');
  const [search, setSearch] = useState('');
  const [trendIndicator, setTrendIndicator] = useState(null);
  const [addValueIndicator, setAddValueIndicator] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['indicators'],
    queryFn: () => axios.get('/api/indicators').then((r) => r.data),
  });

  const indicators = useMemo(() => {
    let items = data?.items ?? data ?? [];
    if (domain !== 'All') items = items.filter((i) => i.domain === domain);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.indicator_name?.toLowerCase().includes(q) ||
          i.indicator_code?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, domain, search]);

  const handleValueAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['indicators'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    setAddValueIndicator(null);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('indicators.title')}</h2>
          <p className="text-sm text-gray-500">{indicators.length} indicator{indicators.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setAddValueIndicator({ id: null })}
          className="btn-primary"
        >
          <Plus size={16} /> {t('indicators.addValue')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder={`${t('common.search')}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field-input max-w-xs"
        />
        <div className="flex gap-1 flex-wrap">
          {DOMAINS.map((d) => (
            <button
              key={d}
              onClick={() => setDomain(d)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                domain === d
                  ? 'bg-blue-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error.message}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-16">Code</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Indicator</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Domain</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Target</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Achieved</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Progress</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : indicators.length === 0
                ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        {t('indicators.noIndicators')}
                      </td>
                    </tr>
                  )
                : indicators.map((ind) => (
                    <tr key={ind.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{ind.indicator_code}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                        <span title={ind.indicator_name} className="line-clamp-2">{ind.indicator_name}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="badge badge-blue">{ind.domain}</span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell text-gray-600">
                        {ind.target_value} {ind.unit}
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell font-semibold text-gray-900">
                        {ind.achieved_value ?? 0} {ind.unit}
                      </td>
                      <td className="px-4 py-3">
                        <ProgressBar value={ind.achieved_value ?? 0} target={ind.target_value ?? 1} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            title="View trend"
                            onClick={() => setTrendIndicator(ind)}
                            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <TrendingUp size={15} />
                          </button>
                          <button
                            title="Add value"
                            onClick={() => setAddValueIndicator(ind)}
                            className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Modal */}
      {trendIndicator && (
        <TrendModal indicator={trendIndicator} onClose={() => setTrendIndicator(null)} />
      )}

      {/* Add Value Modal */}
      {addValueIndicator && (
        <IndicatorValueForm
          preselectedId={addValueIndicator.id}
          onSuccess={handleValueAdded}
          onClose={() => setAddValueIndicator(null)}
        />
      )}
    </div>
  );
}
