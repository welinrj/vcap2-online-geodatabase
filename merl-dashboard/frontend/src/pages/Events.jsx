import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Plus, Map } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import axios from 'axios';
import EventForm from '../components/DataEntryForm/EventForm';

// ── Type config ───────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  cyclone:    { label: 'Cyclone',       cls: 'bg-red-100 text-red-800',      dot: 'bg-red-500' },
  flood:      { label: 'Flood',         cls: 'bg-blue-100 text-blue-800',    dot: 'bg-blue-500' },
  drought:    { label: 'Drought',       cls: 'bg-orange-100 text-orange-800',dot: 'bg-orange-500' },
  sea_level:  { label: 'Sea Level Rise',cls: 'bg-purple-100 text-purple-800',dot: 'bg-purple-500' },
  earthquake: { label: 'Earthquake',    cls: 'bg-yellow-100 text-yellow-800',dot: 'bg-yellow-500' },
  landslide:  { label: 'Landslide',     cls: 'bg-amber-100 text-amber-800',  dot: 'bg-amber-600' },
  other:      { label: 'Other',         cls: 'bg-gray-100 text-gray-700',    dot: 'bg-gray-400' },
};

const ONSET_LABELS = { rapid: 'Rapid Onset', slow: 'Slow Onset' };

function EventTypeBadge({ type }) {
  const cfg = TYPE_CONFIG[type] ?? TYPE_CONFIG.other;
  return (
    <span className={`badge ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

// ── Events Page ───────────────────────────────────────────────────────────────
export default function Events() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: () => axios.get('/api/events?sort=start_date:desc').then((r) => r.data),
  });

  const events = useMemo(() => {
    let items = data?.items ?? data ?? [];
    if (typeFilter !== 'All') items = items.filter((e) => e.event_type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          e.name?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.islands_affected?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, typeFilter, search]);

  // Totals
  const totals = useMemo(() => {
    const items = data?.items ?? data ?? [];
    return {
      count: items.length,
      totalLoss: items.reduce((sum, e) => sum + (e.economic_loss_vuv ?? 0), 0),
    };
  }, [data]);

  const handleAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['recent-events'] });
    setShowForm(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('events.title')}</h2>
          <p className="text-sm text-gray-500">
            {totals.count} event{totals.count !== 1 ? 's' : ''} &mdash; Total economic loss: VUV {fmt(totals.totalLoss)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/map" className="btn-secondary">
            <Map size={16} /> {t('nav.mapView')}
          </Link>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus size={16} /> {t('events.reportEvent')}
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
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setTypeFilter('All')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              typeFilter === 'All' ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                typeFilter === key ? cfg.cls + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cfg.label}
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

      {/* Event Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="h-5 w-2/3 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-1/3 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="card text-center py-16">
          <AlertTriangle size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">{t('common.noData')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {events.map((ev) => (
            <div key={ev.id} className="card space-y-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900 leading-snug">{ev.name}</h3>
                <EventTypeBadge type={ev.event_type} />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                <div>
                  <span className="font-medium text-gray-600">Onset: </span>
                  {ONSET_LABELS[ev.onset_type] ?? ev.onset_type ?? '—'}
                </div>
                <div>
                  <span className="font-medium text-gray-600">Start: </span>
                  {ev.start_date ? format(parseISO(ev.start_date), 'd MMM yyyy') : '—'}
                </div>
                {ev.end_date && (
                  <div>
                    <span className="font-medium text-gray-600">End: </span>
                    {format(parseISO(ev.end_date), 'd MMM yyyy')}
                  </div>
                )}
                {ev.economic_loss_vuv != null && ev.economic_loss_vuv > 0 && (
                  <div className="col-span-2">
                    <span className="font-medium text-red-600">Economic Loss: </span>
                    <span className="text-red-700 font-semibold">VUV {fmt(ev.economic_loss_vuv)}</span>
                  </div>
                )}
              </div>

              {ev.islands_affected && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-600">Islands: </span>
                  {Array.isArray(ev.islands_affected)
                    ? ev.islands_affected.join(', ')
                    : ev.islands_affected}
                </p>
              )}

              {ev.description && (
                <p className="text-xs text-gray-500 line-clamp-3">{ev.description}</p>
              )}

              {ev.response_actions && (
                <div className="pt-2 border-t border-gray-50">
                  <p className="text-xs font-medium text-gray-600 mb-0.5">Response Actions</p>
                  <p className="text-xs text-gray-500 line-clamp-2">{ev.response_actions}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Report Event Modal */}
      {showForm && (
        <EventForm
          onSuccess={handleAdded}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
