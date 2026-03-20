import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer,
} from 'recharts';
import { CheckSquare, Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO, differenceInDays } from 'date-fns';
import axios from 'axios';
import ActivityForm from '../components/DataEntryForm/ActivityForm';

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_COLOURS = {
  completed:   { bg: 'bg-green-100',  text: 'text-green-800',  bar: '#22c55e' },
  in_progress: { bg: 'bg-blue-100',   text: 'text-blue-800',   bar: '#3b82f6' },
  delayed:     { bg: 'bg-yellow-100', text: 'text-yellow-800', bar: '#eab308' },
  not_started: { bg: 'bg-gray-100',   text: 'text-gray-600',   bar: '#94a3b8' },
  cancelled:   { bg: 'bg-red-100',    text: 'text-red-800',    bar: '#ef4444' },
};

const PHASES = ['All', 'Phase 1', 'Phase 2', 'Phase 3'];
const STATUSES = ['All', 'not_started', 'in_progress', 'completed', 'delayed', 'cancelled'];

function StatusBadge({ status }) {
  const cfg = STATUS_COLOURS[status] ?? STATUS_COLOURS.not_started;
  return (
    <span className={`badge ${cfg.bg} ${cfg.text} capitalize`}>
      {status?.replace('_', ' ') ?? 'Unknown'}
    </span>
  );
}

// ── Gantt-style bar ───────────────────────────────────────────────────────────
function GanttView({ activities }) {
  // Compute a relative duration for each activity for the bar chart
  const chartData = useMemo(() => {
    return activities
      .filter((a) => a.start_date && a.end_date)
      .slice(0, 20) // limit for readability
      .map((a) => {
        const start = parseISO(a.start_date);
        const end   = parseISO(a.end_date);
        const duration = Math.max(1, differenceInDays(end, start));
        return {
          name: a.activity_code ?? a.activity_name?.slice(0, 25),
          duration,
          status: a.status,
          label: a.activity_name,
        };
      });
  }, [activities]);

  if (chartData.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">No date information available for Gantt view</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 30 + 40)}>
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
        <XAxis
          type="number"
          tick={{ fontSize: 10 }}
          label={{ value: 'Days', position: 'insideBottom', offset: -5, fontSize: 11 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10 }}
          width={75}
        />
        <Tooltip
          formatter={(v, n, props) => [`${v} days`, props.payload.label]}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
        />
        <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
          {chartData.map((entry) => (
            <Cell
              key={entry.name}
              fill={STATUS_COLOURS[entry.status]?.bar ?? '#94a3b8'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Milestone row ─────────────────────────────────────────────────────────────
function MilestoneList({ activityId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['milestones', activityId],
    queryFn: () => axios.get(`/api/activities/${activityId}/milestones`).then((r) => r.data),
  });

  const milestones = data?.milestones ?? data ?? [];

  if (isLoading) return <div className="py-2 text-xs text-gray-400">Loading milestones…</div>;
  if (milestones.length === 0) return <div className="py-2 text-xs text-gray-400">No milestones recorded</div>;

  return (
    <ul className="mt-2 space-y-1 pl-4">
      {milestones.map((m) => (
        <li key={m.id} className="flex items-center gap-2 text-xs text-gray-600">
          <span
            className={`h-2 w-2 rounded-full flex-shrink-0 ${
              m.completed ? 'bg-green-500' : 'bg-gray-300'
            }`}
          />
          <span className={m.completed ? 'line-through text-gray-400' : ''}>{m.milestone_name}</span>
          {m.due_date && (
            <span className="ml-auto text-gray-400">
              {format(parseISO(m.due_date), 'd MMM yyyy')}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Activities Page ───────────────────────────────────────────────────────────
export default function Activities() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'gantt'
  const [expandedId, setExpandedId] = useState(null);
  const [updateActivity, setUpdateActivity] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['activities'],
    queryFn: () => axios.get('/api/activities').then((r) => r.data),
  });

  const activities = useMemo(() => {
    let items = data?.items ?? data ?? [];
    if (phase !== 'All') items = items.filter((a) => a.phase === phase);
    if (statusFilter !== 'All') items = items.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (a) =>
          a.activity_name?.toLowerCase().includes(q) ||
          a.activity_code?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, phase, statusFilter, search]);

  const handleUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['activities'] });
    setUpdateActivity(null);
  };

  const toggleExpand = (id) => setExpandedId((cur) => (cur === id ? null : id));

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('activities.title')}</h2>
          <p className="text-sm text-gray-500">{activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('list')}
            className={`btn ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
          >
            List
          </button>
          <button
            onClick={() => setView('gantt')}
            className={`btn ${view === 'gantt' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Gantt
          </button>
        </div>
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
        <select
          value={phase}
          onChange={(e) => setPhase(e.target.value)}
          className="field-input w-auto"
        >
          {PHASES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="field-input w-auto capitalize"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error.message}
        </div>
      )}

      {/* ── Gantt View ── */}
      {view === 'gantt' && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold text-gray-900 mb-4">Activity Timeline (Duration in Days)</h3>
          {isLoading ? (
            <div className="h-48 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <GanttView activities={activities} />
          )}
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-50">
            {Object.entries(STATUS_COLOURS).map(([s, c]) => (
              <span key={s} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.bar }} />
                {s.replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── List View ── */}
      {view === 'list' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-8" />
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-20">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Activity</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Phase</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Start</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">End</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : activities.length === 0
                  ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                          {t('common.noData')}
                        </td>
                      </tr>
                    )
                  : activities.map((act) => (
                      <React.Fragment key={act.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleExpand(act.id)}
                              className="p-0.5 rounded text-gray-400 hover:text-gray-700"
                            >
                              {expandedId === act.id
                                ? <ChevronDown size={15} />
                                : <ChevronRight size={15} />}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{act.activity_code}</td>
                          <td className="px-4 py-3 font-medium text-gray-800 max-w-xs">
                            <span className="line-clamp-2">{act.activity_name}</span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-gray-500">{act.phase ?? '—'}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={act.status} />
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                            {act.start_date ? format(parseISO(act.start_date), 'd MMM yy') : '—'}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                            {act.end_date ? format(parseISO(act.end_date), 'd MMM yy') : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setUpdateActivity(act)}
                              className="text-xs text-blue-700 hover:underline whitespace-nowrap"
                            >
                              Update
                            </button>
                          </td>
                        </tr>
                        {expandedId === act.id && (
                          <tr className="bg-blue-50/30">
                            <td colSpan={8} className="px-8 py-3">
                              <p className="text-xs font-semibold text-gray-500 mb-1">Milestones</p>
                              <MilestoneList activityId={act.id} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Update Modal */}
      {updateActivity && (
        <ActivityForm
          activity={updateActivity}
          onSuccess={handleUpdated}
          onClose={() => setUpdateActivity(null)}
        />
      )}
    </div>
  );
}
