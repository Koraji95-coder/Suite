// src/routes/app/CommandCenterPage.tsx
import { Terminal, Copy, Check, ShieldAlert, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import {
  getDevAdminEmails,
  isDevAdminEmail,
  normalizeEmail,
} from "@/lib/devAccess";

// Primitives
import { Text, Heading } from "@/components/primitives/Text";
import { Panel } from "@/components/primitives/Panel";
import { Stack, HStack } from "@/components/primitives/Stack";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";

type CommandPreset = {
  id: string;
  name: string;
  description: string;
  command: string;
};

type CommandGroup = {
  title: string;
  presets: CommandPreset[];
};

const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: "Core Dev",
    presets: [
      { id: "dev", name: "Start Vite Dev Server", description: "Run frontend in development mode.", command: "npm run dev" },
      { id: "build", name: "Production Build", description: "Create production bundle.", command: "npm run build" },
      { id: "preview", name: "Preview Build", description: "Serve build output locally.", command: "npm run preview" },
    ],
  },
  {
    title: "Quality",
    presets: [
      { id: "check", name: "Biome + Type Check", description: "Run repository validation checks.", command: "npm run check" },
      { id: "check-fix", name: "Auto-fix + Type Check", description: "Apply safe Biome fixes and re-check.", command: "npm run check:fix" },
      { id: "audit", name: "Dependency Audit", description: "Check known package vulnerabilities.", command: "npm run ci:audit" },
    ],
  },
  {
    title: "Agent + Backend",
    presets: [
      { id: "zeroclaw", name: "ZeroClaw Gateway (Local)", description: "Start local ZeroClaw gateway service.", command: "./zeroclaw gateway --host 127.0.0.1 --port 3000" },
      { id: "flask", name: "Ground Grid Flask API", description: "Run Flask backend for AutoCAD workflows.", command: "npm run backend:coords:dev" },
      { id: "pairing", name: "Show Agent Health", description: "Validate gateway is listening.", command: "curl -sS http://127.0.0.1:3000/health | cat" },
    ],
  },
  {
    title: "Npx Utilities",
    presets: [
      { id: "biome-check", name: "Biome Check", description: "Run Biome directly over source files.", command: "npx @biomejs/biome check src" },
      { id: "biome-write", name: "Biome Format Write", description: "Apply formatting and import organization.", command: "npx @biomejs/biome check --write src" },
      { id: "tsc", name: "TypeScript Check", description: "Run TypeScript compiler checks only.", command: "npx tsc --noEmit" },
    ],
  },
];

export default function CommandCenterPage() {
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const userEmail = normalizeEmail(user?.email);
  const isAllowed = isDevAdminEmail(user?.email);
  const allowlist = useMemo(() => getDevAdminEmails(), []);

  const copyCommand = async (preset: CommandPreset) => {
    await navigator.clipboard.writeText(preset.command);
    setCopiedId(preset.id);
    setTimeout(() => {
      setCopiedId((current) => (current === preset.id ? null : current));
    }, 1500);
  };

  // Not in dev mode
  if (!import.meta.env.DEV) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader />
        <Panel variant="default" padding="lg" className="mt-6">
          <HStack gap={3} align="center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15 text-warning">
              <Lock size={20} />
            </div>
            <Stack gap={1}>
              <Text size="sm" weight="semibold">
                Development Mode Required
              </Text>
              <Text size="sm" color="muted">
                Command Center is disabled outside development mode.
              </Text>
            </Stack>
          </HStack>
        </Panel>
      </div>
    );
  }

  // Not authorized
  if (!isAllowed) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader />
        <Panel variant="default" padding="lg" className="mt-6">
          <Stack gap={4}>
            <HStack gap={3} align="start">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/15 text-danger">
                <ShieldAlert size={20} />
              </div>
              <Stack gap={1}>
                <Text size="sm" weight="semibold">
                  Admin Access Required
                </Text>
                <Text size="sm" color="muted">
                  Set <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-mono">VITE_DEV_ADMIN_EMAIL</code> or{" "}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-mono">VITE_DEV_ADMIN_EMAILS</code> in your{" "}
                  <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-mono">.env</code> to your account email.
                </Text>
              </Stack>
            </HStack>

            <Panel variant="inset" padding="md">
              <Stack gap={2}>
                <HStack gap={2} align="center">
                  <Text size="xs" color="muted">Current account:</Text>
                  <Badge variant="soft" size="sm">{userEmail || "(unknown)"}</Badge>
                </HStack>
                {allowlist.length > 0 && (
                  <HStack gap={2} align="center">
                    <Text size="xs" color="muted">Allowlist:</Text>
                    <Text size="xs" color="muted">{allowlist.join(", ")}</Text>
                  </HStack>
                )}
              </Stack>
            </Panel>
          </Stack>
        </Panel>
      </div>
    );
  }

  // Authorized - show commands
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {COMMAND_GROUPS.map((group) => (
          <Panel key={group.title} variant="default" padding="md">
            <Stack gap={4}>
              <HStack gap={2} align="center">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Terminal size={14} />
                </div>
                <Text size="sm" weight="semibold">
                  {group.title}
                </Text>
              </HStack>

              <Stack gap={3}>
                {group.presets.map((preset) => (
                  <CommandCard
                    key={preset.id}
                    preset={preset}
                    copied={copiedId === preset.id}
                    onCopy={() => void copyCommand(preset)}
                  />
                ))}
              </Stack>
            </Stack>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <HStack gap={3} align="center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Terminal size={20} />
      </div>
      <div>
        <Heading level={1}>Command Center</Heading>
        <Text size="sm" color="muted">
          Development command palette for npm, npx, and shell workflows.
        </Text>
      </div>
    </HStack>
  );
}

function CommandCard({
  preset,
  copied,
  onCopy,
}: {
  preset: CommandPreset;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Panel variant="inset" padding="sm">
      <Stack gap={2}>
        <HStack justify="between" align="start" gap={3}>
          <Stack gap={1}>
            <Text size="sm" weight="medium">
              {preset.name}
            </Text>
            <Text size="xs" color="muted">
              {preset.description}
            </Text>
          </Stack>
          <Button
            variant={copied ? "primary" : "secondary"}
            size="sm"
            onClick={onCopy}
            iconLeft={copied ? <Check size={12} /> : <Copy size={12} />}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </HStack>

        <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-2.5 text-xs font-mono text-accent">
          {preset.command}
        </pre>
      </Stack>
    </Panel>
  );
}