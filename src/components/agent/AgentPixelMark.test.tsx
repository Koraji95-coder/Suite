import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentPixelMark } from "./AgentPixelMark";

async function advance(ms: number): Promise<void> {
	await act(async () => {
		vi.advanceTimersByTime(ms);
	});
}

describe("AgentPixelMark", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("steps sprite frames for active states using balanced cadence", async () => {
		const { container } = render(
			<AgentPixelMark profileId="koro" state="running" size={44} />,
		);
		const root = container.querySelector("[data-agent-state='running']");
		expect(root).not.toBeNull();
		expect(root?.getAttribute("data-agent-frame")).toBe("0");

		await advance(180);
		expect(root?.getAttribute("data-agent-frame")).toBe("1");
	});

	it("locks animation when reduced motion preset is selected", async () => {
		const { container } = render(
			<AgentPixelMark
				profileId="koro"
				state="speaking"
				pulse
				motionPreset="reduced"
				size={44}
			/>,
		);
		const root = container.querySelector("[data-agent-state='speaking']");
		expect(root?.getAttribute("data-agent-motion")).toBe("reduced");
		expect(container.querySelector("[data-agent-layer='pulse']")).toBeNull();

		await advance(1_000);
		expect(root?.getAttribute("data-agent-frame")).toBe("0");
	});

	it("respects prefers-reduced-motion media query", async () => {
		const originalMatchMedia = window.matchMedia;
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			configurable: true,
			value: vi.fn().mockImplementation(() => ({
				matches: true,
				media: "(prefers-reduced-motion: reduce)",
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});
		try {
			const { container } = render(
				<AgentPixelMark profileId="koro" state="running" size={44} />,
			);
			const root = container.querySelector("[data-agent-state='running']");
			expect(root?.getAttribute("data-agent-motion")).toBe("reduced");
			await advance(1_000);
			expect(root?.getAttribute("data-agent-frame")).toBe("0");
		} finally {
			Object.defineProperty(window, "matchMedia", {
				writable: true,
				configurable: true,
				value: originalMatchMedia,
			});
		}
	});

	it("renders crest vectors for idle and warning states", () => {
		const idle = render(<AgentPixelMark profileId="koro" state="idle" size={40} />);
		const warning = render(
			<AgentPixelMark profileId="koro" state="warning" size={40} />,
		);
		expect(
			idle.container.querySelector("[data-agent-layer='crest']"),
		).not.toBeNull();
		expect(
			warning.container.querySelector("[data-agent-layer='crest']"),
		).not.toBeNull();
		expect(idle.container.querySelectorAll("path").length).toBeGreaterThan(0);
		expect(warning.container.querySelectorAll("path").length).toBeGreaterThan(0);
	});

	it("keeps legacy expression/pulse/breathe compatibility", () => {
		const active = render(
			<AgentPixelMark profileId="koro" expression="active" size={40} />,
		);
		expect(
			active.container
				.querySelector("[data-agent-state]")
				?.getAttribute("data-agent-state"),
		).toBe("thinking");

		const focused = render(
			<AgentPixelMark
				profileId="koro"
				expression="focus"
				breathe
				size={40}
			/>,
		);
		expect(
			focused.container
				.querySelector("[data-agent-state]")
				?.getAttribute("data-agent-state"),
		).toBe("focus");
	});

	it("derives adaptive detail level by size and honors explicit override", () => {
		const hero = render(<AgentPixelMark profileId="koro" size={136} />);
		expect(
			hero.container
				.querySelector("[data-agent-state]")
				?.getAttribute("data-agent-detail"),
		).toBe("hero");

		const standard = render(<AgentPixelMark profileId="koro" size={48} />);
		expect(
			standard.container
				.querySelector("[data-agent-state]")
				?.getAttribute("data-agent-detail"),
		).toBe("standard");

		const micro = render(
			<AgentPixelMark profileId="koro" size={20} detailLevel="micro" />,
		);
		expect(
			micro.container
				.querySelector("[data-agent-state]")
				?.getAttribute("data-agent-detail"),
		).toBe("micro");
	});
});
