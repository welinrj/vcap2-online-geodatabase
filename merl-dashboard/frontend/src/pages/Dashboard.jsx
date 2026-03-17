import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BarChart2, AlertTriangle, Users, Upload, Map,
  TrendingUp, TrendingDown, Minus, ArrowRight,
  CheckCircle2, Clock, XCircle, AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import axios from 'axios';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);
const fmtVUV = (n) => `VUV ${new Intl.NumberFormat().format(n ?? 0)}`;

const EVENT_COLOURS = {
  cyclone:   '#ef4444',
  flood:     '#3b82f6',
  drought:   '#f97316',
  sea_level: '#8b5cf6',
  other:     '#6b7280',
};

const STATUS_CONFIG = {
  completed:   { label: 'Completed',   cls: 'badge-green',  icon: CheckCircle2 },
  in_progress: { label: 'In Progress', cls: 'badge-blue',   icon: Clock },
  delayed:     { label: 'Delayed',     cls: 'badge-yellow', icon: AlertCircle },
  not_started: { label: 'Not Started', cls: 'badge-gray',   icon: Minus },
  cancelled:   { label: 'Cancelled',   cls: 'badge-red',    icon: XCircle },
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ title, value, subtitle, trend, colour = 'blue' }) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColour = trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-400';

  const colourMap = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-purple-50 text-purple-700',
  };

  return (
    <div className="card flex flex-col gap-2">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <div className="flex items-end justify-between">
        <span className={`text-2xl font-bold ${colourMap[colour]?.split(' ')[1] ?? 'text-gray-900'}`}>
          {value}
        </span>
        {trend && (
          <TrendIcon size={18} className={trendColour} />
        )}
      </div>
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ label, value, total, colour = 'bg-blue-600' }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{value} / {total} ({pct}%)</span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colour}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

// ── Quick action button ───────────────────────────────────────────────────────
function QuickAction({ to, icon: Icon, label, colour }) {
  const colourMap = {
    blue:   'bg-blue-50 text-blue-700 hover:bg-blue-100',
    green:  'bg-green-50 text-green-700 hover:bg-green-100',
    orange: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
    purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100',
  };
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-sm transition-colors ${colourMap[colour] ?? colourMap.blue}`}
    >
      <Icon size={20} />
      {label}
      <ArrowRight size={14} className="ml-auto opacity-50" />
    </Link>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { t } = useTranslation();

  const { data: summary, isLoading: loadingSummary, error: errorSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => axios.get('/api/indicators/dashboard').then((r) => r.data),
  });

  const { data: eventsData, isLoading: loadingEvents } = useQuery({
    queryKey: ['recent-events'],
    queryFn: () => axios.get('/api/events?limit=5&sort=start_date:desc').then((r) => r.data),
  });

  const { data: activitiesData, isLoading: loadingActivities } = useQuery({
    queryKey: ['activity-summary'],
    queryFn: () => axios.get('/api/activities?limit=100').then((r) => r.data),
  });

  // Derive activity status breakdown for progress bars
  const activityStats = React.useMemo(() => {
    const items = activitiesData?.items ?? activitiesData ?? [];
    const total = items.length;
    const completed  = items.filter((a) => a.status === 'completed').length;
    const inProgress = items.filter((a) => a.status === 'in_progress').length;
    const delayed    = items.filter((a) => a.status === 'delayed').length;
    return { total, completed, inProgress, delayed };
  }, [activitiesData]);

  // Derive financial pie data from summary
  const financePieData = React.useMemo(() => {
    const fin = summary?.financials;
    if (!fin) return [];
    return [
      { name: 'Expended',   value: fin.total_expended_vuv  ?? 0, colour: '#ef4444' },
      { name: 'Remaining',  value: fin.remaining_vuv       ?? 0, colour: '#22c55e' },
      { name: 'Uncommitted',value: fin.uncommitted_vuv     ?? 0, colour: '#94a3b8' },
    ].filter((d) => d.value > 0);
  }, [summary]);

  const events = eventsData?.items ?? eventsData ?? [];
  const kpi = summary?.indicators ?? {};
  const engagement = summary?.engagement ?? {};
  const finance = summary?.financials ?? {};

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{t('dashboard.subtitle')}</p>
      </div>

      {/* Error banner */}
      {errorSummary && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {errorSummary.message}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
          {t('dashboard.kpi')}
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loadingSummary ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))
          ) : (
            <>
              <KpiCard
                title="Indicators On Track"
                value={`${kpi.on_track ?? 0} / ${kpi.total ?? 0}`}
                subtitle={`${kpi.achieved_pct ?? 0}% of targets met`}
                trend="up"
                colour="green"
              />
              <KpiCard
                title="Activities Completed"
                value={`${activityStats.completed} / ${activityStats.total}`}
                subtitle={`${activityStats.inProgress} in progress`}
                trend={activityStats.delayed > 0 ? 'down' : 'up'}
                colour="blue"
              />
              <KpiCard
                title="Community Engagements"
                value={fmt(engagement.total_engagements)}
                subtitle={`${fmt(engagement.total_participants)} participants`}
                colour="purple"
              />
              <KpiCard
                title="Total Disbursed"
                value={fmtVUV(finance.total_disbursed_vuv)}
                subtitle={`${finance.burn_rate_pct ?? 0}% utilisation`}
                colour="orange"
              />
            </>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Activity Progress ── */}
        <section className="lg:col-span-2 card space-y-4">
          <h3 className="font-semibold text-gray-900">{t('dashboard.activityProgress')}</h3>
          {loadingActivities ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <ProgressBar
                label="Overall Completion"
                value={activityStats.completed}
                total={activityStats.total}
                colour="bg-green-500"
              />
              <ProgressBar
                label="In Progress"
                value={activityStats.inProgress}
                total={activityStats.total}
                colour="bg-blue-500"
              />
              {activityStats.delayed > 0 && (
                <ProgressBar
                  label="Delayed"
                  value={activityStats.delayed}
                  total={activityStats.total}
                  colour="bg-yellow-400"
                />
              )}
            </div>
          )}
          <Link
            to="/activities"
            className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline mt-2"
          >
            View all activities <ArrowRight size={14} />
          </Link>
        </section>

        {/* ── Financial Donut ── */}
        <section className="card space-y-3">
          <h3 className="font-semibold text-gray-900">{t('dashboard.financialSummary')}</h3>
          {loadingSummary ? (
            <Skeleton className="h-40 w-full" />
          ) : financePieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={financePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {financePieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.colour} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => fmtVUV(v)}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">{t('common.noData')}</p>
          )}
          <Link to="/financials" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
            View financials <ArrowRight size={14} />
          </Link>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Recent Events ── */}
        <section className="lg:col-span-2 card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{t('dashboard.recentEvents')}</h3>
            <Link to="/events" className="text-sm text-blue-700 hover:underline">{t('common.all')}</Link>
          </div>
          {loadingEvents ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">{t('common.noData')}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-start gap-3 py-2.5">
                  <span
                    className="mt-0.5 h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: EVENT_COLOURS[ev.event_type] ?? EVENT_COLOURS.other }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{ev.name}</p>
                    <p className="text-xs text-gray-400">
                      {ev.event_type?.replace('_', ' ')} &middot;{' '}
                      {ev.start_date ? format(parseISO(ev.start_date), 'd MMM yyyy') : '—'}
                    </p>
                  </div>
                  {ev.economic_loss_vuv > 0 && (
                    <span className="ml-auto text-xs text-red-600 font-medium whitespace-nowrap">
                      {fmtVUV(ev.economic_loss_vuv)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Quick Actions ── */}
        <section className="card space-y-3">
          <h3 className="font-semibold text-gray-900">{t('dashboard.quickLinks')}</h3>
          <div className="space-y-2">
            <QuickAction to="/events"            icon={AlertTriangle} label={t('dashboard.reportEvent')}  colour="orange" />
            <QuickAction to="/community"         icon={Users}         label={t('dashboard.addEngagement')} colour="green"  />
            <QuickAction to="/upload"            icon={Upload}        label={t('dashboard.uploadData')}    colour="blue"   />
            <QuickAction to="/map"               icon={Map}           label={t('dashboard.viewMap')}       colour="purple" />
            <QuickAction to="/community-report"  icon={BarChart2}     label={t('nav.communityReport')}     colour="blue"   />
          </div>
        </section>
      </div>
    </div>
  );
}
