export interface LocalJobRecord {
  id: string;
  filename: string;
  timestamp: string;
  originalSize: number;
  processedSize: number;
  dimensions: string;
  watermarkTypesRemoved: string[];
  status: 'completed' | 'failed';
  executionTimeMs: number;
  previewUrl?: string;
}

const STORAGE_KEY = 'synthid_remover_local_history_v1';

export function getLocalHistory(): LocalJobRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read local history:', err);
    return [];
  }
}

export function saveLocalJob(job: Omit<LocalJobRecord, 'id' | 'timestamp'>): LocalJobRecord {
  const history = getLocalHistory();
  const newRecord: LocalJobRecord = {
    ...job,
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
  };

  let updated = [newRecord, ...history].slice(0, 50); // Keep latest 50 local jobs
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // If browser 5MB localStorage quota is reached, strip previewUrls from older records
      updated = updated.map((r, idx) => (idx === 0 ? r : { ...r, previewUrl: undefined }));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // If still over quota, strip previewUrl from all records to preserve job telemetry logs
        updated = updated.map((r) => ({ ...r, previewUrl: undefined }));
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (err) {
          console.error('Failed to save job to local storage:', err);
        }
      }
    }
  }
  return newRecord;
}

export function clearLocalHistory(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
