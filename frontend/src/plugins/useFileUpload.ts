import { AxiosRequestConfig } from 'axios';
import { ChangeEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider.tsx';
import { useTranslations } from '@/providers/TranslationProvider.tsx';

type UploadStatus = 'pending' | 'uploading' | 'completed' | 'error';

interface FileUploadProgress {
  filePath: string;
  progress: number;
  size: number;
  uploaded: number;
  batchId: string;
  status: UploadStatus;
}

export interface AggregatedUploadProgress {
  totalSize: number;
  uploadedSize: number;
  fileCount: number;
}

export interface FileUploader {
  uploadingFiles: Map<string, FileUploadProgress>;
  aggregatedUploadProgress: Map<string, AggregatedUploadProgress>;
  totalUploadProgress: number;
  uploadFiles: (files: File[]) => Promise<void>;
  cancelFileUpload: (fileKey: string) => void;
  cancelFolderUpload: (folderName: string) => void;
  handleFileSelect: (event: ChangeEvent<HTMLInputElement>, inputRef: RefObject<HTMLInputElement | null>) => void;
  handleFolderSelect: (event: ChangeEvent<HTMLInputElement>, inputRef: RefObject<HTMLInputElement | null>) => void;
}

const CHUNK_TARGET_BYTES = 1024 * 1024 * 1024; // 1 GiB
const CHUNK_OVERFLOW_RATIO = 0.1;
const FOLDER_CONCURRENCY = 2;

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

function chunkFiles(files: File[]): File[][] {
  const sorted = [...files].sort((a, b) => b.size - a.size);
  const chunks: File[][] = [];
  const chunkSizes: number[] = [];

  for (const file of sorted) {
    let placed = false;
    for (let i = 0; i < chunks.length; i++) {
      const wouldBe = chunkSizes[i] + file.size;
      if (wouldBe <= CHUNK_TARGET_BYTES * (1 + CHUNK_OVERFLOW_RATIO)) {
        chunks[i].push(file);
        chunkSizes[i] = wouldBe;
        placed = true;
        break;
      }
    }
    if (!placed) {
      chunks.push([file]);
      chunkSizes.push(file.size);
    }
  }

  return chunks;
}

export function useFileUpload(
  uploadFunction: (form: FormData, config: AxiosRequestConfig) => unknown,
  onUploadComplete: () => void,
): FileUploader {
  const { t, tItem } = useTranslations();
  const { addToast } = useToast();

  const [uploadingFiles, setUploadingFiles] = useState<Map<string, FileUploadProgress>>(new Map());
  const fileIndexCounter = useRef(0);
  const activeUploads = useRef(0);
  const controllers = useRef<Map<string, AbortController>>(new Map());
  const folderFileCounts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (uploadingFiles.size === 0) return;

    const batchFiles = new Map<string, { allDone: boolean; keys: string[] }>();
    uploadingFiles.forEach((file, key) => {
      const entry = batchFiles.get(file.batchId) ?? { allDone: true, keys: [] };
      entry.keys.push(key);
      if (file.status !== 'completed' && file.status !== 'error') {
        entry.allDone = false;
      }
      batchFiles.set(file.batchId, entry);
    });

    const keysToRemove: string[] = [];
    batchFiles.forEach((batch) => {
      if (batch.allDone) keysToRemove.push(...batch.keys);
    });

    if (keysToRemove.length > 0) {
      const foldersBeingRemoved = new Set<string>();
      keysToRemove.forEach((key) => {
        const file = uploadingFiles.get(key);
        if (file && file.filePath.includes('/')) {
          foldersBeingRemoved.add(file.filePath.split('/')[0]);
        }
      });

      const nextUploadingFiles = new Map(uploadingFiles);
      keysToRemove.forEach((key) => nextUploadingFiles.delete(key));

      foldersBeingRemoved.forEach((folder) => {
        let hasRemainingFiles = false;
        for (const file of nextUploadingFiles.values()) {
          if (file.filePath.split('/')[0] === folder) {
            hasRemainingFiles = true;
            break;
          }
        }

        if (!hasRemainingFiles) {
          folderFileCounts.current.delete(folder);
        }
      });

      setUploadingFiles(nextUploadingFiles);
      onUploadComplete();
    }
  }, [uploadingFiles, onUploadComplete]);

  const uploadRequest = useCallback(
    async (files: File[], indices: number[], batchId: string, controller: AbortController) => {
      activeUploads.current++;

      try {
        setUploadingFiles((prev) => {
          const next = new Map(prev);
          for (const idx of indices) {
            const key = `file-${idx}`;
            const entry = next.get(key);
            if (entry?.status === 'pending') {
              next.set(key, { ...entry, status: 'uploading' });
            }
          }
          return next;
        });

        const formData = new FormData();
        for (const file of files) {
          formData.append('files', file, file.webkitRelativePath || file.name);
        }

        const totalRequestSize = files.reduce((sum, f) => sum + f.size, 0);
        let lastLoaded = 0;

        const config: AxiosRequestConfig = {
          signal: controller.signal,
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (event) => {
            const loaded = event.loaded ?? 0;
            const delta = loaded - lastLoaded;
            lastLoaded = loaded;
            if (delta <= 0) return;

            setUploadingFiles((prev) => {
              const next = new Map(prev);
              for (let i = 0; i < indices.length; i++) {
                const key = `file-${indices[i]}`;
                const entry = next.get(key);
                if (!entry || entry.status !== 'uploading') continue;

                const ratio = files[i].size / totalRequestSize;
                const newUploaded = Math.min(entry.uploaded + delta * ratio, files[i].size);
                next.set(key, {
                  ...entry,
                  uploaded: newUploaded,
                  progress: (newUploaded / files[i].size) * 100,
                });
              }
              return next;
            });
          },
        };

        await uploadFunction(formData, config);

        setUploadingFiles((prev) => {
          const next = new Map(prev);
          for (const idx of indices) {
            const key = `file-${idx}`;
            const entry = next.get(key);
            if (entry?.status === 'uploading') {
              next.set(key, { ...entry, progress: 100, uploaded: entry.size, status: 'completed' });
            }
          }
          return next;
        });
      } catch (error: unknown) {
        const isCancelled =
          error != null &&
          typeof error === 'object' &&
          'code' in error &&
          (error.code === 'CanceledError' || error.code === 'ERR_CANCELED');

        if (!isCancelled) {
          console.error('Upload error:', error);
          setUploadingFiles((prev) => {
            const next = new Map(prev);
            for (const idx of indices) {
              const key = `file-${idx}`;
              const entry = next.get(key);
              if (entry && entry.status !== 'completed') {
                next.set(key, { ...entry, status: 'error' });
              }
            }
            return next;
          });
          const message =
            error != null && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error';
          addToast(`Upload failed: ${message}`, 'error');
        }
      } finally {
        activeUploads.current--;
      }
    },
    [uploadFunction, addToast],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const startIndex = fileIndexCounter.current;
      fileIndexCounter.current += files.length;

      const individualFiles: Array<{ file: File; index: number }> = [];
      const folderFiles: Array<{ file: File; index: number }> = [];

      files.forEach((file, i) => {
        const idx = startIndex + i;
        const path = file.webkitRelativePath || file.name;
        const isFolder = path.includes('/');
        (isFolder ? folderFiles : individualFiles).push({ file, index: idx });
      });

      const folderBatchIds = new Map<string, string>();
      const folderCounts = new Map<string, number>();
      for (const { file } of folderFiles) {
        const path = file.webkitRelativePath || file.name;
        const folder = path.split('/')[0];
        if (!folderBatchIds.has(folder)) {
          folderBatchIds.set(folder, `folder-${folder}-${Date.now()}`);
        }
        folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1);
      }

      folderCounts.forEach((count, folder) => {
        const existingCount = folderFileCounts.current.get(folder) ?? 0;
        folderFileCounts.current.set(folder, existingCount + count);
      });

      setUploadingFiles((prev) => {
        const next = new Map(prev);

        for (const { file, index } of individualFiles) {
          const key = `file-${index}`;
          next.set(key, {
            filePath: file.name,
            progress: 0,
            size: file.size,
            uploaded: 0,
            batchId: key,
            status: 'pending',
          });
        }

        for (const { file, index } of folderFiles) {
          const path = file.webkitRelativePath || file.name;
          const folder = path.split('/')[0];
          const batchId = folderBatchIds.get(folder)!;
          next.set(`file-${index}`, {
            filePath: path,
            progress: 0,
            size: file.size,
            uploaded: 0,
            batchId,
            status: 'pending',
          });
        }

        return next;
      });

      for (const { index } of individualFiles) {
        const key = `file-${index}`;
        controllers.current.set(key, new AbortController());
      }

      for (const [, batchId] of folderBatchIds) {
        controllers.current.set(batchId, new AbortController());
      }

      const promises: Promise<void>[] = [];

      for (const { file, index } of individualFiles) {
        const key = `file-${index}`;
        const controller = controllers.current.get(key)!;
        promises.push(uploadRequest([file], [index], key, controller));
      }

      const folderGroups = new Map<string, Array<{ file: File; index: number }>>();
      for (const entry of folderFiles) {
        const path = entry.file.webkitRelativePath || entry.file.name;
        const folder = path.split('/')[0];
        if (!folderGroups.has(folder)) folderGroups.set(folder, []);
        folderGroups.get(folder)!.push(entry);
      }

      for (const [folder, entries] of folderGroups) {
        const batchId = folderBatchIds.get(folder)!;
        const controller = controllers.current.get(batchId)!;
        const chunks = chunkFiles(entries.map((e) => e.file));

        const fileToIndex = new Map<File, number>();
        for (const entry of entries) {
          fileToIndex.set(entry.file, entry.index);
        }

        const semaphore = new Semaphore(FOLDER_CONCURRENCY);
        for (const chunk of chunks) {
          const chunkIndices = chunk.map((f) => fileToIndex.get(f)!);
          promises.push(
            semaphore.acquire().then(async () => {
              try {
                await uploadRequest(chunk, chunkIndices, batchId, controller);
              } finally {
                semaphore.release();
              }
            }),
          );
        }
      }

      addToast(
        t('elements.fileUpload.toast.uploading', {
          files: tItem('file', files.length),
        }),
        'success',
      );

      await Promise.allSettled(promises);
    },
    [uploadRequest, addToast],
  );

  const cancelFileUpload = useCallback((fileKey: string) => {
    setUploadingFiles((prev) => {
      const entry = prev.get(fileKey);
      if (!entry) return prev;

      const controller = controllers.current.get(entry.batchId);
      controller?.abort();
      controllers.current.delete(entry.batchId);

      const next = new Map(prev);
      next.delete(fileKey);

      addToast(
        t('elements.fileUpload.toast.cancelledFile', {
          file: entry.filePath,
        }).md(),
        'success',
      );
      return next;
    });
  }, []);

  const cancelFolderUpload = useCallback(
    (folderName: string) => {
      folderFileCounts.current.delete(folderName);

      setUploadingFiles((prev) => {
        const keysToRemove: string[] = [];
        let batchId: string | null = null;

        prev.forEach((file, key) => {
          if (file.filePath.split('/')[0] === folderName) {
            keysToRemove.push(key);
            batchId = file.batchId;
          }
        });

        if (keysToRemove.length === 0) return prev;

        if (batchId) {
          controllers.current.get(batchId)?.abort();
          controllers.current.delete(batchId);
        }

        const next = new Map(prev);
        keysToRemove.forEach((key) => next.delete(key));

        addToast(
          t('elements.fileUpload.toast.cancelledFolder', {
            folder: folderName,
            files: tItem('file', keysToRemove.length),
          }).md(),
          'success',
        );
        return next;
      });
    },
    [addToast],
  );

  const aggregatedUploadProgress = useMemo(() => {
    const map = new Map<string, AggregatedUploadProgress>();

    uploadingFiles.forEach((file) => {
      const parts = file.filePath.split('/');
      if (parts.length < 2) return;

      const folder = parts[0];
      const prev = map.get(folder) ?? {
        totalSize: 0,
        uploadedSize: 0,
        fileCount: folderFileCounts.current.get(folder) ?? 0,
      };

      map.set(folder, {
        ...prev,
        totalSize: prev.totalSize + file.size,
        uploadedSize: prev.uploadedSize + file.uploaded,
        fileCount: prev.fileCount,
      });
    });

    return map;
  }, [uploadingFiles]);

  const totalUploadProgress = useMemo(() => {
    if (uploadingFiles.size === 0) return 0;

    let totalSize = 0;
    let totalUploaded = 0;

    uploadingFiles.forEach((file) => {
      totalSize += file.size;
      totalUploaded += file.uploaded;
    });

    return totalSize === 0 ? 0 : (totalUploaded / totalSize) * 100;
  }, [uploadingFiles]);

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>, inputRef: RefObject<HTMLInputElement | null>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) uploadFiles(files);
      if (inputRef.current) inputRef.current.value = '';
    },
    [uploadFiles],
  );

  const handleFolderSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>, inputRef: RefObject<HTMLInputElement | null>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) uploadFiles(files);
      if (inputRef.current) inputRef.current.value = '';
    },
    [uploadFiles],
  );

  return {
    uploadingFiles,
    aggregatedUploadProgress,
    totalUploadProgress,
    uploadFiles,
    cancelFileUpload,
    cancelFolderUpload,
    handleFileSelect,
    handleFolderSelect,
  };
}
