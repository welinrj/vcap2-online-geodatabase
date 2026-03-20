import React from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import axios from 'axios';

const PROVINCES = ['Malampa', 'Penama', 'Sanma', 'Shefa', 'Tafea', 'Torba'];

export default function IndicatorValueForm({ preselectedId = null, onSuccess, onClose }) {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      indicator_id: preselectedId ?? '',
      value: '',
      reporting_period: '',
      location_island: '',
      location_province: '',
      notes: '',
    },
  });

  const selectedIndicatorId = watch('indicator_id');

  // Load indicators list
  const { data: indicatorsData, isLoading: loadingIndicators } = useQuery({
    queryKey: ['indicators'],
    queryFn: () => axios.get('/api/indicators').then((r) => r.data),
  });

  const indicators = indicatorsData?.items ?? indicatorsData ?? [];

  // Find unit for selected indicator
  const selectedIndicator = indicators.find(
    (i) => String(i.id) === String(selectedIndicatorId)
  );

  const mutation = useMutation({
    mutationFn: async (formData) => {
      const id = formData.indicator_id;
      const body = new FormData();
      body.append('value', formData.value);
      body.append('reporting_period', formData.reporting_period);
      if (formData.location_island) body.append('location_island', formData.location_island);
      if (formData.location_province) body.append('location_province', formData.location_province);
      if (formData.notes) body.append('notes', formData.notes);
      if (formData.evidence_file?.[0]) body.append('evidence_file', formData.evidence_file[0]);

      return axios.post(`/api/indicators/${id}/values`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Indicator value recorded successfully');
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
          <h2 className="text-lg font-bold text-gray-900">Record Indicator Value</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Indicator Select */}
          <div>
            <label className="field-label">
              Indicator <span className="text-red-500">*</span>
            </label>
            {loadingIndicators ? (
              <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <select
                {...register('indicator_id', { required: t('common.required') })}
                className="field-input"
                disabled={Boolean(preselectedId)}
              >
                <option value="">{t('form.selectOption')}</option>
                {indicators.map((ind) => (
                  <option key={ind.id} value={ind.id}>
                    [{ind.indicator_code}] {ind.indicator_name}
                  </option>
                ))}
              </select>
            )}
            {errors.indicator_id && (
              <p className="field-error">{errors.indicator_id.message}</p>
            )}
            {selectedIndicator && (
              <p className="mt-1 text-xs text-blue-600">
                Current: {selectedIndicator.achieved_value ?? 0} / Target: {selectedIndicator.target_value} {selectedIndicator.unit}
              </p>
            )}
          </div>

          {/* Value */}
          <div>
            <label className="field-label">
              Value {selectedIndicator?.unit && `(${selectedIndicator.unit})`}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              {...register('value', {
                required: t('common.required'),
                min: { value: 0, message: 'Value must be 0 or greater' },
              })}
              className="field-input"
              placeholder="0"
            />
            {errors.value && <p className="field-error">{errors.value.message}</p>}
          </div>

          {/* Reporting Period */}
          <div>
            <label className="field-label">
              Reporting Period <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              {...register('reporting_period', { required: t('common.required') })}
              className="field-input"
            />
            {errors.reporting_period && (
              <p className="field-error">{errors.reporting_period.message}</p>
            )}
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Island {t('common.optional')}</label>
              <input
                type="text"
                {...register('location_island')}
                className="field-input"
                placeholder="e.g. Efate"
              />
            </div>
            <div>
              <label className="field-label">Province {t('common.optional')}</label>
              <select {...register('location_province')} className="field-input">
                <option value="">{t('form.selectProvince')}</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="field-label">Notes {t('common.optional')}</label>
            <textarea
              {...register('notes')}
              rows={3}
              className="field-input resize-y"
              placeholder="Any additional context or notes…"
            />
          </div>

          {/* Evidence File */}
          <div>
            <label className="field-label">Evidence File {t('common.optional')}</label>
            <div className="flex items-center gap-2">
              <label className="btn-secondary cursor-pointer">
                <Upload size={14} /> Choose file
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.csv"
                  {...register('evidence_file')}
                  className="sr-only"
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-400">PDF, Word, image, or spreadsheet (max 10 MB)</p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
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
