export interface StorageFile {
  name: string;
  id: string;
  size: number;
  type: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export type StorageTab = 'browser' | 'database' | 'backups';

export type FileViewMode = 'list' | 'grid';

export interface TableInfo {
  name: string;
  row_count: number;
}

export interface BackupHistoryEntry {
  timestamp: string;
  tableCount: number;
  size: number;
}
