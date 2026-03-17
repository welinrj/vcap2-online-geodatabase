import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { X, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import axios from 'axios';

// Leaflet is large — lazy-load the map picker
const MapPicker = lazy(() => import('./MapPicker'));

const PROVINCES = ['Malampa', 'Penama', 'Sanma', 'Shefa', 'Tafea', 'Torba'];

const ISLANDS = [
  'Efate', 'Santo', 'Malekula', 'Tanna', 'Pentecost', 'Ambrym',
  'Ambae', 'Epi', 'Gaua', 'Maewo', 'Erromango', 'Aneityum',
  'Futuna', 'Vanua Lava', 'Mota Lava', 'Torres Islands', 'Banks Islands',
];

const EVENT_TYPES = [
  { value: 'cyclone',    label: 'Cyclone / Tropical Storm' },
  { value: 'flood',      label: 'Flood' },
  { value: 'drought',    label: 'Drought' },
  { value: 'sea_level',  label: 'Sea Level Rise' },
  { value: 'earthquake', label: 'Earthquake' },
  { value: 'landslide',  label: 'Landslide' },
  { value: 'other',      label: 'Other' },
];

// ── Multi-select checkbox group ───────────────────────────────────────────────
function MultiSelect({ label, options, selected, onChange }) {
  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer hover:text-blue-700">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="rounded border-gray-300 text-blue-600"
            />
            {opt}
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <p className="mt-1 text-xs text-blue-600">{selected.length} selected</p>
      )}
    </div>
  );
}

// ── EventForm ─────────────────────────────────────────────────────────────────
export default function EventForm({ onSuccess, onClose }) {
  const { t } = useTranslation();
  const [islandsSelected, setIslandsSelected]     = useState([]);
  const [provincesSelected, setProvincesSelected] = useState([]);
  const [showMap, setShowMap]                     = useState(false);
  const [pinLatLng, setPinLatLng]                 = useState(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      event_type: '',
      onset_type: 'rapid',
      start_date: '',
      end_date: '',
      economic_loss_vuv: '',
      description: '',
      response_actions: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (formData) =>
      axios.post('/api/events', {
        ...formData,
        islands_affected:   islandsSelected,
        provinces_affected: provincesSelected,
        economic_loss_vuv:  formData.economic_loss_vuv
          ? Number(formData.economic_loss_vuv)
          : null,
        latitude:  pinLatLng?.lat ?? null,
        longitude: pinLatLng?.lng ?? null,
      }),
    onSuccess: () => {
      toast.success('Event reported successfully');
      onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? err.message ?? t('common.error'));
    },
  });

  const onSubmit = (data) => mutation.mutate(data);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{t('events.reportEvent')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          {/* Event Name */}
          <div>
            <label className="field-label">
              {t('events.eventName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('name', { required: t('common.required') })}
              className="field-input"
              placeholder="e.g. Cyclone Harold 2024"
            />
            {errors.name && <p className="field-error">{errors.name.message}</p>}
          </div>

          {/* Type + Onset row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">
                {t('events.eventType')} <span className="text-red-500">*</span>
              </label>
              <select
                {...register('event_type', { required: t('common.required') })}
                className="field-input"
              >
                <option value="">{t('form.selectOption')}</option>
                {EVENT_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
              {errors.event_type && (
                <p className="field-error">{errors.event_type.message}</p>
              )}
            </div>

            <div>
              <label className="field-label">
                {t('events.onsetType')} <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4 mt-2">
                {['rapid', 'slow'].map((val) => (
                  <label key={val} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      value={val}
                      {...register('onset_type', { required: true })}
                      className="text-blue-600"
                    />
                    <span className="capitalize">{val} Onset</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">
                {t('events.startDate')} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                {...register('start_date', { required: t('common.required') })}
                className="field-input"
              />
              {errors.start_date && (
                <p className="field-error">{errors.start_date.message}</p>
              )}
            </div>
            <div>
              <label className="field-label">{t('events.endDate')} {t('common.optional')}</label>
              <input type="date" {...register('end_date')} className="field-input" />
            </div>
          </div>

          {/* Islands affected */}
          <MultiSelect
            label={`${t('events.islandsAffected')} ${t('common.optional')}`}
            options={ISLANDS}
            selected={islandsSelected}
            onChange={setIslandsSelected}
          />

          {/* Provinces affected */}
          <MultiSelect
            label={`${t('events.provincesAffected')} ${t('common.optional')}`}
            options={PROVINCES}
            selected={provincesSelected}
            onChange={setProvincesSelected}
          />

          {/* Economic loss */}
          <div>
            <label className="field-label">{t('events.economicLoss')} {t('common.optional')}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-semibold">
                VUV
              </span>
              <input
                type="number"
                step="1"
                min="0"
                {...register('economic_loss_vuv')}
                className="field-input pl-10"
                placeholder="0"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="field-label">{t('events.description')} {t('common.optional')}</label>
            <textarea
              {...register('description')}
              rows={3}
              className="field-input resize-y"
              placeholder="Describe the event, impacts, and affected populations…"
            />
          </div>

          {/* Response Actions */}
          <div>
            <label className="field-label">{t('events.responseActions')} {t('common.optional')}</label>
            <textarea
              {...register('response_actions')}
              rows={3}
              className="field-input resize-y"
              placeholder="List response actions taken or planned…"
            />
          </div>

          {/* Map pin */}
          <div>
            <label className="field-label">{t('events.pinOnMap')} {t('common.optional')}</label>
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="btn-secondary"
            >
              <MapPin size={15} />
              {pinLatLng
                ? `Pin set: ${pinLatLng.lat.toFixed(4)}, ${pinLatLng.lng.toFixed(4)}`
                : 'Set location on map'}
            </button>
            {pinLatLng && (
              <button
                type="button"
                onClick={() => setPinLatLng(null)}
                className="ml-2 text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            )}
          </div>

          {/* Map Picker Modal */}
          {showMap && (
            <Suspense fallback={<div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}>
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Click to set location</h3>
                    <button onClick={() => setShowMap(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                      <X size={18} />
                    </button>
                  </div>
                  <MapPicker
                    initialLatLng={pinLatLng}
                    onSelect={(latlng) => { setPinLatLng(latlng); setShowMap(false); }}
                  />
                </div>
              </div>
            </Suspense>
          )}

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
              {mutation.isPending ? t('form.submitting') : t('events.reportEvent')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
