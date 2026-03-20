import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import axios from 'axios';
import EngagementForm from '../components/DataEntryForm/EngagementForm';

const fmt = (n) => new Intl.NumberFormat().format(n ?? 0);

const PROVINCES = ['All', 'Malampa', 'Penama', 'Sanma', 'Shefa', 'Tafea', 'Torba'];

// ── GEDSI summary bar ─────────────────────────────────────────────────────────
function GedsiBar({ male, female, youth, disability, total }) {
  if (!total) return null;
  const pctMale  = Math.round(((male ?? 0) / total) * 100);
  const pctFem   = Math.round(((female ?? 0) / total) * 100);
  return (
    <div className="space-y-1">
      <div className="h-2 w-full flex rounded-full overflow-hidden">
        <div className="bg-blue-400"    style={{ width: `${pctMale}%` }} title={`Male ${pctMale}%`} />
        <div className="bg-pink-400"   style={{ width: `${pctFem}%` }}  title={`Female ${pctFem}%`} />
        <div className="bg-gray-200"   style={{ width: `${100 - pctMale - pctFem}%` }} />
      </div>
      <div className="flex gap-3 text-xs text-gray-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />Male {pctMale}%</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-pink-400 mr-1" />Female {pctFem}%</span>
        {youth > 0 && <span className="text-green-600">Youth: {fmt(youth)}</span>}
        {disability > 0 && <span className="text-purple-600">Disability: {fmt(disability)}</span>}
      </div>
    </div>
  );
}

export default function Community() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [province, setProvince] = useState('All');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['engagements'],
    queryFn: () => axios.get('/api/community/engagements?sort=engagement_date:desc').then((r) => r.data),
  });

  const engagements = useMemo(() => {
    let items = data?.items ?? data ?? [];
    if (province !== 'All') items = items.filter((e) => e.province === province);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (e) =>
          e.community_name?.toLowerCase().includes(q) ||
          e.island?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, province, search]);

  // Aggregate totals
  const totals = useMemo(() => {
    const items = data?.items ?? data ?? [];
    return {
      engagements: items.length,
      participants: items.reduce((s, e) => s + (e.total_participants ?? 0), 0),
      female:  items.reduce((s, e) => s + (e.female_participants ?? 0), 0),
      male:    items.reduce((s, e) => s + (e.male_participants ?? 0), 0),
      youth:   items.reduce((s, e) => s + (e.youth_participants ?? 0), 0),
      disability: items.reduce((s, e) => s + (e.disability_participants ?? 0), 0),
    };
  }, [data]);

  const handleAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['engagements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    setShowForm(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('community.title')}</h2>
          <p className="text-sm text-gray-500">
            {fmt(totals.engagements)} engagements · {fmt(totals.participants)} participants
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> {t('form.addRecord')}
        </button>
      </div>

      {/* Aggregate GEDSI */}
      {totals.participants > 0 && (
        <div className="card space-y-2">
          <h3 className="font-semibold text-gray-800 text-sm">Cumulative GEDSI Breakdown</h3>
          <GedsiBar
            male={totals.male}
            female={totals.female}
            youth={totals.youth}
            disability={totals.disability}
            total={totals.participants}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {[
              { label: 'Male',       value: totals.male,       colour: 'text-blue-700' },
              { label: 'Female',     value: totals.female,     colour: 'text-pink-700' },
              { label: 'Youth',      value: totals.youth,      colour: 'text-green-700' },
              { label: 'Disability', value: totals.disability, colour: 'text-purple-700' },
            ].map(({ label, value, colour }) => (
              <div key={label} className="text-center">
                <p className={`text-xl font-bold ${colour}`}>{fmt(value)}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder={`${t('common.search')} community…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field-input max-w-xs"
        />
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          className="field-input w-auto"
        >
          {PROVINCES.map((p) => <option key={p}>{p}</option>)}
        </select>
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
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Community</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Island</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Province</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Type</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Participants</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">GEDSI</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Follow-up</th>
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
                : engagements.length === 0
                ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                        {t('common.noData')}
                      </td>
                    </tr>
                  )
                : engagements.map((eng) => (
                    <tr key={eng.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{eng.community_name}</td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{eng.island ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{eng.province ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell whitespace-nowrap">
                        {eng.engagement_date ? format(parseISO(eng.engagement_date), 'd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="badge badge-blue">{eng.engagement_type ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {fmt(eng.total_participants)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell min-w-[160px]">
                        <GedsiBar
                          male={eng.male_participants}
                          female={eng.female_participants}
                          youth={eng.youth_participants}
                          disability={eng.disability_participants}
                          total={eng.total_participants}
                        />
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        {eng.follow_up_required ? (
                          <span className="badge badge-yellow">Yes</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Engagement Modal */}
      {showForm && (
        <EngagementForm
          onSuccess={handleAdded}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
