import { getUrgencyTextColor, getUrgencyLevel } from '../calendar/urgencyUtils';

export const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const formatDeadline = (deadline: string | null) => {
  if (!deadline) return 'No deadline';
  const date = new Date(deadline);
  const daysUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return `Overdue by ${Math.abs(daysUntil)} days`;
  if (daysUntil === 0) return 'Due today';
  if (daysUntil === 1) return 'Due tomorrow';
  return `${daysUntil} days remaining`;
};

export const formatDateOnly = (isoOrDateLike: string) => {
  const [y, m, d] = isoOrDateLike.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateString = (year: number, month: number, day: number) => {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const getUrgencyColor = (deadline: string | null) => getUrgencyTextColor(deadline);
export const getTaskUrgencyColor = (dateStr: string) => getUrgencyTextColor(dateStr);

export const PROJECT_CATEGORIES = [
  { key: 'Coding', color: '#22c55e' },
  { key: 'Substation', color: '#38bdf8' },
  { key: 'QAQC', color: '#ec4899' },
  { key: 'School', color: '#f59e0b' },
] as const;

export const getCategoryColor = (category: string | null): string => {
  const cat = PROJECT_CATEGORIES.find(c => c.key === category);
  return cat ? cat.color : '#a855f7'; // default purple
};