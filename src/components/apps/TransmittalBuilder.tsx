import { useState, useEffect } from 'react';
import { FileText, Plus, Send, Trash2, Eye, Download, CheckCircle, Clock, XCircle } from 'lucide-react';

interface Transmittal {
  id: string;
  transmittal_number: string;
  project_name: string;
  project_number: string;
  to_company: string;
  to_attention: string;
  from_company: string;
  from_sender: string;
  subject: string;
  date: string;
  documents: TransmittalDocument[];
  notes: string;
  status: 'draft' | 'sent' | 'received';
  created_at: string;
}

interface TransmittalDocument {
  id: string;
  title: string;
  drawing_number: string;
  revision: string;
  sheets: number;
  copies: number;
  format: 'dwg' | 'pdf' | 'both';
}

export function TransmittalBuilder() {
  const [transmittals, setTransmittals] = useState<Transmittal[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedTransmittal, setSelectedTransmittal] = useState<Transmittal | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    transmittal_number: '',
    project_name: '',
    project_number: '',
    to_company: '',
    to_attention: '',
    from_company: 'Your Engineering Firm',
    from_sender: '',
    subject: '',
    notes: '',
  });

  const [documents, setDocuments] = useState<TransmittalDocument[]>([]);
  const [docForm, setDocForm] = useState({
    title: '',
    drawing_number: '',
    revision: '',
    sheets: 1,
    copies: 1,
    format: 'pdf' as const,
  });

  useEffect(() => {
    loadTransmittals();
  }, []);

  const loadTransmittals = async () => {
    setLoading(true);
    // Mock data for demonstration
    const mockData: Transmittal[] = [
      {
        id: '1',
        transmittal_number: 'TR-2025-001',
        project_name: 'Substation Upgrade Project',
        project_number: 'P-12345',
        to_company: 'ABC Construction',
        to_attention: 'John Smith',
        from_company: 'Your Engineering Firm',
        from_sender: 'Jane Doe, PE',
        subject: 'Electrical Drawings - Phase 1',
        date: new Date().toISOString(),
        documents: [
          {
            id: '1',
            title: 'Single Line Diagram',
            drawing_number: 'E-001',
            revision: 'A',
            sheets: 1,
            copies: 3,
            format: 'pdf',
          },
          {
            id: '2',
            title: 'Panel Schedules',
            drawing_number: 'E-002',
            revision: 'B',
            sheets: 2,
            copies: 3,
            format: 'pdf',
          },
        ],
        notes: 'Please review and provide comments by end of week.',
        status: 'sent',
        created_at: new Date().toISOString(),
      },
    ];
    setTransmittals(mockData);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newTransmittal: Transmittal = {
      id: Date.now().toString(),
      ...form,
      date: new Date().toISOString(),
      documents: documents,
      status: 'draft',
      created_at: new Date().toISOString(),
    };

    setTransmittals([newTransmittal, ...transmittals]);
    resetForm();
    setShowModal(false);
  };

  const addDocument = () => {
    if (!docForm.title || !docForm.drawing_number) return;

    const newDoc: TransmittalDocument = {
      id: Date.now().toString(),
      ...docForm,
    };

    setDocuments([...documents, newDoc]);
    setDocForm({
      title: '',
      drawing_number: '',
      revision: '',
      sheets: 1,
      copies: 1,
      format: 'pdf',
    });
  };

  const removeDocument = (id: string) => {
    setDocuments(documents.filter(d => d.id !== id));
  };

  const resetForm = () => {
    setForm({
      transmittal_number: '',
      project_name: '',
      project_number: '',
      to_company: '',
      to_attention: '',
      from_company: 'Your Engineering Firm',
      from_sender: '',
      subject: '',
      notes: '',
    });
    setDocuments([]);
  };

  const sendTransmittal = (id: string) => {
    setTransmittals(transmittals.map(t =>
      t.id === id ? { ...t, status: 'sent' as const, date: new Date().toISOString() } : t
    ));
  };

  const deleteTransmittal = (id: string) => {
    if (confirm('Delete this transmittal?')) {
      setTransmittals(transmittals.filter(t => t.id !== id));
      if (selectedTransmittal?.id === id) {
        setSelectedTransmittal(null);
      }
    }
  };

  const filteredTransmittals = transmittals.filter(t =>
    filterStatus === 'all' || t.status === filterStatus
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <Send className="w-4 h-4 text-green-400" />;
      case 'received': return <CheckCircle className="w-4 h-4 text-blue-400" />;
      default: return <Clock className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent': return 'from-green-500/20 to-emerald-500/20 border-green-500/40';
      case 'received': return 'from-blue-500/20 to-cyan-500/20 border-blue-500/40';
      default: return 'from-yellow-500/20 to-orange-500/20 border-yellow-500/40';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
            <FileText className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-blue-200">Transmittal Builder</h2>
            <p className="text-blue-400/70">Create professional transmittal documents</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-blue-500/30 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span>New Transmittal</span>
        </button>
      </div>

      <div className="bg-black/30 backdrop-blur-md border border-blue-500/30 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterStatus === 'all'
                  ? 'bg-blue-500/30 border border-blue-500/50 text-blue-100'
                  : 'bg-black/30 border border-blue-500/20 text-blue-300 hover:bg-blue-500/10'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus('draft')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterStatus === 'draft'
                  ? 'bg-blue-500/30 border border-blue-500/50 text-blue-100'
                  : 'bg-black/30 border border-blue-500/20 text-blue-300 hover:bg-blue-500/10'
              }`}
            >
              Draft
            </button>
            <button
              onClick={() => setFilterStatus('sent')}
              className={`px-4 py-2 rounded-lg transition-all ${
                filterStatus === 'sent'
                  ? 'bg-blue-500/30 border border-blue-500/50 text-blue-100'
                  : 'bg-black/30 border border-blue-500/20 text-blue-300 hover:bg-blue-500/10'
              }`}
            >
              Sent
            </button>
          </div>

          <div className="text-sm text-blue-300">
            Total: {transmittals.length} | Draft: {transmittals.filter(t => t.status === 'draft').length} | Sent: {transmittals.filter(t => t.status === 'sent').length}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-blue-300 py-12">Loading transmittals...</div>
      ) : filteredTransmittals.length === 0 ? (
        <div className="text-center text-blue-300/70 py-12">
          <FileText className="w-16 h-16 mx-auto mb-4 text-blue-400/30" />
          {filterStatus !== 'all'
            ? 'No transmittals match your filter'
            : 'No transmittals yet. Create your first transmittal!'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTransmittals.map(transmittal => (
            <div
              key={transmittal.id}
              className={`bg-gradient-to-br ${getStatusColor(transmittal.status)} backdrop-blur-md border rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer`}
              onClick={() => setSelectedTransmittal(transmittal)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(transmittal.status)}
                    <h3 className="text-lg font-bold text-blue-100">{transmittal.transmittal_number}</h3>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full border capitalize ${
                    transmittal.status === 'sent' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                    transmittal.status === 'received' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                    'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                  }`}>
                    {transmittal.status}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-blue-300/70">Project:</p>
                    <p className="text-blue-100 font-semibold">{transmittal.project_name}</p>
                  </div>

                  <div>
                    <p className="text-blue-300/70">To:</p>
                    <p className="text-blue-100">{transmittal.to_company}</p>
                    <p className="text-blue-300/60 text-xs">Attn: {transmittal.to_attention}</p>
                  </div>

                  <div>
                    <p className="text-blue-300/70">Subject:</p>
                    <p className="text-blue-100 line-clamp-2">{transmittal.subject}</p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-blue-500/20">
                    <span className="text-blue-300/60">{transmittal.documents.length} documents</span>
                    <span className="text-blue-300/60">{new Date(transmittal.date).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTransmittal(transmittal);
                    }}
                    className="flex-1 flex items-center justify-center space-x-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-100 px-3 py-2 rounded-lg transition-all text-sm"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View</span>
                  </button>
                  {transmittal.status === 'draft' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sendTransmittal(transmittal.id);
                      }}
                      className="px-3 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-100 rounded-lg transition-all text-sm"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTransmittal(transmittal.id);
                    }}
                    className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 rounded-lg transition-all text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-auto">
          <div className="bg-[#0a0a0a] backdrop-blur-xl border border-blue-500/30 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-6 border-b border-blue-500/30 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
              <h3 className="text-2xl font-bold text-blue-200">Create Transmittal</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
              >
                <span className="text-red-400 text-2xl">×</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-blue-300 text-sm font-medium mb-2">Transmittal Number *</label>
                  <input
                    type="text"
                    value={form.transmittal_number}
                    onChange={(e) => setForm({ ...form, transmittal_number: e.target.value })}
                    required
                    className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="TR-2025-001"
                  />
                </div>

                <div>
                  <label className="block text-blue-300 text-sm font-medium mb-2">From (Sender) *</label>
                  <input
                    type="text"
                    value={form.from_sender}
                    onChange={(e) => setForm({ ...form, from_sender: e.target.value })}
                    required
                    className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Jane Doe, PE"
                  />
                </div>

                <div>
                  <label className="block text-blue-300 text-sm font-medium mb-2">Project Name *</label>
                  <input
                    type="text"
                    value={form.project_name}
                    onChange={(e) => setForm({ ...form, project_name: e.target.value })}
                    required
                    className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Substation Upgrade Project"
                  />
                </div>

                <div>
                  <label className="block text-blue-300 text-sm font-medium mb-2">Project Number</label>
                  <input
                    type="text"
                    value={form.project_number}
                    onChange={(e) => setForm({ ...form, project_number: e.target.value })}
                    className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="P-12345"
                  />
                </div>

                <div>
                  <label className="block text-blue-300 text-sm font-medium mb-2">To (Company) *</label>
                  <input
                    type="text"
                    value={form.to_company}
                    onChange={(e) => setForm({ ...form, to_company: e.target.value })}
                    required
                    className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ABC Construction"
                  />
                </div>

                <div>
                  <label className="block text-blue-300 text-sm font-medium mb-2">Attention *</label>
                  <input
                    type="text"
                    value={form.to_attention}
                    onChange={(e) => setForm({ ...form, to_attention: e.target.value })}
                    required
                    className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="John Smith"
                  />
                </div>
              </div>

              <div>
                <label className="block text-blue-300 text-sm font-medium mb-2">Subject *</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  required
                  className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Electrical Drawings - Phase 1"
                />
              </div>

              <div>
                <label className="block text-blue-300 text-sm font-medium mb-2">Documents</label>
                <div className="bg-black/30 border border-blue-500/30 rounded-lg p-4 space-y-3">
                  <div className="grid grid-cols-6 gap-2">
                    <input
                      type="text"
                      value={docForm.title}
                      onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                      className="col-span-2 bg-black/50 border border-blue-500/30 rounded px-3 py-2 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Drawing Title"
                    />
                    <input
                      type="text"
                      value={docForm.drawing_number}
                      onChange={(e) => setDocForm({ ...docForm, drawing_number: e.target.value })}
                      className="bg-black/50 border border-blue-500/30 rounded px-3 py-2 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="E-001"
                    />
                    <input
                      type="text"
                      value={docForm.revision}
                      onChange={(e) => setDocForm({ ...docForm, revision: e.target.value })}
                      className="bg-black/50 border border-blue-500/30 rounded px-3 py-2 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Rev"
                    />
                    <input
                      type="number"
                      value={docForm.sheets}
                      onChange={(e) => setDocForm({ ...docForm, sheets: parseInt(e.target.value) || 1 })}
                      className="bg-black/50 border border-blue-500/30 rounded px-3 py-2 text-blue-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Sheets"
                      min="1"
                    />
                    <button
                      type="button"
                      onClick={addDocument}
                      className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-100 rounded px-3 py-2 transition-all"
                    >
                      <Plus className="w-4 h-4 mx-auto" />
                    </button>
                  </div>

                  {documents.length > 0 && (
                    <div className="space-y-2">
                      {documents.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded px-3 py-2">
                          <div className="flex-1 grid grid-cols-4 gap-2 text-sm text-blue-100">
                            <span>{doc.title}</span>
                            <span>{doc.drawing_number} Rev {doc.revision}</span>
                            <span>{doc.sheets} sheet(s)</span>
                            <span className="uppercase">{doc.format}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDocument(doc.id)}
                            className="text-red-400 hover:text-red-300 ml-2"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-blue-300 text-sm font-medium mb-2">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full bg-black/50 border border-blue-500/30 rounded-lg px-4 py-2 text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                  placeholder="Additional notes or instructions..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-semibold px-6 py-3 rounded-lg transition-all"
                >
                  Create Transmittal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="bg-black/50 border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 px-6 py-3 rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedTransmittal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-auto">
          <div className="bg-[#0a0a0a] backdrop-blur-xl border border-blue-500/30 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-6 border-b border-blue-500/30 sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
              <div className="flex items-center space-x-3">
                {getStatusIcon(selectedTransmittal.status)}
                <div>
                  <h3 className="text-2xl font-bold text-blue-200">{selectedTransmittal.transmittal_number}</h3>
                  <p className="text-blue-400/70 text-sm">{selectedTransmittal.project_name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTransmittal(null)}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
              >
                <span className="text-red-400 text-2xl">×</span>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-lg font-bold text-blue-200">From</h4>
                  <div className="bg-black/30 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-blue-100 font-semibold">{selectedTransmittal.from_company}</p>
                    <p className="text-blue-300/70">{selectedTransmittal.from_sender}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-lg font-bold text-blue-200">To</h4>
                  <div className="bg-black/30 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-blue-100 font-semibold">{selectedTransmittal.to_company}</p>
                    <p className="text-blue-300/70">Attn: {selectedTransmittal.to_attention}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-lg font-bold text-blue-200 mb-2">Subject</h4>
                <p className="text-blue-100 bg-black/30 border border-blue-500/30 rounded-lg p-4">{selectedTransmittal.subject}</p>
              </div>

              <div>
                <h4 className="text-lg font-bold text-blue-200 mb-2">Documents ({selectedTransmittal.documents.length})</h4>
                <div className="space-y-2">
                  {selectedTransmittal.documents.map(doc => (
                    <div key={doc.id} className="bg-black/30 border border-blue-500/30 rounded-lg p-4 grid grid-cols-5 gap-4 text-sm">
                      <div className="col-span-2">
                        <p className="text-blue-300/70 text-xs mb-1">Title</p>
                        <p className="text-blue-100 font-semibold">{doc.title}</p>
                      </div>
                      <div>
                        <p className="text-blue-300/70 text-xs mb-1">Drawing #</p>
                        <p className="text-blue-100">{doc.drawing_number}</p>
                      </div>
                      <div>
                        <p className="text-blue-300/70 text-xs mb-1">Revision</p>
                        <p className="text-blue-100">{doc.revision}</p>
                      </div>
                      <div>
                        <p className="text-blue-300/70 text-xs mb-1">Sheets / Format</p>
                        <p className="text-blue-100">{doc.sheets} / {doc.format.toUpperCase()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedTransmittal.notes && (
                <div>
                  <h4 className="text-lg font-bold text-blue-200 mb-2">Notes</h4>
                  <p className="text-blue-100 bg-black/30 border border-blue-500/30 rounded-lg p-4 whitespace-pre-wrap">{selectedTransmittal.notes}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-100 px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2">
                  <Download className="w-5 h-5" />
                  <span>Download PDF</span>
                </button>
                {selectedTransmittal.status === 'draft' && (
                  <button
                    onClick={() => {
                      sendTransmittal(selectedTransmittal.id);
                      setSelectedTransmittal(null);
                    }}
                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg transition-all flex items-center space-x-2"
                  >
                    <Send className="w-5 h-5" />
                    <span>Send</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
