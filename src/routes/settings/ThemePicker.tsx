// src/routes/app/settings/ThemePicker.tsx
import { Check, Palette, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { COLOR_SCHEMES, useTheme } from "@/lib/palette";

// Primitives
import { Text } from "@/components/primitives/Text";
import { Panel } from "@/components/primitives/Panel";
import { Stack, HStack } from "@/components/primitives/Stack";
import { Badge } from "@/components/primitives/Badge";

// New theme keys matching palette.ts
const THEME_KEYS = [
  "midnight",
  "graphite",
  "slate",
  "ember",
  "copper",
  "forest",
  "ocean",
  "violet",
  "rose",
] as const;

type ThemeKey = (typeof THEME_KEYS)[number];

type ThemeItem = {
  key: ThemeKey;
  name: string;
  description: string;
  swatches: { label: string; value: string }[];
};

export default function ThemePicker() {
  const { schemeKey, setScheme } = useTheme();

  const active = (
    THEME_KEYS.some((theme) => theme === schemeKey) ? schemeKey : "midnight"
  ) as ThemeKey;

  const items = useMemo<ThemeItem[]>(
    () =>
      THEME_KEYS.map((key) => {
        const scheme = COLOR_SCHEMES[key];
        return {
          key,
          name: scheme.name,
          description: scheme.description,
          swatches: [
            { label: "Primary", value: scheme.primary },
            { label: "Secondary", value: scheme.secondary },
            { label: "Accent", value: scheme.accent },
            { label: "Text", value: scheme.text },
          ],
        };
      }),
    []
  );

  return (
    <Panel variant="default" padding="lg">
      <Stack gap={6}>
        {/* Header */}
        <HStack gap={3} align="start">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Palette size={20} />
          </div>
          <Stack gap={1}>
            <Text size="lg" weight="semibold">
              Theme
            </Text>
            <Text size="sm" color="muted">
              Choose a color scheme for your workspace. Changes apply instantly.
            </Text>
          </Stack>
        </HStack>

        {/* Current theme indicator */}
        <Panel variant="inset" padding="md">
          <HStack gap={3} align="center">
            <Sparkles size={16} className="text-primary" />
            <Text size="sm" color="muted">
              Currently using{" "}
              <Text weight="semibold" color="default">
                {COLOR_SCHEMES[active].name}
              </Text>
            </Text>
          </HStack>
        </Panel>

        {/* Theme grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => {
            const isActive = t.key === active;

            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setScheme(t.key)}
                className={`
                  group relative rounded-xl border p-4 text-left transition-all duration-200
                  ${isActive 
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20" 
                    : "border-border bg-surface hover:border-primary/50 hover:bg-surface-2"
                  }
                `}
              >
                {/* Active checkmark */}
                {isActive && (
                  <div className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-contrast shadow-md">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}

                <Stack gap={3}>
                  {/* Theme info */}
                  <Stack gap={1}>
                    <HStack gap={2} align="center">
                      <Text size="sm" weight="semibold">
                        {t.name}
                      </Text>
                      {isActive && (
                        <Badge color="primary" variant="soft" size="sm">
                          Active
                        </Badge>
                      )}
                    </HStack>
                    <Text size="xs" color="muted" className="line-clamp-2">
                      {t.description}
                    </Text>
                  </Stack>

                  {/* Color swatches */}
                  <HStack gap={2}>
                    {t.swatches.map((s) => (
                      <div
                        key={`${t.key}-${s.label}`}
                        className="relative h-6 w-6 rounded-lg border border-border/50 shadow-sm transition-transform group-hover:scale-105"
                        style={{ background: s.value }}
                        title={`${s.label}: ${s.value}`}
                      >
                        {/* Subtle shine */}
                        <div className="absolute inset-0 rounded-lg bg-linear-to-br from-white/20 to-transparent" />
                      </div>
                    ))}
                  </HStack>
                </Stack>
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <Text size="xs" color="muted" align="center">
          Themes are saved automatically and persist across sessions.
        </Text>
      </Stack>
    </Panel>
  );
}