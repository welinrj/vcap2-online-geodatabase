import React, { useState, useEffect, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { openDB } from 'idb';
import { useTranslation } from 'react-i18next';
import {
  Wifi, WifiOff, RefreshCw, CheckCircle2, CloudOff,
  Upload as CloudUpload, Users, Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
const DB_NAME    = 'merl-offline';
const STORE_NAME = 'pending-engagements';
const DB_VERSION = 1;

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

async function savePending(record) {
  const db = await getDb();
  return db.add(STORE_NAME, { ...record, savedAt: new Date().toISOString() });
}

async function getPending() {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

async function deletePending(id) {
  const db = await getDb();
  return db.delete(STORE_NAME, id);
}

async function clearAllPending() {
  const db = await getDb();
  return db.clear(STORE_NAME);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PROVINCES = ['Malampa', 'Penama', 'Sanma', 'Shefa', 'Tafea', 'Torba'];

// ── Sub-component: online/offline badge ──────────────────────────────────────
function ConnBadge({ online }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${
      online ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800 animate-pulse'
    }`}>
      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
      {online ? t('common.online') : t('common.offline')}
    </span>
  );
}

// ── Sync status bar ───────────────────────────────────────────────────────────
function SyncBar({ pendingCount, onSync, syncing, online }) {
  const { t } = useTranslation();

  if (pendingCount === 0) return null;

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${
      online
        ? 'bg-yellow-50 border-yellow-200'
        : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center gap-2">
        {online ? (
          <CloudUpload size={18} className="text-yellow-600" />
        ) : (
          <CloudOff size={18} className="text-red-500" />
        )}
        <div>
          <p className="text-sm font-medium text-gray-800">
            {t('common.syncPending', { count: pendingCount })}
          </p>
          {!online && (
            <p className="text-xs text-gray-500">{t('common.savedOffline')}</p>
          )}
        </div>
      </div>
      {online && (
        <button
          onClick={onSync}
          disabled={syncing}
          className="btn-primary py-1.5"
        >
          {syncing ? (
            <><RefreshCw size={14} className="animate-spin" /> {t('common.syncing')}</>
          ) : (
            <><RefreshCw size={14} /> {t('common.syncNow')}</>
          )}
        </button>
      )}
    </div>
  );
}

// ── Number input with +/- buttons ─────────────────────────────────────────────
function CounterField({ label, name, register, setValue, watch: watchField, colour = 'blue', errors }) {
  const value = Number(watchField(name)) || 0;
  const colourMap = {
    blue:   { bg: 'bg-blue-600',   btn: 'hover:bg-blue-50 text-blue-700' },
    pink:   { bg: 'bg-pink-500',   btn: 'hover:bg-pink-50 text-pink-700' },
    green:  { bg: 'bg-green-500',  btn: 'hover:bg-green-50 text-green-700' },
    purple: { bg: 'bg-purple-500', btn: 'hover:bg-purple-50 text-purple-700' },
  };
  const cfg = colourMap[colour] ?? colourMap.blue;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-medium text-gray-600 text-center leading-tight">{label}</span>
      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setValue(name, Math.max(0, value - 1))}
          className={`px-3 py-2 text-lg font-bold transition-colors ${cfg.btn}`}
        >
          −
        </button>
        <input
          type="number"
          min="0"
          {...register(name, { min: 0, valueAsNumber: true })}
          className="w-14 text-center text-xl font-bold border-none outline-none py-2 text-gray-900"
        />
        <button
          type="button"
          onClick={() => setValue(name, value + 1)}
          className={`px-3 py-2 text-lg font-bold transition-colors ${cfg.btn}`}
        >
          +
        </button>
      </div>
      {errors?.[name] && (
        <p className="text-xs text-red-500">{errors[name].message}</p>
      )}
    </div>
  );
}

// ── CommunityReporter ─────────────────────────────────────────────────────────
export default function CommunityReporter() {
  const { t, i18n } = useTranslation();

  const [online, setOnline]           = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing]         = useState(false);
  const [submitted, setSubmitted]     = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      community_name:          '',
      island:                  '',
      province:                '',
      engagement_date:         new Date().toISOString().slice(0, 10),
      total_participants:      0,
      male_participants:       0,
      female_participants:     0,
      youth_participants:      0,
      disability_participants: 0,
      outcomes:                '',
    },
  });

  const male   = watch('male_participants');
  const female = watch('female_participants');

  // Auto-total male + female
  useEffect(() => {
    const auto = (Number(male) || 0) + (Number(female) || 0);
    if (auto > 0) setValue('total_participants', auto);
  }, [male, female, setValue]);

  // Network status listeners
  useEffect(() => {
    const goOnline  = () => { setOnline(true);  autoSync(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Refresh pending count on mount and periodically
  const refreshPending = useCallback(async () => {
    const pending = await getPending();
    setPendingCount(pending.length);
  }, []);

  useEffect(() => {
    refreshPending();
    const interval = setInterval(refreshPending, 10_000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  // Auto-sync when coming back online
  const autoSync = useCallback(async () => {
    const pending = await getPending();
    if (pending.length === 0) return;
    setSyncing(true);
    let synced = 0;
    for (const record of pending) {
      try {
        const { id, savedAt, ...payload } = record;
        await axios.post('/api/uploads/field-data', payload);
        await deletePending(id);
        synced++;
      } catch {
        // leave failed records for manual retry
      }
    }
    setSyncing(false);
    if (synced > 0) {
      toast.success(t('common.syncSuccess'));
      refreshPending();
    }
  }, [t, refreshPending]);

  // Manual sync button
  const handleSync = async () => {
    setSyncing(true);
    try {
      await autoSync();
    } finally {
      setSyncing(false);
    }
  };

  // Form submit
  const onSubmit = async (data) => {
    const payload = {
      ...data,
      total_participants:      Number(data.total_participants) || 0,
      male_participants:       Number(data.male_participants) || 0,
      female_participants:     Number(data.female_participants) || 0,
      youth_participants:      Number(data.youth_participants) || 0,
      disability_participants: Number(data.disability_participants) || 0,
    };

    if (online) {
      try {
        await axios.post('/api/uploads/field-data', payload);
        toast.success(t('common.success'));
        reset();
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3000);
      } catch (err) {
        // If submit fails even though online, fall back to offline save
        await savePending(payload);
        toast(t('common.savedOffline'), { icon: '📶' });
        refreshPending();
        reset();
      }
    } else {
      await savePending(payload);
      toast(t('common.savedOffline'), { icon: '📴' });
      refreshPending();
      reset();
    }
  };

  const total = Number(watch('total_participants')) || 0;
  const maleN = Number(male) || 0;
  const femaleN = Number(female) || 0;
  const pctMale  = total > 0 ? Math.round((maleN  / total) * 100) : 0;
  const pctFemale= total > 0 ? Math.round((femaleN/ total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Top bar */}
      <div className="bg-blue-900 text-white px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="font-bold text-lg leading-tight">{t('nav.communityReport')}</h1>
            <p className="text-xs text-blue-300">Vanuatu L&amp;D Fund — MERL</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <button
              onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'bi' : 'en')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-800 hover:bg-blue-700 text-xs font-medium transition-colors"
              title="Switch language"
            >
              <Globe size={13} />
              {i18n.language === 'en' ? 'Bislama' : 'English'}
            </button>
            <ConnBadge online={online} />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Sync bar */}
        <SyncBar
          pendingCount={pendingCount}
          onSync={handleSync}
          syncing={syncing}
          online={online}
        />

        {/* Success message */}
        {submitted && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2 animate-fade-in">
            <CheckCircle2 size={18} className="text-green-600" />
            <p className="text-sm font-medium text-green-800">{t('common.success')} — record submitted</p>
          </div>
        )}

        {/* Form card */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
        >
          {/* Section: Location */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-50 space-y-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-700 text-white text-xs flex items-center justify-center font-bold">1</span>
              Location
            </h2>

            <div>
              <label className="field-label">
                {t('community.communityName')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                {...register('community_name', { required: t('common.required') })}
                className="field-input"
                placeholder="e.g. Mele Village"
                autoComplete="off"
              />
              {errors.community_name && (
                <p className="field-error">{errors.community_name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">{t('community.island')}</label>
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
          </div>

          {/* Section: Participants */}
          <div className="px-5 py-4 border-b border-gray-50 space-y-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-700 text-white text-xs flex items-center justify-center font-bold">2</span>
              {t('community.participants')}
            </h2>

            <p className="text-xs text-gray-400">{t('community.gedsiNote')}</p>

            {/* Counter grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              <CounterField
                label={`${t('community.total')} *`}
                name="total_participants"
                register={register}
                setValue={setValue}
                watch={watch}
                colour="blue"
                errors={errors}
              />
              <CounterField
                label={t('community.male')}
                name="male_participants"
                register={register}
                setValue={setValue}
                watch={watch}
                colour="blue"
                errors={errors}
              />
              <CounterField
                label={t('community.female')}
                name="female_participants"
                register={register}
                setValue={setValue}
                watch={watch}
                colour="pink"
                errors={errors}
              />
              <CounterField
                label={t('community.youth')}
                name="youth_participants"
                register={register}
                setValue={setValue}
                watch={watch}
                colour="green"
                errors={errors}
              />
              <CounterField
                label={t('community.disability')}
                name="disability_participants"
                register={register}
                setValue={setValue}
                watch={watch}
                colour="purple"
                errors={errors}
              />
            </div>

            {/* GEDSI visual */}
            {total > 0 && (
              <div className="space-y-1">
                <div className="h-3 w-full flex rounded-full overflow-hidden bg-gray-100">
                  <div className="bg-blue-400 transition-all" style={{ width: `${pctMale}%` }} />
                  <div className="bg-pink-400 transition-all" style={{ width: `${pctFemale}%` }} />
                </div>
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />
                    {t('community.male')} {pctMale}%
                  </span>
                  <span>
                    <span className="inline-block w-2 h-2 rounded-full bg-pink-400 mr-1" />
                    {t('community.female')} {pctFemale}%
                  </span>
                  <span className="ml-auto font-semibold text-gray-700">
                    {t('community.total')}: {total}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section: Outcomes */}
          <div className="px-5 py-4 space-y-4">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-700 text-white text-xs flex items-center justify-center font-bold">3</span>
              {t('community.outcomes')}
            </h2>

            <div>
              <label className="field-label">
                {t('community.outcomes')} <span className="text-red-500">*</span>
              </label>
              <textarea
                {...register('outcomes', {
                  required: t('common.required'),
                  minLength: { value: 15, message: 'Please write at least 15 characters' },
                })}
                rows={5}
                className="field-input resize-y"
                placeholder={
                  i18n.language === 'bi'
                    ? 'Raetem ol impoten poen we i kamap long meeting ia…'
                    : 'Summarise the key outcomes and discussions from this engagement…'
                }
              />
              {errors.outcomes && <p className="field-error">{errors.outcomes.message}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-primary justify-center py-3 text-base"
            >
              {isSubmitting ? (
                <><RefreshCw size={16} className="animate-spin" /> {t('form.submitting')}</>
              ) : online ? (
                <><Users size={16} /> {t('form.submit')}</>
              ) : (
                <><CloudOff size={16} /> {t('form.submit')} (offline — will sync later)</>
              )}
            </button>

            {!online && (
              <p className="text-center text-xs text-gray-400">
                {t('common.savedOffline')}
              </p>
            )}
          </div>
        </form>

        {/* Pending records panel */}
        {pendingCount > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <CloudOff size={15} className="text-orange-500" />
                Pending Records ({pendingCount})
              </h3>
              {online && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="text-xs text-blue-700 hover:underline flex items-center gap-1"
                >
                  <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing…' : 'Sync all'}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">
              These records are stored on this device and will be uploaded automatically when connected.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
