import { useState } from 'react';
import { Upload, FileText, Loader } from 'lucide-react';
import { UploadedDocument } from '../aitypes';
import { formatDate } from '../aiutils';

interface DocumentAnalyzerProps {
  documents: UploadedDocument[];
  onUpload: (file: File) => Promise<void>;
  loading: boolean;
}

export function DocumentAnalyzer({ documents, onUpload, loading }: DocumentAnalyzerProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="space-y-4">
      <label className="block w-full p-8 border-2 border-dashed border-orange-500/30 rounded-lg cursor-pointer hover:border-orange-500/50 transition-all text-center">
        <Upload className="w-12 h-12 mx-auto mb-3 text-orange-400" />
        <p className="text-white font-semibold mb-1">Upload PDF Document</p>
        <p className="text-gray-400 text-sm">Standards, datasheets, specifications, etc.</p>
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="hidden"
          disabled={loading}
        />
      </label>

      {loading && (
        <div className="flex items-center justify-center space-x-2 text-orange-300 py-4">
          <Loader className="w-5 h-5 animate-spin" />
          <span>Processing document...</span>
        </div>
      )}

      {documents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-white">Uploaded Documents</h4>
          {documents.map(doc => (
            <div key={doc.id} className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-orange-400" />
                  <span className="text-white font-semibold">{doc.name}</span>
                </div>
                <span className={`text-xs px-2 py-1 ${
                  doc.status === 'processed' ? 'bg-green-500/20 text-green-300' :
                  doc.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                  'bg-yellow-500/20 text-yellow-300'
                } rounded-full border border-current`}>
                  {doc.status}
                </span>
              </div>
              <div className="flex items-center space-x-4 text-sm text-gray-400 mb-2">
                <span>{doc.size}</span>
                <span>{doc.pages} pages</span>
                <span>{formatDate(doc.uploadedAt)}</span>
              </div>
              {doc.summary && <p className="text-sm text-gray-300">{doc.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}