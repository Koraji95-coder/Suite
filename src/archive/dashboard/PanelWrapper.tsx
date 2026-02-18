import React from 'react';
import { PageFrame } from './ui/PageFrame';
import { EMBER_PALETTE } from '../lib/three/emberPalette';

interface PanelWrapperProps {
  title: string;
  icon: React.ReactNode;
  onBack: () => void;
  children: React.ReactNode;
  colorScheme?: 'cyan' | 'blue' | 'green' | 'orange' | 'teal' | 'purple';

  /** Optional upgrades (won’t break existing usage) */
  subtitle?: string;
  actions?: React.ReactNode;
  rightRail?: React.ReactNode;
}

const SCHEME_TINT: Record<NonNullable<PanelWrapperProps['colorScheme']>, string> = {
  cyan: '#22d3ee',
  blue: '#60a5fa',
  green: '#34d399',
  orange: EMBER_PALETTE.primary, // keep your brand ember
  teal: '#2dd4bf',
  purple: '#a78bfa',
};

export function PanelWrapper({
  title,
  icon,
  onBack,
  children,
  subtitle,
  actions,
  rightRail,
  colorScheme = 'cyan',
}: PanelWrapperProps) {
  const tint = SCHEME_TINT[colorScheme] ?? EMBER_PALETTE.primary;

  return (
    <PageFrame
      title={title}
      subtitle={subtitle}
      icon={icon}
      onBack={onBack}
      actions={actions}
      rightRail={rightRail}
      tint={tint}
    >
      {children}
    </PageFrame>
  );
}
