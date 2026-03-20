import React, { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { X, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import axios from 'axios';

const PROVINCES = ['Malampa', 'Penama', 'Sanma', 'Shefa', 'Tafea', 'Torba'];

const ENGAGEMENT_TYPES = [
  'Community Consultation',
  'Awareness Workshop',
  'Training',
  'Focus Group Discussion',
  'Survey / Data Collection',
  'Steering Committee',
  'Field Visit',
  'Other',
];

// ── Participant counter field ──────────────────────────────────────────────────
function ParticipantField({ label, name, register, errors, colour = 'blue' }) {
  const colourMap = {
    blue:   'focus:border-blue-400',
    pink:   'focus:border-pink-400',
    green:  'focus:border-green-400',
    purple: 'focus:border-purple-400',
    orange: 'focus:border-orange-400',
  };
  return (
    <div>
      <label className="field-label text-xs">{label}</label>
      <input
        type="number"
        min="0"
        {...register(name, {
          min: { value: 0, message: 'Cannot be negative' },
          valueAsNumber: true,
        })}
        className={`field-input text-center text-lg font-bold ${colourMap[colour]}`}
        placeholder="0"
      />
      {errors?.[name] && <p className="field-error">{errors[name].message}</p>}
    </div>
  );
}

export default function EngagementForm({ onSuccess, onClose }) {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      community_name:         '',
      island:                 '',
      province:               '',
      engagement_date:        new Date().toISOString().slice(0, 10),
      engagement_type:        '',
      total_participants:     0,
      male_participants:      0,
      female_participants:    0,
      youth_participants:     0,
      disability_participants:0,
      outcomes:               '',
      follow_up_required:     false,
    },
  });

  // Auto-sum male + female → total
  const male   = useWatch({ control, name: 'male_participants' })   ?? 0;
  const female = useWatch({ control, name: 'female_participants' }) ?? 0;

  useEffect(() => {
    const autoTotal = (Number(male) || 0) + (Number(female) || 0);
    if (autoTotal > 0) {
      setValue('total_participants', autoTotal);
    }
  }, [male, female, setValue]);

  const mutation = useMutation({
    mutationFn: (formData) =>
      axios.post('/api/community/engagements', {
        ...formData,
        total_participants:      Number(formData.total_participants) || 0,
        male_participants:       Number(formData.male_participants) || 0,
        female_participants:     Number(formData.female_participants) || 0,
        youth_participants:      Number(formData.youth_participants) || 0,
        disability_participants: Number(formData.disability_participants) || 0,
      }),
    onSuccess: () => {
      toast.success('Engagement recorded successfully');
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? err.message ?? t('common.error'));
    },
  });

  const onSubmit = (data) => mutation.mutate(data);

  const total = (Number(useWatch({ control, name: 'total_participants' })) || 0);
  const maleN = Number(male) || 0;
  const femaleN = Number(female) || 0;
  const gedsiValid = total === 0 || (maleN + femaleN <= total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">{t('community.title')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
          {/* Community + Island + Province */}
          <div className="space-y-3">
            <div>
              <label className="field-label">
                {t('community.communityName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('community_name', { required: t('common.required') })}
                className="field-input"
                placeholder="e.g. Mele Village"
              />
              {errors.community_name && (
                <p className="field-error">{errors.community_name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">{t('community.island')} {t('common.optional')}</label>
                <input
                  type="text"
                  {...register('island')}
                  className="field-input"
                  placeholder="e.g. Efate"
                />
              </div>
              <div>
                <label className="field-label">
                  {t('community.province')} <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('province', { required: t('common.required') })}
                  className="field-input"
                >
                  <option value="">{t('form.selectProvince')}</option>
                  {PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {errors.province && (
                  <p className="field-error">{errors.province.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Date + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">
                {t('community.engagementDate')} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                {...register('engagement_date', { required: t('common.required') })}
                className="field-input"
              />
              {errors.engagement_date && (
                <p className="field-error">{errors.engagement_date.message}</p>
              )}
            </div>
            <div>
              <label className="field-label">
                {t('community.engagementType')} <span className="text-red-500">*</span>
              </label>
              <select
                {...register('engagement_type', { required: t('common.required') })}
                className="field-input"
              >
                <option value="">{t('form.selectOption')}</option>
                {ENGAGEMENT_TYPES.map((et) => (
                  <option key={et}>{et}</option>
                ))}
              </select>
              {errors.engagement_type && (
                <p className="field-error">{errors.engagement_type.message}</p>
              )}
            </div>
          </div>

          {/* GEDSI Participant Counters */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">{t('community.gedsi')}</h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                gedsiValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {gedsiValid ? 'Valid' : 'Check totals'}
              </span>
            </div>
            <p className="text-xs text-gray-400">{t('community.gedsiNote')}</p>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              <ParticipantField
                label={`${t('community.total')} *`}
                name="total_participants"
                register={register}
                errors={errors}
                colour="blue"
              />
              <ParticipantField
                label={t('community.male')}
                name="male_participants"
                register={register}
                errors={errors}
                colour="blue"
              />
              <ParticipantField
                label={t('community.female')}
                name="female_participants"
                register={register}
                errors={errors}
                colour="pink"
              />
              <ParticipantField
                label={t('community.youth')}
                name="youth_participants"
                register={register}
                errors={errors}
                colour="green"
              />
              <ParticipantField
                label={t('community.disability')}
                name="disability_participants"
                register={register}
                errors={errors}
                colour="purple"
              />
            </div>

            {/* Visual gender breakdown */}
            {total > 0 && (
              <div className="space-y-1 pt-1">
                <div className="h-2 w-full flex rounded-full overflow-hidden bg-gray-200">
                  <div
                    className="bg-blue-400 transition-all"
                    style={{ width: `${Math.min(100, Math.round((maleN / total) * 100))}%` }}
                  />
                  <div
                    className="bg-pink-400 transition-all"
                    style={{ width: `${Math.min(100, Math.round((femaleN / total) * 100))}%` }}
                  />
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />
                    {t('community.male')}: {Math.round((maleN / total) * 100)}%
                  </span>
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-pink-400 mr-1" />
                    {t('community.female')}: {Math.round((femaleN / total) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Outcomes */}
          <div>
            <label className="field-label">
              {t('community.outcomes')} <span className="text-red-500">*</span>
            </label>
            <textarea
              {...register('outcomes', {
                required: t('common.required'),
                minLength: { value: 20, message: 'Please provide at least 20 characters' },
              })}
              rows={4}
              className="field-input resize-y"
              placeholder="Summarise the key outcomes, decisions made, or information shared during the engagement…"
            />
            {errors.outcomes && <p className="field-error">{errors.outcomes.message}</p>}
          </div>

          {/* Follow-up */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register('follow_up_required')}
              className="mt-0.5 rounded border-gray-300 text-blue-600 w-4 h-4"
            />
            <span className="text-sm text-gray-700">
              {t('community.followUpRequired')}
            </span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('form.cancel')}
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !gedsiValid}
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
