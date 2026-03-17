import React from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import axios from 'axios';

const STATUSES = [
  { value: 'not_started',  label: 'Not Started' },
  { value: 'in_progress',  label: 'In Progress' },
  { value: 'completed',    label: 'Completed' },
  { value: 'delayed',      label: 'Delayed' },
  { value: 'cancelled',    label: 'Cancelled' },
];

const STATUS_COLOURS = {
  completed:   'text-green-700 bg-green-50',
  in_progress: 'text-blue-700 bg-blue-50',
  delayed:     'text-yellow-700 bg-yellow-50',
  not_started: 'text-gray-600 bg-gray-50',
  cancelled:   'text-red-700 bg-red-50',
};

export default function ActivityForm({ activity = null, onSuccess, onClose }) {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      activity_id: activity?.id ?? '',
      status:      activity?.status ?? '',
      notes:       '',
      updated_date: new Date().toISOString().slice(0, 10),
    },
  });

  // Load activities list (only if no activity pre-provided)
  const { data: activitiesData, isLoading: loadingActivities } = useQuery({
    queryKey: ['activities'],
    queryFn: () => axios.get('/api/activities').then((r) => r.data),
    enabled: !activity,
  });

  const activities = activitiesData?.items ?? activitiesData ?? [];

  const mutation = useMutation({
    mutationFn: (formData) => {
      const id = activity?.id ?? formData.activity_id;
      return axios.put(`/api/activities/${id}/status`, {
        status:       formData.status,
        notes:        formData.notes,
        updated_date: formData.updated_date,
      });
    },
    onSuccess: () => {
      toast.success('Activity status updated');
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? err.message ?? t('common.error'));
    },
  });

  const onSubmit = (data) => mutation.mutate(data);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t('activities.updateStatus')}</h2>
            {activity && (
              <p className="text-xs text-gray-400 mt-0.5">
                [{activity.activity_code}] {activity.activity_name}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Activity Select (shown when no activity pre-selected) */}
          {!activity && (
            <div>
              <label className="field-label">
                Activity <span className="text-red-500">*</span>
              </label>
              {loadingActivities ? (
                <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ) : (
                <select
                  {...register('activity_id', { required: t('common.required') })}
                  className="field-input"
                >
                  <option value="">{t('form.selectOption')}</option>
                  {activities.map((act) => (
                    <option key={act.id} value={act.id}>
                      [{act.activity_code}] {act.activity_name}
                    </option>
                  ))}
                </select>
              )}
              {errors.activity_id && (
                <p className="field-error">{errors.activity_id.message}</p>
              )}
            </div>
          )}

          {/* Current status display */}
          {activity?.status && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-500">Current status: </span>
              <span className={`font-semibold px-2 py-0.5 rounded ${STATUS_COLOURS[activity.status] ?? ''}`}>
                {activity.status.replace('_', ' ')}
              </span>
            </div>
          )}

          {/* New Status */}
          <div>
            <label className="field-label">
              New Status <span className="text-red-500">*</span>
            </label>
            <select
              {...register('status', { required: t('common.required') })}
              className="field-input"
            >
              <option value="">{t('form.selectOption')}</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {errors.status && <p className="field-error">{errors.status.message}</p>}
          </div>

          {/* Date of update */}
          <div>
            <label className="field-label">Update Date</label>
            <input
              type="date"
              {...register('updated_date')}
              className="field-input"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="field-label">
              Notes / Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('notes', {
                required: 'Please provide a reason or description for this status change',
                minLength: { value: 10, message: 'Notes must be at least 10 characters' },
              })}
              rows={4}
              className="field-input resize-y"
              placeholder="Describe the current progress, any blockers, or reason for status change…"
            />
            {errors.notes && <p className="field-error">{errors.notes.message}</p>}
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
              {mutation.isPending ? t('form.updating') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
