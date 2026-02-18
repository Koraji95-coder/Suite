import { useState, useEffect, useRef, useCallback } from 'react';
import { HardDrive, Database, FileText, Search, Download, Eye, Trash2, RefreshCw, Info, Key, Shield, Upload, AlertCircle, Loader2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PanelInfoDialog } from './PanelInfoDialog';
import { storageInfo } from '../data/panelInfo';
import { runFullBackup, downloadYaml, getLastBackupTimestamp, restoreFromYaml, listBackupFiles, readBackupFile, deleteBackupFile, BackupFileInfo } from '../lib/backupManager';
import { FrameSection } from './ui/PageFrame';

interface StorageFile {
  id: string;
  project_id: string;
  name: string;
  file_path: string;
  size: number;
  mime_type: string;
  uploaded_at: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

interface TableInfo {
  name: string;
  row_count: number;
}

export function StorageManager() {
  const [activeView, setActiveView] = useState<'files' | 'database'>('files');
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [tableData, setTableData] = useState<Record<string, unknown>[]>([]);
  const [projectNameCache, setProjectNameCache] = useState<Map<string, string>>(new Map());
  const [showDbInfo, setShowDbInfo] = useState(false);
  const [backupStatus, setBackupStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [lastBackup, setLastBackup] = useState<string | null>(getLastBackupTimestamp());
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [backupFiles, setBackupFiles] = useState<BackupFileInfo[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingTableData, setIsLoadingTableData] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setBackupStatus('running');
    try {
      await runFullBackup();
      setLastBackup(getLastBackupTimestamp());
      // Refresh the backup file list to show the new file
      await loadBackupFiles();
      setBackupStatus('done');
      setTimeout(() => setBackupStatus('idle'), 3000);
    } catch (e) {
      setBackupStatus('error');
      setErrorMessage(`Backup failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setTimeout(() => setBackupStatus('idle'), 3000);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setRestoreStatus('Reading file...');
    try {
      const text = await file.text();
      setRestoreStatus('Restoring data...');
      const { restored, errors } = await restoreFromYaml(text);

      if (errors.length > 0) {
        setRestoreStatus(`Restored ${restored} rows with ${errors.length} errors`);
        setErrorMessage(`Restore completed with ${errors.length} error(s): ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`);
      } else {
        setRestoreStatus(`✓ Successfully restored ${restored} rows`);
      }

      // Refresh table data
      loadTableInfo();
      if (selectedTable) loadTableData(selectedTable);
    } catch (err) {
      setRestoreStatus('Failed to restore');
      setErrorMessage(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    setTimeout(() => setRestoreStatus(null), 5000);
    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadBackupFiles = async () => {
    setLoadingBackups(true);
    try {
      const files = await listBackupFiles();
      setBackupFiles(files);
    } catch {
      setBackupFiles([]);
      setErrorMessage('Failed to load backup files');
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleRestoreFromBackup = async (filename: string) => {
    setRestoreStatus(`Reading ${filename}...`);
    try {
      const content = await readBackupFile(filename);
      if (!content) {
        setRestoreStatus('Failed to read backup file');
        setErrorMessage(`Could not read backup file: ${filename}`);
        setTimeout(() => setRestoreStatus(null), 3000);
        return;
      }
      setRestoreStatus('Restoring data...');
      const { restored, errors } = await restoreFromYaml(content);
      if (errors.length > 0) {
        setRestoreStatus(`Restored ${restored} rows with ${errors.length} errors`);
        setErrorMessage(`Restore completed with ${errors.length} error(s): ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`);
      } else {
        setRestoreStatus(`✓ Successfully restored ${restored} rows`);
      }
      loadTableInfo();
      if (selectedTable) loadTableData(selectedTable);
    } catch (err) {
      setRestoreStatus('Failed to restore');
      setErrorMessage(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setTimeout(() => setRestoreStatus(null), 5000);
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"? This cannot be undone.`)) return;
    try {
      const ok = await deleteBackupFile(filename);
      if (ok) {
        setBackupFiles(prev => prev.filter(f => f.name !== filename));
      } else {
        setErrorMessage(`Failed to delete backup: ${filename}`);
      }
    } catch (err) {
      setErrorMessage(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDownloadBackupFile = async (filename: string) => {
    const content = await readBackupFile(filename);
    if (!content) return;
    downloadYaml(content, filename);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString();
  };

  useEffect(() => {
    loadFiles();
    loadProjects();
    loadTableInfo();
    loadBackupFiles();
  }, []);

  // Debounce file search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset pagination/sorting/search when switching tables
  useEffect(() => {
    if (selectedTable) {
      setCurrentPage(0);
      setSortColumn(null);
      setSortDirection('asc');
      setDbSearchQuery('');
      if (selectedTable === 'calendar_events') {
        loadProjectNameCache();
      }
    }
  }, [selectedTable]);

  const loadFiles = async () => {
    setIsLoadingFiles(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      if (data) setFiles(data);
    } catch (err) {
      setErrorMessage(`Failed to load files: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, color');
      if (error) throw error;
      if (data) setProjects(data);
    } catch (err) {
      setErrorMessage(`Failed to load projects: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const loadTableInfo = async () => {
    setIsLoadingTables(true);
    setErrorMessage(null);
    try {
      const tableNames = [
        'projects',
        'tasks',
        'files',
        'activity_log',
        'calendar_events',
        'formulas',
        'saved_calculations',
        'saved_circuits'
      ];

      const tableCounts: TableInfo[] = [];

      for (const tableName of tableNames) {
        const { count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        if (error) throw error;
        tableCounts.push({
          name: tableName,
          row_count: count || 0
        });
      }

      setTables(tableCounts);
    } catch (err) {
      setErrorMessage(`Failed to load table info: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingTables(false);
    }
  };

  const loadTableData = useCallback(async (tableName: string) => {
    setIsLoadingTableData(true);
    setErrorMessage(null);
    try {
      let query = supabase
        .from(tableName)
        .select('*', { count: 'exact' });

      if (sortColumn) {
        query = query.order(sortColumn, { ascending: sortDirection === 'asc' });
      }

      const start = currentPage * pageSize;
      const end = start + pageSize - 1;
      query = query.range(start, end);

      const { data, error, count } = await query;
      if (error) throw error;
      if (data) setTableData(data as Record<string, unknown>[]);
      setTotalCount(count ?? 0);
    } catch (err) {
      setErrorMessage(`Failed to load ${tableName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingTableData(false);
    }
  }, [currentPage, pageSize, sortColumn, sortDirection]);

  // Load data when table, page, pageSize, or sort changes
  useEffect(() => {
    if (selectedTable) {
      loadTableData(selectedTable);
    }
  }, [selectedTable, loadTableData]);

  const loadProjectNameCache = async () => {
    const { data } = await supabase.from('projects').select('id, name');
    if (data) {
      const cache = new Map<string, string>();
      data.forEach((p: { id: string; name: string }) => cache.set(p.id, p.name));
      setProjectNameCache(cache);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(0); // Reset to first page on sort change
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(0); // Reset to first page on size change
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handleViewFile = async (file: StorageFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('project-files')
        .createSignedUrl(file.file_path, 300);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    } catch (err) {
      setErrorMessage(`Failed to view file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDownloadFile = async (file: StorageFile) => {
    try {
      const { data, error } = await supabase.storage
        .from('project-files')
        .download(file.file_path);
      if (error) throw error;
      if (data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setErrorMessage(`Failed to download file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDeleteFile = async (file: StorageFile) => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    try {
      // Delete from storage bucket
      const { error: storageError } = await supabase.storage
        .from('project-files')
        .remove([file.file_path]);
      if (storageError) throw storageError;

      // Delete from files table
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', file.id);
      if (dbError) throw dbError;

      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (err) {
      setErrorMessage(`Failed to delete file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    return '📄';
  };

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
    const matchesProject = selectedProject === 'all' || file.project_id === selectedProject;
    return matchesSearch && matchesProject;
  });

  // Client-side filter for database table search
  const filteredTableData = dbSearchQuery
    ? tableData.filter(row =>
        Object.values(row).some(value => {
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(dbSearchQuery.toLowerCase());
        })
      )
    : tableData;

  const groupedFiles = projects.reduce((acc, project) => {
    const projectFiles = filteredFiles.filter(f => f.project_id === project.id);
    if (projectFiles.length > 0) {
      acc[project.id] = {
        project,
        files: projectFiles
      };
    }
    return acc;
  }, {} as Record<string, { project: Project; files: StorageFile[] }>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-orange-500/20 to-amber-500/10 rounded-lg">
            <HardDrive className="w-8 h-8 text-orange-400 animate-pulse" style={{ animationDuration: '3s' }} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white/80">Storage & Database</h2>
            <p className="text-orange-400/70 text-sm">File management and database browser</p>
          </div>
        </div>
        <div className="flex space-x-2">
	          <PanelInfoDialog
            title={storageInfo.title}
            sections={storageInfo.sections}
            colorScheme={storageInfo.colorScheme}
          />
          <button
            onClick={() => setActiveView('files')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeView === 'files'
                ? 'bg-orange-500/30 text-white/90 border border-orange-400'
                : 'bg-black/30 text-white/60 border border-white/10 hover:border-orange-500/40'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Files
          </button>
          <button
            onClick={() => setActiveView('database')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeView === 'database'
                ? 'bg-orange-500/30 text-white/90 border border-orange-400'
                : 'bg-black/30 text-white/60 border border-white/10 hover:border-orange-500/40'
            }`}
          >
            <Database className="w-4 h-4 inline mr-2" />
            Database
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-center justify-between px-4 py-3 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 text-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-200 transition-colors ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {activeView === 'files' && (
        <div className="space-y-6">
          <FrameSection title="File Storage Browser" actions={
            <button
              onClick={loadFiles}
              disabled={isLoadingFiles}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              <span>{isLoadingFiles ? 'Loading...' : 'Refresh'}</span>
            </button>
          }>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-orange-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files..."
                  className="w-full pl-10 pr-4 py-2 bg-black/50 border border-orange-500/30 rounded-lg text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="px-4 py-2 bg-black/50 border border-orange-500/30 rounded-lg text-white/90 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="all">All Projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4 px-4 py-2 bg-orange-500/10 rounded-lg text-white/60 text-sm font-semibold">
                <div>File Name</div>
                <div>Project</div>
                <div>Size</div>
                <div>Uploaded</div>
              </div>

              {isLoadingFiles ? (
                <div className="text-center py-12 text-white/40">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading files...
                </div>
              ) : Object.keys(groupedFiles).length === 0 ? (
                <div className="text-center py-12 text-white/35">
                  {debouncedSearchQuery || selectedProject !== 'all'
                    ? 'No files match your filters'
                    : 'No files uploaded yet'}
                </div>
              ) : (
                Object.entries(groupedFiles).map(([projectId, { project, files: projectFiles }]) => (
                  <div key={projectId} className="space-y-2">
                    <div className="flex items-center space-x-2 px-4 py-2 bg-black/40 rounded-lg">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <h4 className="text-white/80 font-semibold">{project.name}</h4>
                      <span className="text-orange-400/60 text-sm">({projectFiles.length} files)</span>
                    </div>
                    {projectFiles.map(file => (
                      <div
                        key={file.id}
                        className="grid grid-cols-4 gap-4 items-center p-4 bg-black/30 border border-white/10 rounded-lg hover:border-orange-500/40 transition-all"
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-2xl">{getFileIcon(file.mime_type)}</span>
                          <div>
                            <p className="text-white/90 font-medium truncate">{file.name}</p>
                            <p className="text-orange-400/60 text-xs">{file.mime_type}</p>
                          </div>
                        </div>
                        <div className="text-white/60">
                          <span className="px-2 py-1 bg-orange-500/20 rounded text-sm">{project.name}</span>
                        </div>
                        <div className="text-white/60">{formatFileSize(file.size)}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/60 text-sm" title={new Date(file.uploaded_at).toLocaleString()}>
                            {formatRelativeTime(file.uploaded_at)}
                          </span>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleViewFile(file)}
                              className="p-2 hover:bg-orange-500/20 rounded transition-all"
                              title="View"
                              aria-label={`View ${file.name}`}
                            >
                              <Eye className="w-4 h-4 text-orange-400" />
                            </button>
                            <button
                              onClick={() => handleDownloadFile(file)}
                              className="p-2 hover:bg-orange-500/20 rounded transition-all"
                              title="Download"
                              aria-label={`Download ${file.name}`}
                            >
                              <Download className="w-4 h-4 text-orange-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteFile(file)}
                              className="p-2 hover:bg-red-500/20 rounded transition-all"
                              title="Delete"
                              aria-label={`Delete ${file.name}`}
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </FrameSection>

          {/* Backup Files Section */}
          <FrameSection title="YAML Backups" subtitle={`${backupFiles.length} files`} actions={
            <div className="flex space-x-2">
              <button
                onClick={loadBackupFiles}
                className="flex items-center space-x-1 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 text-sm transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
              <button
                onClick={handleBackup}
                disabled={backupStatus === 'running'}
                className="flex items-center space-x-1 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-100 text-sm transition-all disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{backupStatus === 'running' ? 'Saving...' : 'New Backup'}</span>
              </button>
            </div>
          }>

            {restoreStatus && (
              <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
                restoreStatus.startsWith('✓') ? 'bg-green-500/20 text-green-300 border border-green-500/30' :
                restoreStatus.includes('error') || restoreStatus.includes('Failed') ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              }`}>
                {restoreStatus}
              </div>
            )}
            {backupStatus === 'done' && (
              <div className="mb-4 px-4 py-2 rounded-lg text-sm bg-green-500/20 text-green-300 border border-green-500/30">
                ✓ Backup saved to backups/ folder
              </div>
            )}
            {backupStatus === 'error' && (
              <div className="mb-4 px-4 py-2 rounded-lg text-sm bg-red-500/20 text-red-300 border border-red-500/30">
                ✗ Backup failed — check console for details
              </div>
            )}

            {loadingBackups ? (
              <div className="text-center py-8 text-white/40">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                Loading backups...
              </div>
            ) : backupFiles.length === 0 ? (
              <div className="text-center py-8 text-white/35">
                <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No backup files yet</p>
                <p className="text-xs mt-1">Click "New Backup" to create your first backup</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-4 px-4 py-2 bg-orange-500/10 rounded-lg text-white/60 text-sm font-semibold">
                  <div>Backup File</div>
                  <div>Size</div>
                  <div>Created</div>
                  <div className="text-right">Actions</div>
                </div>
                {backupFiles.map(file => (
                  <div
                    key={file.name}
                    className="grid grid-cols-4 gap-4 items-center p-4 bg-black/30 border border-white/10 rounded-lg hover:border-orange-500/40 transition-all"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">📋</span>
                      <div>
                        <p className="text-white/90 font-medium text-sm truncate" title={file.name}>{file.name}</p>
                        <p className="text-orange-400/60 text-xs">Full database backup</p>
                      </div>
                    </div>
                    <div className="text-white/60 text-sm">{formatFileSize(file.size)}</div>
                    <div className="text-white/60 text-sm" title={new Date(file.modified).toLocaleString()}>
                      {formatRelativeTime(file.modified)}
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleDownloadBackupFile(file.name)}
                        className="p-2 hover:bg-orange-500/20 rounded transition-all"
                        title="Download to browser"
                      >
                        <Download className="w-4 h-4 text-orange-400" />
                      </button>
                      <button
                        onClick={() => handleRestoreFromBackup(file.name)}
                        className="p-2 hover:bg-green-500/20 rounded transition-all"
                        title="Restore this backup"
                      >
                        <Upload className="w-4 h-4 text-green-400" />
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(file.name)}
                        className="p-2 hover:bg-red-500/20 rounded transition-all"
                        title="Delete this backup"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FrameSection>
        </div>
      )}

      {activeView === 'database' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <FrameSection title="Tables" actions={
                <button
                  onClick={loadTableInfo}
                  disabled={isLoadingTables}
                  className="p-2 hover:bg-orange-500/20 rounded transition-all disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 text-orange-400 ${isLoadingTables ? 'animate-spin' : ''}`} />
                </button>
              }>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {isLoadingTables ? (
                  <div className="text-center py-8 text-white/40">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading tables...
                  </div>
                ) : tables.map(table => (
                  <button
                    key={table.name}
                    onClick={() => setSelectedTable(table.name)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedTable === table.name
                        ? 'bg-orange-500/20 border border-orange-500'
                        : 'bg-black/30 border border-white/10 hover:border-orange-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white/90 font-medium">{table.name}</span>
                      <span className="text-orange-400/60 text-sm">{table.row_count} rows</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-orange-500/30">
                <button
                  onClick={() => setShowDbInfo(!showDbInfo)}
                  className="w-full flex items-center justify-between p-3 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all"
                >
                  <div className="flex items-center space-x-2">
                    <Info className="w-4 h-4" />
                    <span>Database Info</span>
                  </div>
                  <span>{showDbInfo ? '▼' : '▶'}</span>
                </button>
              </div>

              <div className="mt-4">
                <div className="bg-black/30 border border-orange-500/30 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <Shield className="w-5 h-5 text-orange-400" />
                    <h4 className="font-semibold text-white/80">Backup</h4>
                  </div>

                  {lastBackup && (
                    <p className="text-xs text-orange-400/60 mb-3">
                      Last: {new Date(lastBackup).toLocaleString()}
                    </p>
                  )}

                  <div className="space-y-2">
                    <button
                      onClick={handleBackup}
                      disabled={backupStatus === 'running'}
                      className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>{backupStatus === 'running' ? 'Backing up...' : 'Download Backup'}</span>
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".yaml,.yml"
                      onChange={handleRestore}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 transition-all"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Restore from File</span>
                    </button>
                  </div>

                  {restoreStatus && (
                    <p className="text-xs text-green-400 mt-3">{restoreStatus}</p>
                  )}
                  {backupStatus === 'done' && (
                    <p className="text-xs text-green-400 mt-3">✓ Backup downloaded</p>
                  )}
                  {backupStatus === 'error' && (
                    <p className="text-xs text-red-400 mt-3">✗ Backup failed</p>
                  )}
                </div>
              </div>
              </FrameSection>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {!showDbInfo && selectedTable && (
                <FrameSection title={`Table: ${selectedTable}`} actions={
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-orange-400/60 text-sm">Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        className="px-2 py-1 bg-black/50 border border-orange-500/30 rounded text-white/90 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                      >
                        {[25, 50, 100, 500].map(size => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                    <span className="text-orange-400/60 text-sm">
                      {isLoadingTableData ? 'Loading...' : `${totalCount} total rows`}
                    </span>
                  </div>
                }>

                  {/* Database table search */}
                  {tableData.length > 0 && !isLoadingTableData && (
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-orange-400/60" />
                        <input
                          type="text"
                          value={dbSearchQuery}
                          onChange={(e) => setDbSearchQuery(e.target.value)}
                          placeholder="Search table data..."
                          className="w-full pl-10 pr-4 py-2 bg-black/50 border border-orange-500/30 rounded-lg text-white/90 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </div>
                      {dbSearchQuery && (
                        <div className="text-orange-400/60 text-xs mt-1">
                          {filteredTableData.length} of {tableData.length} rows match
                        </div>
                      )}
                    </div>
                  )}

                  {isLoadingTableData ? (
                    <div className="text-center py-12 text-white/40">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading table data...
                    </div>
                  ) : tableData.length === 0 ? (
                    <div className="text-center py-12 text-white/35">
                      No data in this table
                    </div>
                  ) : filteredTableData.length === 0 ? (
                    <div className="text-center py-12 text-white/35">
                      No rows match &ldquo;{dbSearchQuery}&rdquo;
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        {(() => {
                          // Hide columns that are null across every row
                          const allKeys = Object.keys(filteredTableData[0]);
                          const visibleKeys = allKeys.filter(key =>
                            filteredTableData.some(row => (row as Record<string, unknown>)[key] !== null)
                          );
                          return (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-orange-500/10 border-b border-orange-500/30">
                                  {visibleKeys.map(key => (
                                    <th
                                      key={key}
                                      className="px-4 py-3 text-left text-white/60 font-semibold cursor-pointer hover:bg-orange-500/20 transition-colors select-none"
                                      onClick={() => handleSort(key)}
                                    >
                                      <div className="flex items-center space-x-1">
                                        <span>{key}</span>
                                        {sortColumn === key ? (
                                          sortDirection === 'asc' ? (
                                            <ArrowUp className="w-3 h-3 text-orange-400" />
                                          ) : (
                                            <ArrowDown className="w-3 h-3 text-orange-400" />
                                          )
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-orange-500/40" />
                                        )}
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {filteredTableData.map((row, idx) => (
                                  <tr
                                    key={idx}
                                    className="border-b border-white/\[0.06\] hover:bg-orange-500/5 transition-colors"
                                  >
                                    {visibleKeys.map((key, cellIdx) => {
                                      const value = (row as Record<string, unknown>)[key];
                                      return (
                                        <td key={cellIdx} className="px-4 py-3 text-white/80">
                                          {key === 'project_id' && selectedTable === 'calendar_events' && typeof value === 'string' && projectNameCache.has(value) ? (
                                            <span className="text-orange-400" title={String(value)}>
                                              {projectNameCache.get(value)}
                                            </span>
                                          ) : value === null ? (
                                            <span className="text-orange-400/40 italic">null</span>
                                          ) : typeof value === 'boolean' ? (
                                            <span className={value ? 'text-green-400' : 'text-red-400'}>
                                              {String(value)}
                                            </span>
                                          ) : typeof value === 'object' ? (
                                            <span className="text-orange-400/60">{JSON.stringify(value)}</span>
                                          ) : (
                                            <span className="truncate max-w-xs inline-block">
                                              {String(value)}
                                            </span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>

                      {/* Pagination Controls */}
                      {totalCount > pageSize && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                          <div className="text-orange-400/60 text-sm">
                            Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount}
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                              disabled={currentPage === 0 || isLoadingTableData}
                              className="flex items-center space-x-1 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-4 h-4" />
                              <span>Prev</span>
                            </button>
                            <span className="text-white/60 text-sm px-2">
                              Page {currentPage + 1} of {totalPages}
                            </span>
                            <button
                              onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                              disabled={currentPage >= totalPages - 1 || isLoadingTableData}
                              className="flex items-center space-x-1 px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-white/90 text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <span>Next</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </FrameSection>
              )}

              {!showDbInfo && !selectedTable && (
                <FrameSection>
                  <div className="flex flex-col items-center justify-center py-6">
                    <Database className="w-16 h-16 text-orange-400/50 mb-4" />
                    <p className="text-white/50 text-lg">Select a table to view data</p>
                  </div>
                </FrameSection>
              )}

              {showDbInfo && (
                <div className="space-y-6">
                  <FrameSection title="Database Connection">
                    <div className="space-y-3 text-white/60">
                      <div className="flex items-start space-x-3">
                        <Key className="w-5 h-5 text-orange-400 mt-0.5" />
                        <div>
                          <p className="font-semibold text-white/80">Connection Details</p>
                          <p className="text-sm text-orange-400/80 mt-1">
                            Your Supabase database is automatically configured and ready to use.
                          </p>
                        </div>
                      </div>
                      <div className="bg-black/40 rounded-lg p-4 mt-4">
                        <p className="text-xs text-orange-400/60 mb-2">Environment Variables (pre-configured):</p>
                        <div className="space-y-2 font-mono text-sm">
                          <div className="flex justify-between">
                            <span className="text-white/60">VITE_SUPABASE_URL</span>
                            <span className="text-green-400">✓ Set</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/60">VITE_SUPABASE_ANON_KEY</span>
                            <span className="text-green-400">✓ Set</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </FrameSection>

                  <FrameSection title="Database Schema">
                    <div className="space-y-4 text-white/60 text-sm">
                      <div>
                        <p className="font-semibold text-white/80 mb-2">Core Tables:</p>
                        <ul className="space-y-2 ml-4">
                          <li><span className="text-orange-400 font-mono">projects</span> - Project management data</li>
                          <li><span className="text-orange-400 font-mono">tasks</span> - Tasks and subtasks with hierarchy</li>
                          <li><span className="text-orange-400 font-mono">files</span> - File metadata and storage paths</li>
                          <li><span className="text-orange-400 font-mono">calendar_events</span> - Task deadlines and events</li>
                          <li><span className="text-orange-400 font-mono">activity_log</span> - User activity tracking</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-white/80 mb-2">Engineering Tables:</p>
                        <ul className="space-y-2 ml-4">
                          <li><span className="text-orange-400 font-mono">formulas</span> - Engineering formulas library</li>
                          <li><span className="text-orange-400 font-mono">saved_calculations</span> - User calculation history</li>
                          <li><span className="text-orange-400 font-mono">saved_circuits</span> - Circuit designs</li>
                        </ul>
                      </div>
                    </div>
                  </FrameSection>

                  <FrameSection title="How to Update Database">
                    <div className="space-y-4 text-white/60 text-sm">
                      <div>
                        <p className="font-semibold text-white/80 mb-2">Using Migrations:</p>
                        <ol className="space-y-2 ml-4 list-decimal">
                          <li>All database changes should be done through migrations</li>
                          <li>Migrations are stored in <span className="font-mono bg-black/40 px-2 py-0.5 rounded">supabase/migrations/</span></li>
                          <li>Each migration file has a timestamp and descriptive name</li>
                          <li>Migrations run automatically and maintain database history</li>
                        </ol>
                      </div>
                      <div>
                        <p className="font-semibold text-white/80 mb-2">Security (RLS):</p>
                        <ul className="space-y-2 ml-4 list-disc">
                          <li>All tables have Row Level Security (RLS) enabled</li>
                          <li>Policies control who can read/write data</li>
                          <li>Authentication is handled by Supabase Auth</li>
                          <li>Users can only access their own data</li>
                        </ul>
                      </div>
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 mt-4">
                        <p className="text-white/80 font-semibold mb-2">⚠️ Important Notes:</p>
                        <ul className="space-y-1 ml-4 list-disc text-white/50">
                          <li>Never commit database credentials to version control</li>
                          <li>Always use migrations for schema changes</li>
                          <li>Test RLS policies before deploying</li>
                          <li>Keep backups of production data</li>
                        </ul>
                      </div>
                    </div>
                  </FrameSection>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
