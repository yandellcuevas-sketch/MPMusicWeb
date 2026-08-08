import React, { useState, useRef } from 'react';
import { cartService } from '../services/cartService';
import { UploadCloud, File, Trash2, Plus, AlertTriangle } from 'lucide-react';

interface ImportTabProps {
  showToast: (message: string, type: 'success' | 'info' | 'error') => void;
}

export const ImportTab: React.FC<ImportTabProps> = ({ showToast }) => {
  const [dragging, setDragging] = useState(false);
  const [stagingFiles, setStagingFiles] = useState<{ id: string; file: File; duplicates?: any[] }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const processSelectedFiles = async (files: FileList) => {
    const validFiles: { id: string; file: File; duplicates?: any[] }[] = [];
    const allowedExtensions = ['mp3', 'mp4', 'wav', 'flac', 'm4a', 'aac', 'ogg'];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      
      if (allowedExtensions.includes(extension)) {
        // Run duplicate check
        const cleanNameParts = file.name.replace(/\.[^/.]+$/, '').split(/\s*-\s*/);
        const title = cleanNameParts.length > 1 ? cleanNameParts.slice(1).join(' - ') : cleanNameParts[0];
        const artist = cleanNameParts.length > 1 ? cleanNameParts[0] : 'Local Import';

        const duplicates = await cartService.checkDuplicates(title, artist, 0); // Check by name/artist similarity

        validFiles.push({
          id: `stage_${Math.random().toString(36).substring(7)}_${Date.now()}`,
          file,
          duplicates: duplicates.length > 0 ? duplicates : undefined
        });
      } else {
        showToast(`Skipped unsupported file: ${file.name}`, 'error');
      }
    }

    if (validFiles.length > 0) {
      setStagingFiles((prev) => [...prev, ...validFiles]);
      showToast(`Staged ${validFiles.length} files. Review duplicates below.`, 'info');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) {
      await processSelectedFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processSelectedFiles(e.target.files);
    }
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const removeStagedFile = (id: string) => {
    setStagingFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const importSingle = async (stagedId: string, resolveConflict?: 'keep' | 'replace' | 'skip') => {
    const target = stagingFiles.find((s) => s.id === stagedId);
    if (!target) return;

    try {
      const result = await cartService.importLocalFile(target.file, { resolveConflict });
      if (result.id) {
        showToast(`Imported "${target.file.name}"`, 'success');
        removeStagedFile(stagedId);
      } else if (result.duplicateOf) {
        // Update staged file with duplicates if not resolved
        setStagingFiles((prev) =>
          prev.map((s) => (s.id === stagedId ? { ...s, duplicates: result.duplicateOf } : s))
        );
        showToast(`Duplicate found for "${target.file.name}"`, 'error');
      }
    } catch (err) {
      showToast(`Failed to import "${target.file.name}"`, 'error');
    }
  };

  const importAllStaged = async () => {
    const items = [...stagingFiles];
    let successCount = 0;

    for (const staged of items) {
      // If duplicates exist, we skip in batch import (they must resolve manually)
      if (staged.duplicates) continue;

      try {
        const result = await cartService.importLocalFile(staged.file, { resolveConflict: 'skip' });
        if (result.id) {
          successCount++;
          // Remove from local staging array
          setStagingFiles((prev) => prev.filter((p) => p.id !== staged.id));
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (successCount > 0) {
      showToast(`Successfully imported ${successCount} tracks to Cart!`, 'success');
    }
    if (stagingFiles.length > 0) {
      showToast(`${stagingFiles.length} files with duplicate warnings require manual resolution.`, 'info');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = 2;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="import-tab animate-fade-in">
      <h1>Import Local Files</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
        Add your owned or licensed media tracks directly. Supported formats: MP3, MP4, WAV, M4A, AAC, FLAC, OGG.
      </p>

      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFilePicker}
        style={{
          border: '2px dashed',
          borderColor: dragging ? 'var(--accent)' : 'var(--border-subtle)',
          backgroundColor: dragging ? 'var(--accent-muted)' : 'var(--bg-card)',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'var(--transition-smooth)',
          marginBottom: '32px',
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          accept="audio/*,video/mp4"
          onChange={handleFileSelect}
        />
        <UploadCloud size={48} style={{ color: dragging ? 'var(--accent)' : 'var(--text-muted)', marginBottom: '16px' }} />
        <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
          Drag and drop files here
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          or click to browse your folders (multiple select allowed)
        </p>
      </div>

      {/* Staging List */}
      {stagingFiles.length > 0 && (
        <div className="animate-slide-up">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>Staging Files ({stagingFiles.length})</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setStagingFiles([])}>
                Clear All
              </button>
              <button className="btn btn-primary" onClick={importAllStaged}>
                <Plus size={16} /> Import Clean Files
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stagingFiles.map((staged) => {
              const hasConflict = !!staged.duplicates;

              return (
                <div
                  key={staged.id}
                  className="card"
                  style={{
                    padding: '12px 18px',
                    borderColor: hasConflict ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-subtle)',
                    backgroundColor: hasConflict ? 'rgba(245, 158, 11, 0.05)' : 'var(--bg-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <File size={20} style={{ color: 'var(--text-muted)' }} />
                    <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                      <div style={{ fontWeight: '500', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {staged.file.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Size: {formatSize(staged.file.size)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {!hasConflict ? (
                        <button
                          className="btn btn-primary btn-icon-only"
                          onClick={() => importSingle(staged.id)}
                          title="Import Track"
                        >
                          <Plus size={14} />
                        </button>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--warning)', marginRight: '8px' }}>
                          <AlertTriangle size={14} /> Duplicate Alert
                        </span>
                      )}

                      <button
                        className="btn btn-secondary btn-icon-only"
                        onClick={() => removeStagedFile(staged.id)}
                        title="Remove from stage"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Conflict resolution panel */}
                  {hasConflict && (
                    <div
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-hover)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        fontSize: '12px',
                      }}
                    >
                      <span>How would you like to handle this duplicate name?</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={() => importSingle(staged.id, 'keep')}
                        >
                          Keep Both
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={() => importSingle(staged.id, 'replace')}
                        >
                          Replace
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={() => removeStagedFile(staged.id)}
                        >
                          Omit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
