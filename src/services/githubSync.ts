import type { GeoDataset } from '../types/geospatial'
import type { ProtectedArea } from '../types/protectedArea'
import {
  listDatasets,
  exportAllDatasets,
  importDatasets,
  updateGitHubSha,
} from './datasetStore'
import {
  listProtectedAreas,
  exportAllAreas,
  importAreas,
  updateAreaGitHubSha,
} from './protectedAreaStore'

// ── Configuration ──

const SETTINGS_KEY = 'vcap2_github_settings'
const SYNC_STATE_KEY = 'vcap2_github_sync'
const PA_SYNC_STATE_KEY = 'vcap2_github_pa_sync'
const DATASETS_DIR = 'gis-datasets'
const PA_DIR = 'protected-areas'
const API_BASE = 'https://api.github.com'

export interface GitHubSyncConfig {
  owner: string
  repo: string
  token: string
  branch?: string
}

export interface SyncResult {
  pushed: number
  pulled: number
  errors: string[]
}

export interface SyncState {
  lastSync: string | null
  syncing: boolean
}

// ── Settings helpers ──

/** Read GitHub sync settings (pre-configured, token from env) */
export function getSyncSettings(): GitHubSyncConfig {
  return {
    owner: 'welinrj',
    repo: 'merremia-vanuatu-dashboard',
    token: import.meta.env.VITE_GITHUB_TOKEN || '',
    branch: 'main',
  }
}

/** Save sync settings (merges with existing Field Collector settings) */
export function saveSyncSettings(config: Partial<GitHubSyncConfig>): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const existing = raw ? JSON.parse(raw) : {}
    const merged = { ...existing, ...config }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged))
  } catch {
    // Silently fail — localStorage not available
  }
}

export function getSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_STATE_KEY)
    return raw ? JSON.parse(raw) : { lastSync: null, syncing: false }
  } catch {
    return { lastSync: null, syncing: false }
  }
}

function saveSyncState(state: SyncState): void {
  try {
    localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

// ── GitHub API helpers ──

async function ghFetch(
  path: string,
  config: GitHubSyncConfig,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${API_BASE}/repos/${config.owner}/${config.repo}/contents/${path}${config.branch ? `?ref=${config.branch}` : ''}`
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`
  }
  return fetch(url, {
    ...options,
    headers,
  })
}

/** List all dataset files in the gis-datasets/ directory */
async function listRemoteDatasets(
  config: GitHubSyncConfig,
): Promise<Array<{ name: string; sha: string; download_url: string }>> {
  const resp = await ghFetch(DATASETS_DIR, config)
  if (resp.status === 404) return [] // Directory doesn't exist yet
  if (!resp.ok) {
    throw new Error(`GitHub API error ${resp.status}: ${await resp.text()}`)
  }
  const files = await resp.json()
  if (!Array.isArray(files)) return []
  return files
    .filter((f: { name: string }) => f.name.endsWith('.json'))
    .map((f: { name: string; sha: string; download_url: string }) => ({
      name: f.name,
      sha: f.sha,
      download_url: f.download_url,
    }))
}

/** Download a single dataset JSON from GitHub */
async function downloadDataset(
  url: string,
): Promise<GeoDataset> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to download dataset: ${resp.status}`)
  return resp.json()
}

/** Push a dataset to GitHub (create or update) */
async function pushDataset(
  dataset: GeoDataset,
  config: GitHubSyncConfig,
  existingSha?: string,
): Promise<string> {
  const path = `${DATASETS_DIR}/${dataset.id}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(dataset, null, 2))))

  const body: Record<string, string> = {
    message: `Sync dataset: ${dataset.metadata.name}`,
    content,
    branch: config.branch || 'main',
  }
  if (existingSha) {
    body.sha = existingSha
  }

  const resp = await ghFetch(path, config, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Failed to push dataset "${dataset.metadata.name}": ${resp.status} ${err}`)
  }

  const result = await resp.json()
  return result.content.sha
}

// ── Main sync function ──

/**
 * Two-way sync: push local-only datasets to GitHub, pull remote-only datasets to local.
 * Returns a summary of what was synced.
 */
export async function syncDatasets(
  config: GitHubSyncConfig,
): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [] }

  saveSyncState({ lastSync: getSyncState().lastSync, syncing: true })

  try {
    // 1. Get local and remote dataset lists
    const localSummaries = await listDatasets()
    const localIds = new Set(localSummaries.map((d) => d.id))

    const remoteFiles = await listRemoteDatasets(config)
    const remoteById = new Map(
      remoteFiles.map((f) => [f.name.replace('.json', ''), f]),
    )

    // 2. Push local datasets not on GitHub or updated since last push (requires token)
    const allLocal = await exportAllDatasets()
    for (const dataset of allLocal) {
      const remoteFile = remoteById.get(dataset.id)
      if (!remoteFile) {
        if (!config.token) continue // Skip push when unauthenticated
        // New dataset — push to GitHub
        try {
          const sha = await pushDataset(dataset, config)
          await updateGitHubSha(dataset.id, sha)
          result.pushed++
        } catch (err) {
          result.errors.push(
            err instanceof Error ? err.message : `Push failed for ${dataset.id}`,
          )
        }
      } else if (!dataset.githubSha || dataset.githubSha !== remoteFile.sha) {
        if (config.token && dataset.githubSha && dataset.githubSha !== remoteFile.sha) {
          // SHA mismatch but we have a tracked sha — could be remote update, skip push
          await updateGitHubSha(dataset.id, remoteFile.sha)
        } else if (config.token && !dataset.githubSha) {
          // Exists on GitHub but we never tracked its SHA — re-push local version
          try {
            const sha = await pushDataset(dataset, config, remoteFile.sha)
            await updateGitHubSha(dataset.id, sha)
            result.pushed++
          } catch (err) {
            result.errors.push(
              err instanceof Error ? err.message : `Push failed for ${dataset.id}`,
            )
          }
        } else {
          await updateGitHubSha(dataset.id, remoteFile.sha)
        }
      }
    }

    // 3. Pull remote datasets that are NOT in local IndexedDB
    for (const [remoteId, remoteFile] of remoteById) {
      if (!localIds.has(remoteId)) {
        try {
          const dataset = await downloadDataset(remoteFile.download_url)
          dataset.githubSha = remoteFile.sha
          const { imported } = await importDatasets([dataset])
          if (imported > 0) result.pulled++
        } catch (err) {
          result.errors.push(
            err instanceof Error ? err.message : `Pull failed for ${remoteId}`,
          )
        }
      }
    }

    saveSyncState({ lastSync: new Date().toISOString(), syncing: false })
  } catch (err) {
    saveSyncState({ lastSync: getSyncState().lastSync, syncing: false })
    result.errors.push(
      err instanceof Error ? err.message : 'Sync failed',
    )
  }

  return result
}

// ── Protected Areas sync ──

export function getPaSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(PA_SYNC_STATE_KEY)
    return raw ? JSON.parse(raw) : { lastSync: null, syncing: false }
  } catch {
    return { lastSync: null, syncing: false }
  }
}

function savePaSyncState(state: SyncState): void {
  try {
    localStorage.setItem(PA_SYNC_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

/** List all protected area files in the protected-areas/ directory */
async function listRemoteAreas(
  config: GitHubSyncConfig,
): Promise<Array<{ name: string; sha: string; download_url: string }>> {
  const resp = await ghFetch(PA_DIR, config)
  if (resp.status === 404) return []
  if (!resp.ok) {
    throw new Error(`GitHub API error ${resp.status}: ${await resp.text()}`)
  }
  const files = await resp.json()
  if (!Array.isArray(files)) return []
  return files
    .filter((f: { name: string }) => f.name.endsWith('.json'))
    .map((f: { name: string; sha: string; download_url: string }) => ({
      name: f.name,
      sha: f.sha,
      download_url: f.download_url,
    }))
}

/** Push a protected area to GitHub */
async function pushArea(
  area: ProtectedArea,
  config: GitHubSyncConfig,
  existingSha?: string,
): Promise<string> {
  const path = `${PA_DIR}/${area.id}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(area, null, 2))))

  const body: Record<string, string> = {
    message: `Sync protected area: ${area.name}`,
    content,
    branch: config.branch || 'main',
  }
  if (existingSha) {
    body.sha = existingSha
  }

  const resp = await ghFetch(path, config, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Failed to push area "${area.name}": ${resp.status} ${err}`)
  }

  const result = await resp.json()
  return result.content.sha
}

/**
 * Two-way sync for protected areas: push local-only to GitHub, pull remote-only to local.
 */
export async function syncProtectedAreas(
  config: GitHubSyncConfig,
): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, errors: [] }

  savePaSyncState({ lastSync: getPaSyncState().lastSync, syncing: true })

  try {
    const localSummaries = await listProtectedAreas()
    const localIds = new Set(localSummaries.map((a) => a.id))

    const remoteFiles = await listRemoteAreas(config)
    const remoteById = new Map(
      remoteFiles.map((f) => [f.name.replace('.json', ''), f]),
    )

    // Push local areas not on GitHub or updated since last push (requires token)
    const allLocal = await exportAllAreas()
    for (const area of allLocal) {
      const remoteFile = remoteById.get(area.id)
      if (!remoteFile) {
        if (!config.token) continue // Skip push when unauthenticated
        try {
          const sha = await pushArea(area, config)
          await updateAreaGitHubSha(area.id, sha)
          result.pushed++
        } catch (err) {
          result.errors.push(
            err instanceof Error ? err.message : `Push failed for ${area.id}`,
          )
        }
      } else if (!area.githubSha || area.githubSha !== remoteFile.sha) {
        // Area exists on both — re-push if locally modified (local SHA stale)
        if (config.token && area.githubSha && area.githubSha !== remoteFile.sha) {
          // SHA mismatch but we have a tracked sha — could be remote update, skip push
          await updateAreaGitHubSha(area.id, remoteFile.sha)
        } else if (config.token && !area.githubSha) {
          // Area exists on GitHub but we never tracked its SHA — re-push local version
          try {
            const sha = await pushArea(area, config, remoteFile.sha)
            await updateAreaGitHubSha(area.id, sha)
            result.pushed++
          } catch (err) {
            result.errors.push(
              err instanceof Error ? err.message : `Push failed for ${area.id}`,
            )
          }
        } else {
          await updateAreaGitHubSha(area.id, remoteFile.sha)
        }
      }
    }

    // Pull remote areas not in local IndexedDB
    for (const [remoteId, remoteFile] of remoteById) {
      if (!localIds.has(remoteId)) {
        try {
          const resp = await fetch(remoteFile.download_url)
          if (!resp.ok) throw new Error(`Failed to download area: ${resp.status}`)
          const area: ProtectedArea = await resp.json()
          area.githubSha = remoteFile.sha
          const { imported } = await importAreas([area])
          if (imported > 0) result.pulled++
        } catch (err) {
          result.errors.push(
            err instanceof Error ? err.message : `Pull failed for ${remoteId}`,
          )
        }
      }
    }

    savePaSyncState({ lastSync: new Date().toISOString(), syncing: false })
  } catch (err) {
    savePaSyncState({ lastSync: getPaSyncState().lastSync, syncing: false })
    result.errors.push(
      err instanceof Error ? err.message : 'Sync failed',
    )
  }

  return result
}

/** Delete a protected area from GitHub */
export async function deleteRemoteArea(
  areaId: string,
  config: GitHubSyncConfig,
): Promise<void> {
  const path = `${PA_DIR}/${areaId}.json`

  const resp = await ghFetch(path, config)
  if (resp.status === 404) return
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)

  const file = await resp.json()

  const deleteResp = await ghFetch(path, config, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `Delete protected area: ${areaId}`,
      sha: file.sha,
      branch: config.branch || 'main',
    }),
  })

  if (!deleteResp.ok && deleteResp.status !== 404) {
    throw new Error(`Failed to delete remote area: ${deleteResp.status}`)
  }
}

/** Delete a dataset from GitHub */
export async function deleteRemoteDataset(
  datasetId: string,
  config: GitHubSyncConfig,
): Promise<void> {
  const path = `${DATASETS_DIR}/${datasetId}.json`

  // First get the current SHA
  const resp = await ghFetch(path, config)
  if (resp.status === 404) return // Already gone
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)

  const file = await resp.json()

  const deleteResp = await ghFetch(path, config, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `Delete dataset: ${datasetId}`,
      sha: file.sha,
      branch: config.branch || 'main',
    }),
  })

  if (!deleteResp.ok && deleteResp.status !== 404) {
    throw new Error(`Failed to delete remote dataset: ${deleteResp.status}`)
  }
}
