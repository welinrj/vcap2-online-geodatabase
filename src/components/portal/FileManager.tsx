import { useState, useEffect, useRef, useCallback, type FC } from 'react'
import type { UserProfile } from '../../types/user'
import {
  createFolder,
  listFolders,
  deleteFolder,
  renameFolder,
  uploadFile,
  listFiles,
  deleteFile,
  getFile,
  shareItem,
  listSharedWithMe,
  listMyShares,
  deleteShare,
  formatFileSize,
  downloadFile,
  type FileFolder,
  type FileEntry,
  type FileShare,
} from '../../services/fileManagerStore'
import { setupDefaultFolders } from '../../services/fileManagerSetup'
import { listUsers } from '../../services/userStore'
import Icons8Icon from '../Icons8Icon'
import './FileManager.css'

interface FileManagerProps {
  currentUser: UserProfile | null
}

type Tab = 'my-files' | 'shared-with-me' | 'sent'

/** Map MIME prefix to Icons8 icon name (null = use Lucide fallback) */
const FILE_ICON_NAME_MAP: [string, string | null][] = [
  ['image/', 'image-file'],
  ['text/', 'pdf'],
  ['application/pdf', 'pdf'],
  ['application/vnd.', 'xls'],
  ['application/zip', null],
  ['application/x-zip', null],
]

function getFileIcons8Name(mimeType: string): string | null {
  for (const [prefix, name] of FILE_ICON_NAME_MAP) {
    if (mimeType.startsWith(prefix)) return name
  }
  return null
}

const FileManager: FC<FileManagerProps> = ({ currentUser }) => {
  const [tab, setTab] = useState<Tab>('my-files')
  const [folders, setFolders] = useState<FileFolder[]>([])
  const [files, setFiles] = useState<FileEntry[]>([])
  const [breadcrumb, setBreadcrumb] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'My Files' },
  ])
  const [loading, setLoading] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // Share modal
  const [shareModal, setShareModal] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null)
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [shareTargetId, setShareTargetId] = useState('')
  const [shareStatus, setShareStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Shared with me / sent
  const [sharedWithMe, setSharedWithMe] = useState<FileShare[]>([])
  const [sentShares, setSentShares] = useState<FileShare[]>([])

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Alert
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Default folder setup
  const [settingUp, setSettingUp] = useState(false)
  const setupRan = useRef(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentFolderId = breadcrumb[breadcrumb.length - 1].id

  // Auto-create VCAP2 default folder structure on first visit
  useEffect(() => {
    if (!currentUser || setupRan.current) return
    setupRan.current = true
    let cancelled = false
    ;(async () => {
      try {
        setSettingUp(true)
        const created = await setupDefaultFolders(currentUser.id, currentUser.name)
        if (!cancelled && created > 0) {
          showAlert('success', `VCAP2 folder structure created (${created} folders)`)
        }
      } catch {
        // non-fatal – user can still create folders manually
      } finally {
        if (!cancelled) setSettingUp(false)
      }
    })()
    return () => { cancelled = true }
  }, [currentUser])

  const loadContents = useCallback(async () => {
    if (!currentUser) return
    setLoading(true)
    try {
      const [f, fi] = await Promise.all([
        listFolders(currentFolderId),
        currentFolderId ? listFiles(currentFolderId) : Promise.resolve([]),
      ])
      setFolders(f)
      setFiles(fi)
    } catch {
      showAlert('error', 'Failed to load folder contents')
    } finally {
      setLoading(false)
    }
  }, [currentUser, currentFolderId])

  // Load folder contents (also reload after setup completes)
  useEffect(() => {
    if (!currentUser || tab !== 'my-files' || settingUp) return
    loadContents()
  }, [currentUser, currentFolderId, tab, loadContents, settingUp])

  // Load shares
  useEffect(() => {
    if (!currentUser) return
    if (tab === 'shared-with-me') {
      listSharedWithMe(currentUser.id).then(setSharedWithMe).catch(() => {})
    } else if (tab === 'sent') {
      listMyShares(currentUser.id).then(setSentShares).catch(() => {})
    }
  }, [currentUser, tab])

  function showAlert(type: 'success' | 'error', msg: string) {
    setAlert({ type, msg })
    setTimeout(() => setAlert(null), 3000)
  }

  // ─── Folder actions ─────────────────────────────

  async function handleCreateFolder() {
    if (!currentUser || !newFolderName.trim()) return
    try {
      await createFolder(newFolderName.trim(), currentFolderId, currentUser.id, currentUser.name)
      setNewFolderName('')
      setShowNewFolder(false)
      showAlert('success', `Folder "${newFolderName.trim()}" created`)
      await loadContents()
    } catch {
      showAlert('error', 'Failed to create folder')
    }
  }

  async function handleDeleteFolder(folder: FileFolder) {
    if (!confirm(`Delete folder "${folder.name}" and all its contents?`)) return
    try {
      await deleteFolder(folder.id)
      showAlert('success', `Folder "${folder.name}" deleted`)
      await loadContents()
    } catch {
      showAlert('error', 'Failed to delete folder')
    }
  }

  async function handleRenameFolder(folderId: string) {
    if (!renameValue.trim()) return
    try {
      await renameFolder(folderId, renameValue.trim())
      setRenamingId(null)
      await loadContents()
    } catch {
      showAlert('error', 'Failed to rename folder')
    }
  }

  function navigateToFolder(folder: FileFolder) {
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
  }

  function navigateToBreadcrumb(index: number) {
    setBreadcrumb((prev) => prev.slice(0, index + 1))
  }

  // ─── File actions ───────────────────────────────

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!currentUser || !e.target.files?.length) return
    if (!currentFolderId) {
      showAlert('error', 'Please open a folder before uploading files')
      return
    }
    const files = Array.from(e.target.files)
    setUploading(true)
    setUploadProgress(0)
    try {
      let completed = 0
      for (const file of files) {
        await uploadFile(file, currentFolderId, currentUser.id, currentUser.name, (pct) => {
          // overall progress: prior files 100% + current file progress
          setUploadProgress(Math.round(((completed * 100) + pct) / files.length))
        })
        completed++
        setUploadProgress(Math.round((completed / files.length) * 100))
      }
      showAlert('success', `${files.length} file${files.length > 1 ? 's' : ''} uploaded`)
      await loadContents()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload file(s)'
      showAlert('error', msg)
    } finally {
      setUploading(false)
      setUploadProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteFile(file: FileEntry) {
    if (!confirm(`Delete "${file.name}"?`)) return
    try {
      await deleteFile(file.id)
      showAlert('success', `"${file.name}" deleted`)
      await loadContents()
    } catch {
      showAlert('error', 'Failed to delete file')
    }
  }

  async function handleDownloadFile(file: FileEntry) {
    try {
      // Fetch full metadata (includes storageUrl) if needed
      const entry = file.storageUrl ? file : await getFile(file.id)
      if (entry) await downloadFile(entry)
      else showAlert('error', 'File data not found')
    } catch {
      showAlert('error', 'Failed to download file')
    }
  }

  // ─── Share actions ──────────────────────────────

  async function openShareModal(type: 'folder' | 'file', id: string, name: string) {
    setShareModal({ type, id, name })
    setShareTargetId('')
    setShareStatus(null)
    if (allUsers.length === 0) {
      const users = await listUsers()
      setAllUsers(users.filter((u) => u.id !== currentUser?.id))
    }
  }

  async function handleShare() {
    if (!currentUser || !shareModal || !shareTargetId) return
    const target = allUsers.find((u) => u.id === shareTargetId)
    if (!target) return
    try {
      await shareItem(
        shareModal.type,
        shareModal.id,
        shareModal.name,
        currentUser.id,
        currentUser.name,
        target.id,
        target.name,
      )
      setShareStatus({ type: 'success', msg: `Sent to ${target.name}` })
      setTimeout(() => setShareModal(null), 1500)
    } catch {
      setShareStatus({ type: 'error', msg: 'Failed to share' })
    }
  }

  async function handleDownloadShared(share: FileShare) {
    if (share.itemType === 'file') {
      const file = await getFile(share.itemId)
      if (file) await downloadFile(file)
      else showAlert('error', 'File no longer exists')
    }
  }

  async function handleRemoveShare(shareId: string) {
    await deleteShare(shareId)
    if (tab === 'shared-with-me') {
      setSharedWithMe((prev) => prev.filter((s) => s.id !== shareId))
    } else {
      setSentShares((prev) => prev.filter((s) => s.id !== shareId))
    }
  }

  if (!currentUser) return null

  // ─── Render ─────────────────────────────────────

  return (
    <div className="fm">
      {/* Alert */}
      {alert && (
        <div className={`fm-alert fm-alert-${alert.type}`} onClick={() => setAlert(null)}>
          {alert.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="fm-tabs">
        <button className={`fm-tab ${tab === 'my-files' ? 'fm-tab-active' : ''}`} onClick={() => setTab('my-files')}>
          <Icons8Icon name="opened-folder" size={16} /> My Files
        </button>
        <button
          className={`fm-tab ${tab === 'shared-with-me' ? 'fm-tab-active' : ''}`}
          onClick={() => setTab('shared-with-me')}
        >
          <Icons8Icon name="opened-folder" size={16} /> Shared with Me
        </button>
        <button className={`fm-tab ${tab === 'sent' ? 'fm-tab-active' : ''}`} onClick={() => setTab('sent')}>
          <Icons8Icon name="chat" size={16} /> Sent
        </button>
      </div>

      {/* ═══ My Files Tab ═══ */}
      {tab === 'my-files' && (
        <>
          {/* Breadcrumb */}
          <div className="fm-breadcrumb">
            {breadcrumb.map((b, i) => (
              <span key={b.id ?? 'root'} className="fm-breadcrumb-item">
                {i > 0 && <Icons8Icon name="chevron-right" size={14} className="fm-breadcrumb-sep" />}
                <button
                  className={`fm-breadcrumb-btn ${i === breadcrumb.length - 1 ? 'fm-breadcrumb-current' : ''}`}
                  onClick={() => navigateToBreadcrumb(i)}
                >
                  {b.name}
                </button>
              </span>
            ))}
          </div>

          {/* Toolbar */}
          <div className="fm-toolbar">
            {breadcrumb.length > 1 && (
              <button className="fm-btn fm-btn-secondary" onClick={() => navigateToBreadcrumb(breadcrumb.length - 2)}>
                <Icons8Icon name="back" size={16} /> Back
              </button>
            )}
            <button className="fm-btn fm-btn-primary" onClick={() => setShowNewFolder(true)}>
              <Icons8Icon name="plus" size={16} /> New Folder
            </button>
            <button
              className="fm-btn fm-btn-primary"
              onClick={() => {
                if (!currentFolderId) {
                  showAlert('error', 'Please open a folder before uploading files')
                  return
                }
                fileInputRef.current?.click()
              }}
              disabled={uploading}
            >
              <Icons8Icon name="upload" size={16} />{' '}
              {uploading ? `Uploading${uploadProgress !== null ? ` ${uploadProgress}%` : '...'}` : 'Upload Files'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </div>

          {/* New folder input */}
          {showNewFolder && (
            <div className="fm-new-folder">
              <input
                className="fm-input"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                autoFocus
              />
              <button className="fm-btn fm-btn-primary fm-btn-sm" onClick={handleCreateFolder}>
                Create
              </button>
              <button
                className="fm-btn fm-btn-secondary fm-btn-sm"
                onClick={() => {
                  setShowNewFolder(false)
                  setNewFolderName('')
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Content area */}
          {settingUp ? (
            <div className="fm-loading">Setting up VCAP2 folder structure...</div>
          ) : loading ? (
            <div className="fm-loading">Loading...</div>
          ) : (
            <div className="fm-grid">
              {/* Folders */}
              {folders.map((folder) => (
                <div key={folder.id} className="fm-item fm-item-folder" onDoubleClick={() => navigateToFolder(folder)}>
                  <div className="fm-item-icon" onClick={() => navigateToFolder(folder)}>
                    <Icons8Icon name="opened-folder" size={32} />
                  </div>
                  <div className="fm-item-info">
                    {renamingId === folder.id ? (
                      <div className="fm-rename-row">
                        <input
                          className="fm-input fm-input-sm"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFolder(folder.id)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          autoFocus
                        />
                        <button className="fm-icon-btn" onClick={() => handleRenameFolder(folder.id)}>
                          <Icons8Icon name="ok" size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="fm-item-name" onClick={() => navigateToFolder(folder)}>
                        {folder.name}
                      </span>
                    )}
                  </div>
                  <div className="fm-item-actions">
                    <button
                      className="fm-icon-btn"
                      title="Rename"
                      onClick={() => {
                        setRenamingId(folder.id)
                        setRenameValue(folder.name)
                      }}
                    >
                      <Icons8Icon name="edit" size={14} />
                    </button>
                    <button
                      className="fm-icon-btn"
                      title="Share"
                      onClick={() => openShareModal('folder', folder.id, folder.name)}
                    >
                      <Icons8Icon name="share" size={14} />
                    </button>
                    <button
                      className="fm-icon-btn fm-icon-btn-danger"
                      title="Delete"
                      onClick={() => handleDeleteFolder(folder)}
                    >
                      <Icons8Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Files */}
              {files.map((file) => {
                const iconName = getFileIcons8Name(file.mimeType) ?? 'file'
                return (
                  <div key={file.id} className="fm-item fm-item-file">
                    <div className="fm-item-icon">
                      <Icons8Icon name={iconName} size={32} />
                    </div>
                    <div className="fm-item-info">
                      <span className="fm-item-name">{file.name}</span>
                      <span className="fm-item-meta">{formatFileSize(file.sizeBytes)}</span>
                    </div>
                    <div className="fm-item-actions">
                      <button className="fm-icon-btn" title="Download" onClick={() => handleDownloadFile(file)}>
                        <Icons8Icon name="download" size={14} />
                      </button>
                      <button
                        className="fm-icon-btn"
                        title="Share"
                        onClick={() => openShareModal('file', file.id, file.name)}
                      >
                        <Icons8Icon name="share" size={14} />
                      </button>
                      <button
                        className="fm-icon-btn fm-icon-btn-danger"
                        title="Delete"
                        onClick={() => handleDeleteFile(file)}
                      >
                        <Icons8Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Empty state */}
              {folders.length === 0 && files.length === 0 && (
                <div className="fm-empty">
                  <Icons8Icon name="opened-folder" size={48} />
                  <p>{currentFolderId ? 'This folder is empty' : 'No folders yet. Create one to get started.'}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══ Shared with Me Tab ═══ */}
      {tab === 'shared-with-me' && (
        <div className="fm-share-list">
          {sharedWithMe.length === 0 ? (
            <div className="fm-empty">
              <Icons8Icon name="opened-folder" size={48} />
              <p>Nothing shared with you yet</p>
            </div>
          ) : (
            sharedWithMe.map((share) => (
              <div key={share.id} className="fm-share-item">
                <div className="fm-share-icon">
                  {share.itemType === 'folder' ? <Icons8Icon name="opened-folder" size={20} /> : <Icons8Icon name="file" size={20} />}
                </div>
                <div className="fm-share-info">
                  <span className="fm-share-name">{share.itemName}</span>
                  <span className="fm-share-from">
                    From <strong>{share.fromUserName}</strong> &middot;{' '}
                    {new Date(share.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="fm-share-actions">
                  {share.itemType === 'file' && (
                    <button className="fm-icon-btn" title="Download" onClick={() => handleDownloadShared(share)}>
                      <Icons8Icon name="download" size={14} />
                    </button>
                  )}
                  <button
                    className="fm-icon-btn fm-icon-btn-danger"
                    title="Remove"
                    onClick={() => handleRemoveShare(share.id)}
                  >
                    <Icons8Icon name="cancel" size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══ Sent Tab ═══ */}
      {tab === 'sent' && (
        <div className="fm-share-list">
          {sentShares.length === 0 ? (
            <div className="fm-empty">
              <Icons8Icon name="send" size={48} />
              <p>You haven't sent anything yet</p>
            </div>
          ) : (
            sentShares.map((share) => (
              <div key={share.id} className="fm-share-item">
                <div className="fm-share-icon">
                  {share.itemType === 'folder' ? <Icons8Icon name="opened-folder" size={20} /> : <Icons8Icon name="file" size={20} />}
                </div>
                <div className="fm-share-info">
                  <span className="fm-share-name">{share.itemName}</span>
                  <span className="fm-share-from">
                    Sent to <strong>{share.toUserName}</strong> &middot;{' '}
                    {new Date(share.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="fm-share-actions">
                  <button
                    className="fm-icon-btn fm-icon-btn-danger"
                    title="Revoke"
                    onClick={() => handleRemoveShare(share.id)}
                  >
                    <Icons8Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ═══ Share Modal ═══ */}
      {shareModal && (
        <div className="fm-modal-overlay" onClick={() => setShareModal(null)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">
              <h3>
                <Icons8Icon name="share" size={18} /> Share "{shareModal.name}"
              </h3>
              <button className="fm-icon-btn" onClick={() => setShareModal(null)}>
                <Icons8Icon name="cancel" size={18} />
              </button>
            </div>
            <div className="fm-modal-body">
              <label className="fm-label">Send to</label>
              <select
                className="fm-select"
                value={shareTargetId}
                onChange={(e) => setShareTargetId(e.target.value)}
              >
                <option value="">Select a user...</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.role ? `(${u.role})` : ''}
                  </option>
                ))}
              </select>
              {shareStatus && (
                <div className={`fm-alert fm-alert-${shareStatus.type}`} style={{ marginTop: '0.75rem' }}>
                  {shareStatus.msg}
                </div>
              )}
            </div>
            <div className="fm-modal-footer">
              <button className="fm-btn fm-btn-secondary" onClick={() => setShareModal(null)}>
                Cancel
              </button>
              <button className="fm-btn fm-btn-primary" onClick={handleShare} disabled={!shareTargetId}>
                <Icons8Icon name="send" size={14} /> Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FileManager
