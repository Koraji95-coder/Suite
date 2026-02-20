import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface RecentFile {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  context: string;
  accessed_at: string;
}

export function useRecentFiles(limit = 10) {
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setFiles([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('recent_files')
        .select('*')
        .eq('user_id', session.user.id)
        .order('accessed_at', { ascending: false })
        .limit(limit);

      if (data) setFiles(data as RecentFile[]);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load]);

  const trackAccess = useCallback(async (
    fileName: string,
    filePath: string,
    fileType = 'unknown',
    context = '',
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await supabase
        .from('recent_files')
        .upsert(
          {
            user_id: session.user.id,
            file_name: fileName,
            file_path: filePath,
            file_type: fileType,
            context,
            accessed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,file_path' }
        );

      load();
    } catch {
      // silent
    }
  }, [load]);

  return { files, loading, trackAccess, refresh: load };
}
