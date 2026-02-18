import { useState } from 'react';
import { Bot, Brain } from 'lucide-react';

import { AIChat } from './AIChat';
import type { ConversationContext } from '../aitypes';
import { EMBER_PALETTE } from '../../../lib/three/emberPalette';

interface EmberOrbProps {
  context: ConversationContext;
  onNavigateToMemory?: () => void;
}

export function EmberOrb({ context, onNavigateToMemory }: EmberOrbProps) {
  const [showAI, setShowAI] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 right-24 z-40 flex flex-col items-end space-y-2">
        {showMenu && (
          <div className="flex flex-col space-y-2 mb-2">
            <button
              onClick={() => {
                setShowAI(true);
                setShowMenu(false);
              }}
              className="flex items-center space-x-2 bg-gradient-to-r from-[${EMBER_PALETTE.primary}]/90 to-[${EMBER_PALETTE.tertiary}]/90 hover:from-[${EMBER_PALETTE.primary}] hover:to-[${EMBER_PALETTE.tertiary}] text-[#FCE8D9] font-semibold px-4 py-3 rounded-lg shadow-lg shadow-[${EMBER_PALETTE.primary}]/30 transition-all border border-[${EMBER_PALETTE.primary}]/25"
            >
              <Bot className="w-5 h-5" />
              <span>AI Assistant</span>
            </button>

            <button
              onClick={() => {
                onNavigateToMemory?.();
                setShowMenu(false);
              }}
              className="flex items-center space-x-2 bg-[${EMBER_PALETTE.surface}] hover:bg-[${EMBER_PALETTE.surface}]/80 text-[#FCE8D9] font-semibold px-4 py-3 rounded-lg shadow-lg shadow-[${EMBER_PALETTE.tertiary}]/20 transition-all border border-[${EMBER_PALETTE.tertiary}]/30"
            >
              <Brain className={`w-5 h-5 text-[${EMBER_PALETTE.tertiary}]`} />
              <span>AI Memory</span>
            </button>
          </div>
        )}

        {/* Orb button – brighter center, stronger glow, off-white icon */}
        <button
          type="button"
          onClick={() => setShowMenu((v) => !v)}
          className={`relative w-16 h-16 rounded-full transition-transform focus:outline-none ${showMenu ? 'rotate-12 scale-105' : 'hover:scale-105'}`}
          style={{
            background: `radial-gradient(circle at 35% 30%, ${EMBER_PALETTE.primary}, ${EMBER_PALETTE.tertiary} 60%, ${EMBER_PALETTE.surface})`,
            boxShadow: `0 0 30px ${EMBER_PALETTE.primary}80, 0 0 60px ${EMBER_PALETTE.tertiary}60, 0 0 0 2px #FCE8D920 inset`,
            border: `1px solid #FCE8D940`,
          }}
          title="AI Assistant"
        >
          <Bot className="w-6 h-6 text-[#FCE8D9] mx-auto" />
        </button>
      </div>

      <AIChat isOpen={showAI} onClose={() => setShowAI(false)} context={context} />
    </>
  );
}