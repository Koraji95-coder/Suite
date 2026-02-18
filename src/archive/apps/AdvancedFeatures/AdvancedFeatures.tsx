import { useState } from 'react';
import { Brain, FileCheck, Zap, Search, FileText, Calculator } from 'lucide-react';
import {
  ComplianceCheck,
  CircuitDesign,
  ComponentSpec,
  Calculation,
  UploadedDocument,
} from '../aitypes';
import { ComplianceChecker } from './ComplianceChecker';
import { CircuitDesigner } from './CircuitDesigner';
import { ComponentLookup } from './ComponentLookup';
import { DocumentAnalyzer } from './DocumentAnalyzer';
import { CalculationAssistant } from './CalculationAssistant';

type AIMode = 'compliance' | 'circuit' | 'components' | 'documents' | 'calculations';

export function AdvancedAIFeatures() {
  const [activeMode, setActiveMode] = useState<AIMode>('compliance');
  const [loading, setLoading] = useState(false);
  const [complianceResults, setComplianceResults] = useState<ComplianceCheck[]>([]);
  const [circuitDesigns, setCircuitDesigns] = useState<CircuitDesign[]>([]);
  const [componentSpecs, setComponentSpecs] = useState<ComponentSpec[]>([]);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [calculations, setCalculations] = useState<Calculation[]>([]);

  const modes = [
    {
      id: 'compliance' as const,
      label: 'Code Compliance',
      icon: <FileCheck className="w-5 h-5" />,
      description: 'Check designs against NEC/IEEE standards',
      color: 'green',
    },
    {
      id: 'circuit' as const,
      label: 'Circuit Designer',
      icon: <Zap className="w-5 h-5" />,
      description: 'Design circuits with natural language',
      color: 'yellow',
    },
    {
      id: 'components' as const,
      label: 'Component Lookup',
      icon: <Search className="w-5 h-5" />,
      description: 'Find component specifications',
      color: 'blue',
    },
    {
      id: 'documents' as const,
      label: 'Document Analysis',
      icon: <FileText className="w-5 h-5" />,
      description: 'Ingest and query PDFs',
      color: 'purple',
    },
    {
      id: 'calculations' as const,
      label: 'Advanced Calculations',
      icon: <Calculator className="w-5 h-5" />,
      description: 'Complex EE calculations with AI',
      color: 'orange',
    },
  ];

  // Mock API calls (replace with actual AI service calls)
  const handleComplianceCheck = async (input: string) => {
    setLoading(true);
    // Simulate API
    setTimeout(() => {
      const mockResults: ComplianceCheck[] = [
        {
          id: '1',
          title: 'NEC 210.19(A) - Conductor Sizing',
          description: 'Branch circuit conductors must have an ampacity not less than the maximum load',
          standard: 'NEC 2023',
          result: 'pass',
          details: 'Circuit uses 12 AWG copper conductors rated for 20A with a calculated load of 16A. Compliant.',
        },
        // ... more
      ];
      setComplianceResults(mockResults);
      setLoading(false);
    }, 2000);
  };

  const handleCircuitDesign = async (input: string) => {
    setLoading(true);
    setTimeout(() => {
      const mockDesign: CircuitDesign = {
        id: Date.now().toString(),
        description: input,
        components: [
          '3-Phase 480V Transformer (150 kVA)',
          'Main Circuit Breaker (200A, 3-pole)',
          'Ground Fault Relay (SEL-751)',
          'CT Ratio 200:5',
          'Panel A - 42 circuit panel',
        ],
        schematic: `Single Line Diagram:\n   Utility 480V, 3Ø\n        │\n    [CT 200:5]\n        │\n   [Main CB 200A]\n        │\n   [GF Relay]\n        │\n   [Transformer]\n        │\n   [Panel A]`,
        notes: 'Design includes ground fault protection per NEC 230.95.',
      };
      setCircuitDesigns([mockDesign, ...circuitDesigns]);
      setLoading(false);
    }, 2000);
  };

  const handleComponentLookup = async (input: string) => {
    setLoading(true);
    setTimeout(() => {
      const mockSpecs: ComponentSpec[] = [
        {
          id: '1',
          name: 'Circuit Breaker',
          manufacturer: 'Square D',
          partNumber: 'QO320',
          specs: {
            'Voltage': '240V',
            'Current': '20A',
            'Poles': '3',
            'Type': 'Plug-On',
            'Interrupt Rating': '10kA',
          },
        },
      ];
      setComponentSpecs(mockSpecs);
      setLoading(false);
    }, 1500);
  };

  const handleDocumentUpload = async (file: File) => {
    setLoading(true);
    setTimeout(() => {
      const mockDoc: UploadedDocument = {
        id: Date.now().toString(),
        name: file.name,
        size: (file.size / 1024).toFixed(2) + ' KB',
        pages: Math.floor(Math.random() * 100) + 10,
        uploadedAt: new Date().toISOString(),
        status: 'processed',
        summary: 'Document successfully processed and indexed.',
      };
      setDocuments([mockDoc, ...documents]);
      setLoading(false);
    }, 2000);
  };

  const handleCalculation = async (input: string) => {
    setLoading(true);
    setTimeout(() => {
      const mockCalc: Calculation = {
        id: Date.now().toString(),
        query: input,
        result: '156.8 kVA',
        steps: [
          'Step 1: Calculate total connected load = 120 kVA',
          'Step 2: Apply demand factor (0.8) = 96 kVA',
          'Step 3: Add motor loads with 125% factor = 32 kVA',
          'Step 4: Add future expansion (20%) = 25.6 kVA',
          'Step 5: Round up to nearest standard size = 156.8 kVA',
        ],
        formula: 'Total Load = (Connected Load × Demand Factor) + (Motor Load × 1.25) + Future',
        notes: 'Per NEC 220.87, additional capacity for future expansion is recommended.',
      };
      setCalculations([mockCalc, ...calculations]);
      setLoading(false);
    }, 2000);
  };

  const activeColor = modes.find(m => m.id === activeMode)?.color || 'cyan';

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-lg">
          <Brain className="w-8 h-8 text-orange-400" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white/80">Advanced AI Features</h2>
          <p className="text-orange-400/70">Intelligent electrical engineering assistance</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {modes.map(mode => (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id)}
            className={`p-4 rounded-lg border transition-all ${
              activeMode === mode.id
                ? `bg-${mode.color}-500/20 border-${mode.color}-500/50 shadow-lg shadow-${mode.color}-500/20`
                : 'bg-black/30 border-gray-500/30 hover:border-gray-500/50'
            }`}
          >
            <div className={`flex flex-col items-center space-y-2 ${
              activeMode === mode.id ? `text-${mode.color}-200` : 'text-gray-400'
            }`}>
              {mode.icon}
              <span className="text-xs font-semibold text-center">{mode.label}</span>
            </div>
          </button>
        ))}
      </div>

      <div className={`bg-black/30 backdrop-blur-md border border-${activeColor}-500/30 rounded-lg p-6`}>
        <div className="flex items-center space-x-3 mb-4">
          {modes.find(m => m.id === activeMode)?.icon}
          <div>
            <h3 className="text-xl font-bold text-white">
              {modes.find(m => m.id === activeMode)?.label}
            </h3>
            <p className="text-gray-400 text-sm">
              {modes.find(m => m.id === activeMode)?.description}
            </p>
          </div>
        </div>

        {activeMode === 'compliance' && (
          <ComplianceChecker
            onCheck={handleComplianceCheck}
            results={complianceResults}
            loading={loading}
          />
        )}
        {activeMode === 'circuit' && (
          <CircuitDesigner
            onDesign={handleCircuitDesign}
            designs={circuitDesigns}
            loading={loading}
          />
        )}
        {activeMode === 'components' && (
          <ComponentLookup
            onLookup={handleComponentLookup}
            specs={componentSpecs}
            loading={loading}
          />
        )}
        {activeMode === 'documents' && (
          <DocumentAnalyzer
            documents={documents}
            onUpload={handleDocumentUpload}
            loading={loading}
          />
        )}
        {activeMode === 'calculations' && (
          <CalculationAssistant
            onCalculate={handleCalculation}
            calculations={calculations}
            loading={loading}
          />
        )}
      </div>
    </div>
  );
}