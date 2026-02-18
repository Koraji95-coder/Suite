import { Memory } from './aitypes';

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const getMemoryTypeColor = (type: string): string => {
  switch (type) {
    case 'preference': return '#10b981';
    case 'knowledge': return '#3b82f6';
    case 'pattern': return '#f59e0b';
    case 'relationship': return '#ec4899';
    default: return '#6b7280';
  }
};

export const getMemoryTypeBgClass = (type: string): string => {
  switch (type) {
    case 'preference': return 'bg-green-500/20 border-green-500/40 text-green-300';
    case 'knowledge': return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
    case 'pattern': return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300';
    case 'relationship': return 'bg-pink-500/20 border-pink-500/40 text-pink-300';
    default: return 'bg-gray-500/20 border-gray-500/40 text-gray-300';
  }
};

export const getResultColor = (result: 'pass' | 'fail' | 'warning'): string => {
  switch (result) {
    case 'pass': return 'from-green-500/20 to-emerald-500/20 border-green-500/40';
    case 'fail': return 'from-red-500/20 to-rose-500/20 border-red-500/40';
    case 'warning': return 'from-yellow-500/20 to-orange-500/20 border-yellow-500/40';
    default: return 'from-gray-500/20 to-slate-500/20 border-gray-500/40';
  }
};

export const getResultIcon = (result: string) => {
  // Icons are imported in components, so just return a string key
  return result;
};