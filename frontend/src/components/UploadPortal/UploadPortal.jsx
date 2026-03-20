import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle,
  Clock, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import axios from 'axios';

// ── Target field definitions ──────────────────────────────────────────────────
const TARGET_FIELDS = [
  { key: 'community_name',         label: 'Community Name',          required: true },
  { key: 'island',                 label: 'Island',                  required: false },
  { key: 'province',               label: 'Province',                required: true },
  { key: 'engagement_date',        label: 'Engagement Date',         required: true },
  { key: 'engagement_type',        label: 'Engagement Type',         required: false },
  { key: 'total_participants',     label: 'Total Participants',      required: true },
  { key: 'male_participants',      label: 'Male Participants',       required: false },
  { key: 'female_participants',    label: 'Female Participants',     required: false },
  { key: 'youth_participants',     label: 'Youth Participants',      required: false },
  { key: 'disability_participants',label: 'Disability Participants', required: false },
  { key: 'outcomes',               label: 'Outcomes',                required: false },
  { key: 'follow_up_required',     label: 'Follow-up Required',      required: false },
];

// Auto-guess column mapping from detected header names
function autoMap(headers) {
  const mapping = {};
  const norm = (s) => s?.toLowerCase().replace(/[\s_-]/g, '');
  TARGET_FIELDS.forEach(({ key }) => {
    const match = headers.find((h) => norm(h) === norm(key));
    if (match) mapping[key] = match;
  });
  return mapping;
}

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  success:    { cls: 'badge-green',  icon: CheckCircle2 },
  failed:     { cls: 'badge-red',    icon: AlertCircle },
  partial:    { cls: 'badge-yellow', icon: AlertCircle },
  processing: { cls: 'badge-blue',   icon: Clock },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.processing;
  const Icon = cfg.icon;
  return (
    <span className={`badge ${cfg.cls} capitalize`}>
      <Icon size={11} />
      {status}
    </span>
  );
}

// ── Upload Portal ─────────────────────────────────────────────────────────────
export default function UploadPortal() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [file, setFile]               = useState(null);
  const [preview, setPreview]         = useState([]);   // first 5 rows
  const [headers, setHeaders]         = useState([]);
  const [mapping, setMapping]         = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [expandedLog, setExpandedLog] = useState(null);

  // Upload history
  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ['upload-history'],
    queryFn: () => axios.get('/api/uploads/history?limit=10').then((r) => r.data),
    refetchInterval: 15_000, // poll for processing status
  });

  const history = historyData?.items ?? historyData ?? [];

  // Parse file on drop
  const parseFile = useCallback((acceptedFile) => {
    setFile(acceptedFile);
    setValidationErrors([]);
    setMapping({});
    setPreview([]);
    setHeaders([]);

    const ext = acceptedFile.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      Papa.parse(acceptedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const h = result.meta.fields ?? [];
          setHeaders(h);
          setPreview(result.data.slice(0, 5));
          setMapping(autoMap(h));
        },
        error: (err) => toast.error('Failed to parse CSV: ' + err.message),
      });
    } else if (['xlsx', 'xls'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (json.length === 0) { toast.error('Spreadsheet appears empty'); return; }
          const h = Object.keys(json[0]);
          setHeaders(h);
          setPreview(json.slice(0, 5));
          setMapping(autoMap(h));
        } catch (err) {
          toast.error('Failed to parse Excel file: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(acceptedFile);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => { if (accepted[0]) parseFile(accepted[0]); },
    accept: {
      'text/csv':                                              ['.csv'],
      'application/vnd.ms-excel':                              ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  // Validate mapping
  const validate = useCallback(() => {
    const errs = [];
    TARGET_FIELDS.forEach(({ key, label, required }) => {
      if (required && !mapping[key]) {
        errs.push(`Required field "${label}" is not mapped`);
      }
    });
    setValidationErrors(errs);
    return errs.length === 0;
  }, [mapping]);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!validate()) throw new Error('Validation failed');
      const form = new FormData();
      form.append('file', file);
      form.append('column_mapping', JSON.stringify(mapping));
      return axios.post('/api/uploads/csv', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res) => {
      const count = res.data?.rows_imported ?? res.data?.count ?? '?';
      toast.success(t('upload.uploadSuccess', { count }));
      queryClient.invalidateQueries({ queryKey: ['upload-history'] });
      queryClient.invalidateQueries({ queryKey: ['engagements'] });
      setFile(null);
      setHeaders([]);
      setPreview([]);
      setMapping({});
      setValidationErrors([]);
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail ?? err.message ?? t('upload.uploadError'));
    },
  });

  const handleMappingChange = (targetKey, sourceCol) => {
    setMapping((prev) => ({ ...prev, [targetKey]: sourceCol || undefined }));
    setValidationErrors([]);
  };

  const clearFile = () => {
    setFile(null);
    setHeaders([]);
    setPreview([]);
    setMapping({});
    setValidationErrors([]);
  };

  const mappedCount = useMemo(
    () => Object.values(mapping).filter(Boolean).length,
    [mapping]
  );

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('upload.title')}</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload CSV or Excel files to bulk-import engagement data
        </p>
      </div>

      {/* ── Dropzone ── */}
      {!file ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet
            size={40}
            className={`mx-auto mb-3 ${isDragActive ? 'text-blue-500' : 'text-gray-300'}`}
          />
          <p className="text-gray-600 font-medium">
            {isDragActive ? 'Drop the file here…' : t('upload.dropzone')}
          </p>
          <p className="text-xs text-gray-400 mt-1">CSV, XLS, XLSX · max 20 MB</p>
        </div>
      ) : (
        <div className="card space-y-5">
          {/* File info bar */}
          <div className="flex items-center justify-between gap-3 bg-blue-50 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-blue-600" />
              <div>
                <p className="font-medium text-blue-900 text-sm">{file.name}</p>
                <p className="text-xs text-blue-600">
                  {(file.size / 1024).toFixed(0)} KB · {headers.length} columns · {preview.length}+ rows detected
                </p>
              </div>
            </div>
            <button onClick={clearFile} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>

          {/* ── Column Mapping ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">{t('upload.columnMapping')}</h3>
              <span className="text-xs text-gray-400">{mappedCount} / {TARGET_FIELDS.length} mapped</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">
                      {t('upload.targetField')}
                    </th>
                    <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs w-8" />
                    <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">
                      {t('upload.detectedColumn')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {TARGET_FIELDS.map(({ key, label, required }) => (
                    <tr key={key} className={mapping[key] ? 'bg-white' : required ? 'bg-red-50/30' : 'bg-white'}>
                      <td className="px-4 py-2 font-medium text-gray-700">
                        {label}
                        {required && <span className="ml-1 text-red-500 text-xs">*</span>}
                      </td>
                      <td className="px-2 py-2 text-gray-300">→</td>
                      <td className="px-4 py-2">
                        <select
                          value={mapping[key] ?? ''}
                          onChange={(e) => handleMappingChange(key, e.target.value)}
                          className="field-input py-1 text-xs"
                        >
                          <option value="">— {required ? 'Required' : 'Skip'} —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 space-y-1">
              {validationErrors.map((e, i) => (
                <p key={i} className="text-xs text-red-700 flex items-center gap-1.5">
                  <AlertCircle size={12} /> {e}
                </p>
              ))}
            </div>
          )}

          {/* ── Preview ── */}
          {preview.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm">{t('upload.preview')}</h3>
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {headers.slice(0, 8).map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                      {headers.length > 8 && (
                        <th className="px-3 py-2 text-gray-400">+{headers.length - 8} more</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {headers.slice(0, 8).map((h) => (
                          <td key={h} className="px-3 py-1.5 text-gray-600 whitespace-nowrap max-w-[120px] truncate">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                        {headers.length > 8 && <td />}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={clearFile} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || headers.length === 0}
              className="btn-primary"
            >
              {uploadMutation.isPending ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  {t('upload.uploading')}
                </>
              ) : (
                <>
                  <Upload size={15} />
                  {t('upload.uploadNow')}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Upload History ── */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{t('upload.uploadHistory')}</h3>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['upload-history'] })}
            className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">File</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">Uploaded</th>
                <th className="text-left px-4 py-2 font-semibold text-gray-600 text-xs">Status</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs">Rows</th>
                <th className="text-right px-4 py-2 font-semibold text-gray-600 text-xs">Errors</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loadingHistory
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : history.length === 0
                ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                        No uploads yet
                      </td>
                    </tr>
                  )
                : history.map((item) => (
                    <React.Fragment key={item.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-800 font-medium">
                          <div className="flex items-center gap-1.5">
                            <FileSpreadsheet size={13} className="text-gray-400 flex-shrink-0" />
                            <span className="truncate max-w-[160px]">{item.filename}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {item.created_at ? format(parseISO(item.created_at), 'd MMM yyyy HH:mm') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {item.rows_imported ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.error_count > 0 ? (
                            <span className="text-red-600 font-medium">{item.error_count}</span>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.errors?.length > 0 && (
                            <button
                              onClick={() => setExpandedLog(expandedLog === item.id ? null : item.id)}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                            >
                              {t('upload.errorLog')}
                              {expandedLog === item.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* Error log expansion */}
                      {expandedLog === item.id && item.errors?.length > 0 && (
                        <tr>
                          <td colSpan={6} className="bg-red-50 px-6 py-3">
                            <p className="text-xs font-semibold text-red-700 mb-1">
                              {t('upload.errorLog')}
                            </p>
                            <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                              {item.errors.map((e, i) => (
                                <li key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                                  <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
                                  <span>
                                    {e.row ? `Row ${e.row}: ` : ''}{e.message ?? String(e)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
