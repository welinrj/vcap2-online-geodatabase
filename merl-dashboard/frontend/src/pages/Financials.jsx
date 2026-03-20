import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import axios from 'axios';
import FinancialForm from '../components/DataEntryForm/FinancialForm';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat().format(Math.round(n ?? 0));
const fmtVUV = (n) => `VUV ${fmt(n)}`;
const fmtNZD = (n) => `NZD ${new Intl.NumberFormat('en-NZ', { minimumFractionDigits: 2 }).format(n ?? 0)}`;

const TX_TYPE_COLOURS = {
  disbursement: 'badge-blue',
  expenditure:  'badge-red',
  refund:       'badge-green',
  transfer:     'badge-purple',
};

const PAGE_SIZE = 20;

// ── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({ label, vuv, nzd, colour = 'blue', note }) {
  const map = {
    blue:   { ring: 'border-l-blue-600',   text: 'text-blue-700' },
    green:  { ring: 'border-l-green-600',  text: 'text-green-700' },
    orange: { ring: 'border-l-orange-500', text: 'text-orange-700' },
    gray:   { ring: 'border-l-gray-400',   text: 'text-gray-600' },
  };
  const cfg = map[colour] ?? map.blue;

  return (
    <div className={`card border-l-4 ${cfg.ring}`}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${cfg.text}`}>{fmtVUV(vuv)}</p>
      {nzd != null && <p className="text-xs text-gray-400 mt-0.5">{fmtNZD(nzd)}</p>}
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  );
}

// ── Financials Page ───────────────────────────────────────────────────────────
export default function Financials() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');

  // Summary
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['financial-summary'],
    queryFn: () => axios.get('/api/financials/summary').then((r) => r.data),
  });

  // Transactions
  const { data: txData, isLoading: loadingTx, error } = useQuery({
    queryKey: ['transactions', page, typeFilter],
    queryFn: () =>
      axios
        .get('/api/financials/transactions', {
          params: {
            page,
            per_page: PAGE_SIZE,
            transaction_type: typeFilter !== 'All' ? typeFilter : undefined,
          },
        })
        .then((r) => r.data),
    keepPreviousData: true,
  });

  const transactions = txData?.items ?? txData?.transactions ?? [];
  const totalPages = txData?.total_pages ?? Math.ceil((txData?.total ?? 0) / PAGE_SIZE);
  const totalCount = txData?.total ?? 0;

  const s = summary ?? {};

  const handleAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    setShowForm(false);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t('financials.title')}</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={16} /> {t('financials.addTransaction')}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loadingSummary ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card border-l-4 border-l-gray-200 space-y-2">
              <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
              <div className="h-8 w-1/2 bg-gray-100 rounded animate-pulse" />
            </div>
          ))
        ) : (
          <>
            <SummaryCard
              label={t('financials.totalDisbursed')}
              vuv={s.total_disbursed_vuv}
              nzd={s.total_disbursed_nzd}
              colour="blue"
            />
            <SummaryCard
              label={t('financials.totalExpended')}
              vuv={s.total_expended_vuv}
              nzd={s.total_expended_nzd}
              colour="orange"
              note={s.burn_rate_pct != null ? `${s.burn_rate_pct}% utilisation` : undefined}
            />
            <SummaryCard
              label={t('financials.remaining')}
              vuv={(s.total_disbursed_vuv ?? 0) - (s.total_expended_vuv ?? 0)}
              nzd={s.remaining_nzd}
              colour="green"
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm font-medium text-gray-600">Filter by type:</label>
        {['All', 'disbursement', 'expenditure', 'refund', 'transfer'].map((tp) => (
          <button
            key={tp}
            onClick={() => { setTypeFilter(tp); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${
              typeFilter === tp
                ? 'bg-blue-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tp === 'All' ? 'All Types' : tp}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {t('common.error')}: {error.message}
        </div>
      )}

      {/* Transaction Table */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Transactions</h3>
          <span className="text-xs text-gray-400">{totalCount} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Activity</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Amount (VUV)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">Amount (NZD)</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">Donor Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loadingTx
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : transactions.length === 0
                ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        {t('common.noData')}
                      </td>
                    </tr>
                  )
                : transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {tx.transaction_date ? format(parseISO(tx.transaction_date), 'd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-800 max-w-xs">
                        <span className="line-clamp-2">{tx.description}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                        {tx.activity_code ?? tx.activity_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${TX_TYPE_COLOURS[tx.transaction_type] ?? 'badge-gray'} capitalize`}>
                          {tx.transaction_type?.replace('_', ' ') ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {fmt(tx.amount_vuv)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">
                        {tx.amount_nzd != null ? fmtNZD(tx.amount_nzd) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                        {tx.donor_reference ?? '—'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary p-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-secondary p-1.5 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Transaction Modal */}
      {showForm && (
        <FinancialForm
          onSuccess={handleAdded}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
