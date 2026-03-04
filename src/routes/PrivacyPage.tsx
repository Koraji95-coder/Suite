// src/routes/PrivacyPage.tsx
import { Link } from "react-router-dom";
import { 
  Shield, 
  Eye, 
  Lock, 
  Mail, 
  Server, 
  Trash2,
  ExternalLink,
  ArrowRight 
} from "lucide-react";
import { APP_NAME } from "@/appMeta";
import AuthShell from "../auth/AuthShell";

// Primitives
import { Text, Heading } from "../components/primitives/Text";
import { Panel } from "../components/primitives/Panel";
import { Badge } from "../components/primitives/Badge";
import { Button } from "../components/primitives/Button";
import { Stack, HStack } from "../components/primitives/Stack";

const APP_SLUG = APP_NAME.toLowerCase().replace(/\s+/g, "");

// ═══════════════════════════════════════════════════════════════════════════
// DATA SECTIONS
// ═══════════════════════════════════════════════════════════════════════════
const sections = [
  {
    icon: Eye,
    title: "What we collect",
    color: "primary" as const,
    items: [
      "Account information (email, auth identifiers)",
      "Product usage events (to improve the product)",
      "Optional billing data (if/when enabled)",
    ],
  },
  {
    icon: Lock,
    title: "How we protect it",
    color: "success" as const,
    items: [
      "All data encrypted in transit and at rest",
      "Passwordless authentication (passkeys + magic links)",
      "Regular security audits and monitoring",
    ],
  },
  {
    icon: Server,
    title: "How we use it",
    color: "accent" as const,
    items: [
      "Provide and secure the service",
      "Improve reliability, performance, and UX",
      "Support and debugging (when needed)",
    ],
  },
  {
    icon: Trash2,
    title: "Your rights",
    color: "warning" as const,
    items: [
      "Request a copy of your data anytime",
      "Delete your account and all associated data",
      "Opt out of non-essential data collection",
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function PrivacyPage() {
  return (
    <AuthShell navLink={{ to: "/", label: "Back to landing" }} hidePanel>
      <Stack gap={8}>
        {/* ─────────────────────────────────────────────────────────────────
            HEADER
        ───────────────────────────────────────────────────────────────── */}
        <div>
          <HStack gap={2} align="center" className="mb-4">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Shield size={16} />
            </div>
            <Badge color="primary" variant="soft">
              Privacy Policy
            </Badge>
          </HStack>

          <Heading level={1} className="mb-3">
            Your data, your control
          </Heading>

          <Text color="muted" size="md" className="max-w-lg leading-relaxed" block>
            We believe in transparency. Here's exactly what we collect, 
            why we collect it, and how we protect it.
          </Text>

          <Text size="xs" color="muted" className="mt-3" block>
            Last updated: March 2025 · This is a living document.
          </Text>
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            SECTIONS GRID
        ───────────────────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Panel 
                key={section.title} 
                variant="default" 
                padding="md"
                hover
              >
                <Stack gap={3}>
                  {/* Section header */}
                  <HStack gap={3} align="start">
                    <div 
                      className={`
                        inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
                        ${section.color === 'primary' ? 'bg-primary/15 text-primary' : ''}
                        ${section.color === 'success' ? 'bg-success/15 text-success' : ''}
                        ${section.color === 'accent' ? 'bg-accent/15 text-accent' : ''}
                        ${section.color === 'warning' ? 'bg-warning/15 text-warning' : ''}
                      `}
                    >
                      <Icon size={18} />
                    </div>
                    <Text size="sm" weight="semibold" className="pt-2">
                      {section.title}
                    </Text>
                  </HStack>

                  {/* Items */}
                  <Stack gap={2} className="pl-12">
                    {section.items.map((item, i) => (
                      <HStack key={i} gap={2} align="start">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-text-muted/50" />
                        <Text size="sm" color="muted">
                          {item}
                        </Text>
                      </HStack>
                    ))}
                  </Stack>
                </Stack>
              </Panel>
            );
          })}
        </div>

        {/* ─────────────────────────────────────────────────────────────────
            CONTACT SECTION
        ───────────────────────────────────────────────────────────────── */}
        <Panel variant="outline" padding="lg">
          <HStack gap={4} align="start" wrap>
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-muted">
              <Mail size={20} />
            </div>
            <Stack gap={1} className="flex-1 min-w-50">
              <Text weight="semibold">Questions or concerns?</Text>
              <Text size="sm" color="muted">
                We're happy to help. Reach out and we'll respond within 48 hours.
              </Text>
              <Text size="sm" weight="medium" color="primary" className="mt-2">
                {`privacy@${APP_SLUG}.app`}
              </Text>
            </Stack>
          </HStack>
        </Panel>

        {/* ─────────────────────────────────────────────────────────────────
            CTA SECTION
        ───────────────────────────────────────────────────────────────── */}
        <Panel 
          variant="glass" 
          padding="lg"
          className="relative overflow-hidden"
        >
          {/* Background accent */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: `radial-gradient(ellipse 80% 80% at 50% 0%, var(--primary), transparent)`,
            }}
          />

          <Stack gap={4} className="relative">
            <div>
              <Text size="lg" weight="semibold" block>
                Ready to get started?
              </Text>
              <Text size="sm" color="muted" block>
                Create your account and explore the workspace.
              </Text>
            </div>

            <HStack gap={3} wrap>
              <Link to="/signup">
                <Button variant="primary" iconRight={<ArrowRight size={16} />}>
                  Create account
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary">
                  Sign in
                </Button>
              </Link>
            </HStack>
          </Stack>
        </Panel>

        {/* ─────────────────────────────────────────────────────────────────
            FOOTER LINKS
        ───────────────────────────────────────────────────────────────── */}
        <HStack gap={4} justify="center" className="pt-2">
          <Link 
            to="/roadmap"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition"
          >
            Roadmap
            <ExternalLink size={10} />
          </Link>
          <span className="text-text-muted/30">·</span>
          <Link 
            to="/"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition"
          >
            Home
            <ExternalLink size={10} />
          </Link>
        </HStack>
      </Stack>
    </AuthShell>
  );
}