import React from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import axios from 'axios';

const TRANSACTION_TYPES = [
  { value: 'disbursement', label: 'Disbursement' },
  { value: 'expenditure',  label: 'Expenditure' },
  { value: 'refund',       label: 'Refund' },
  { value: 'transfer',     label: 'Transfer' },
];

const PAYMENT_METHODS = [
  'Bank Transfer',
  'Cheque',
  'Cash',
  'Mobile Money',
  'Direct Debit',
  'Other',
];

export default function FinancialForm({ onSuccess, onClose }) {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      transaction_date: new Date().toISOString().slice(0, 10),
      description: '',
      amount_vuv: '',
      amount_nzd: '',
      transaction_type: '',
      activity_id: '',
      donor_reference: '',
      payment_method: '',
    },
  });

  const amountVuv = watch('amount_vuv');

  // Load activities for dropdown
  const { data: activitiesData, isLoading: loadingActivities } = useQuery({
    queryKey: ['activities'],
    queryFn: () => axios.get('/api/activities').then((r) => r.data),
  });

  const activities = activitiesData?.items ?? activitiesData ?? [];

  const mutation = useMutation({
    mutationFn: (formData) =>
      axios.post('/api/financials/transactions', {
        ...formData,
        amount_vuv: formData.amount_vuv ? Number(formData.amount_vuv) : null,
        amount_nzd: formData.amount_nzd ? Number(formData.amount_nzd) : null,
        activity_id: formData.activity_id || null,
      }),
    onSuccess: () => {
      toast.success('Transaction recorded successfully');
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? err.message ?? t('common.error'));
    },
  });

  const onSubmit = (data) => mutation.mutate(data);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{t('financials.addTransaction')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Date + Type row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">
                {t('financials.date')} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                {...register('transaction_date', { required: t('common.required') })}
                className="field-input"
              />
              {errors.transaction_date && (
                <p className="field-error">{errors.transaction_date.message}</p>
              )}
            </div>
            <div>
              <label className="field-label">
                {t('financials.type')} <span className="text-red-500">*</span>
              </label>
              <select
                {...register('transaction_type', { required: t('common.required') })}
                className="field-input"
              >
                <option value="">{t('form.selectOption')}</option>
                {TRANSACTION_TYPES.map((tt) => (
                  <option key={tt.value} value={tt.value}>{tt.label}</option>
                ))}
              </select>
              {errors.transaction_type && (
                <p className="field-error">{errors.transaction_type.message}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="field-label">
              {t('financials.description')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('description', { required: t('common.required') })}
              className="field-input"
              placeholder="Brief description of the transaction"
            />
            {errors.description && (
              <p className="field-error">{errors.description.message}</p>
            )}
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">
                Amount (VUV) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">
                  VUV
                </span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  {...register('amount_vuv', {
                    required: t('common.required'),
                    min: { value: 0, message: 'Must be 0 or greater' },
                  })}
                  className="field-input pl-10"
                  placeholder="0"
                />
              </div>
              {errors.amount_vuv && (
                <p className="field-error">{errors.amount_vuv.message}</p>
              )}
            </div>
            <div>
              <label className="field-label">Amount (NZD) {t('common.optional')}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">
                  NZD
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('amount_nzd')}
                  className="field-input pl-10"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Activity */}
          <div>
            <label className="field-label">{t('financials.activity')} {t('common.optional')}</label>
            {loadingActivities ? (
              <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <select {...register('activity_id')} className="field-input">
                <option value="">— None —</option>
                {activities.map((act) => (
                  <option key={act.id} value={act.id}>
                    [{act.activity_code}] {act.activity_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Donor Reference + Payment Method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">{t('financials.donorRef')} {t('common.optional')}</label>
              <input
                type="text"
                {...register('donor_reference')}
                className="field-input"
                placeholder="e.g. MFAT-2024-001"
              />
            </div>
            <div>
              <label className="field-label">{t('financials.paymentMethod')} {t('common.optional')}</label>
              <select {...register('payment_method')} className="field-input">
                <option value="">{t('form.selectOption')}</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary"
            >
              {mutation.isPending ? t('form.submitting') : t('form.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
