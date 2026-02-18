import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { StorageFile } from '@/components/storage/storageTypes';

const DEFAULT_BUCKET = 'project-files';

export function useFiles(bucket = DEFAULT_BUCKET, basePath = '', projectId?: string) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listFiles = useCallback(async (path = basePath) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: listError } = await supabase.storage
        .from(bucket)
        .list(path, { sortBy: { column: 'name', order: 'asc' } });
      if (listError) throw listError;
      const mapped: StorageFile[] = (data ?? []).map(f => {
        const isFolder = !f.id;
        return {
          name: f.name,
          id: f.id ?? f.name,
          size: f.metadata?.size ?? 0,
          type: isFolder ? 'folder' : (f.metadata?.mimetype ?? 'file'),
          created_at: f.created_at ?? '',
          updated_at: f.updated_at ?? f.created_at ?? '',
          metadata: (f.metadata as Record<string, unknown>) ?? {},
        };
      });
      const filtered = projectId
        ? mapped.filter(f => f.metadata?.projectId === projectId)
        : mapped;
      setFiles(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list files');
    } finally {
      setLoading(false);
    }
  }, [bucket, basePath, projectId]);

  const upload = useCallback(async (path: string, file: File) => {
    setError(null);
    const fullPath = basePath ? `${basePath}/${path}` : path;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fullPath, file, { upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      return false;
    }
    await listFiles();
    return true;
  }, [bucket, basePath, listFiles]);

  const download = useCallback(async (path: string) => {
    const fullPath = basePath ? `${basePath}/${path}` : path;
    const { data, error: dlError } = await supabase.storage
      .from(bucket)
      .download(fullPath);
    if (dlError) { setError(dlError.message); return null; }
    return data;
  }, [bucket, basePath]);

  const remove = useCallback(async (path: string) => {
    const fullPath = basePath ? `${basePath}/${path}` : path;
    const { error: rmError } = await supabase.storage
      .from(bucket)
      .remove([fullPath]);
    if (rmError) { setError(rmError.message); return false; }
    setFiles(prev => prev.filter(f => f.name !== path.split('/').pop()));
    return true;
  }, [bucket, basePath]);

  const getPublicUrl = useCallback((path: string) => {
    const fullPath = basePath ? `${basePath}/${path}` : path;
    return supabase.storage.from(bucket).getPublicUrl(fullPath).data.publicUrl;
  }, [bucket, basePath]);

  useEffect(() => { listFiles(); }, [listFiles]);

  return { files, loading, error, refresh: listFiles, upload, download, remove, getPublicUrl };
}
