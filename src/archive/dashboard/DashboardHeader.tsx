import { useState, useRef, useEffect } from 'react';
import { Zap, Bell, Settings, User, LogOut, ChevronDown, Menu } from 'lucide-react';
import { EMBER_PALETTE, hexToRgba } from '../../lib/three/emberPalette';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

interface DashboardHeaderProps {
  onToggleSidebar: () => void;
}

export function DashboardHeader({ onToggleSidebar }: DashboardHeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header
      className="backdrop-blur-xl border-b"
      style={{
        background: `linear-gradient(180deg, ${hexToRgba(EMBER_PALETTE.surface, 0.72)} 0%, ${hexToRgba(EMBER_PALETTE.surface, 0.58)} 100%)`,
        borderColor: `${EMBER_PALETTE.primary}20`,
        boxShadow: `0 10px 30px ${hexToRgba('#000000', 0.22)}`,
      }}
    >
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
            className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: EMBER_PALETTE.primary }}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5" style={{ color: EMBER_PALETTE.primary }} />
            <span
              className="text-sm font-black tracking-wider"
              style={{
                background: `linear-gradient(90deg, ${EMBER_PALETTE.primary}, ${EMBER_PALETTE.tertiary})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              √3 SUITE
            </span>
          </div>

          <div className="h-4 w-px" style={{ backgroundColor: `${EMBER_PALETTE.primary}30` }} />

          <h1 className="text-sm font-medium" style={{ color: EMBER_PALETTE.textMuted }}>
            {getGreeting()}, <span style={{ color: EMBER_PALETTE.primary }}>Dustin</span>
          </h1>
        </div>

        <div className="flex items-center space-x-1">
          {/* Notifications */}
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
              aria-haspopup="menu"
              aria-expanded={notifOpen}
              className="relative p-2 rounded-lg hover:bg-white/[0.06] transition-colors focus:outline-none focus-visible:ring-2"
              title="Notifications"
            >
              <Bell className="w-[18px] h-[18px]" style={{ color: `${EMBER_PALETTE.textMuted}80` }} />
              <span
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: EMBER_PALETTE.primary }}
              />
            </button>

            {notifOpen && (
              <div
                className="absolute right-0 mt-2 w-72 rounded-xl shadow-2xl z-[90] overflow-hidden"
                style={{
                  backgroundColor: `${EMBER_PALETTE.surface}CC`,
                  backdropFilter: 'blur(24px)',
                  borderColor: `${EMBER_PALETTE.primary}30`,
                  borderWidth: '1px',
                }}
              >
                <div className="px-4 py-3 border-b" style={{ borderColor: `${EMBER_PALETTE.primary}20` }}>
                  <p className="text-sm font-semibold" style={{ color: EMBER_PALETTE.text }}>Notifications</p>
                </div>
                <div className="p-4 text-sm text-center" style={{ color: `${EMBER_PALETTE.textMuted}80` }}>
                  No new notifications
                </div>
              </div>
            )}
          </div>

          {/* Settings */}
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors focus:outline-none focus-visible:ring-2"
            title="Settings"
          >
            <Settings className="w-[18px] h-[18px]" style={{ color: `${EMBER_PALETTE.textMuted}80` }} />
          </button>

          {/* Profile */}
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              className="flex items-center space-x-2 pl-2 pr-1.5 py-1 rounded-xl hover:bg-white/[0.06] transition-colors ml-1 focus:outline-none focus-visible:ring-2"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${EMBER_PALETTE.primary}, ${EMBER_PALETTE.tertiary})`,
                  border: `2px solid ${EMBER_PALETTE.primary}80`,
                }}
              >
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-medium" style={{ color: EMBER_PALETTE.text }}>
                Dustin
              </span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${profileOpen ? 'rotate-180' : ''}`}
                style={{ color: `${EMBER_PALETTE.textMuted}80` }}
              />
            </button>

            {profileOpen && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-xl shadow-2xl z-[90] overflow-hidden"
                style={{
                  backgroundColor: `${EMBER_PALETTE.surface}CC`,
                  backdropFilter: 'blur(24px)',
                  borderColor: `${EMBER_PALETTE.primary}30`,
                  borderWidth: '1px',
                }}
              >
                <div
                  className="px-4 py-3 border-b flex items-center space-x-3"
                  style={{ borderColor: `${EMBER_PALETTE.primary}20` }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${EMBER_PALETTE.primary}, ${EMBER_PALETTE.tertiary})`,
                      border: `2px solid ${EMBER_PALETTE.primary}80`,
                    }}
                  >
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: EMBER_PALETTE.text }}>Dustin</p>
                    <p className="text-xs" style={{ color: `${EMBER_PALETTE.textMuted}` }}>Electrical Engineer</p>
                  </div>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.06]"
                    style={{ color: EMBER_PALETTE.textMuted }}
                  >
                    <User className="w-4 h-4" />
                    <span>My Profile</span>
                  </button>
                  <button
                    type="button"
                    className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.06]"
                    style={{ color: EMBER_PALETTE.textMuted }}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                </div>

                <div className="border-t py-1" style={{ borderColor: `${EMBER_PALETTE.primary}20` }}>
                  <button
                    type="button"
                    className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm transition-colors hover:bg-red-900/15"
                    style={{ color: EMBER_PALETTE.tertiary }}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
