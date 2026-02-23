// src/routes/LandingPage.tsx
import { lazy, Suspense } from "react";

import Features from "../components/Features";
import Footer from "../components/Footer";
import Cursor from "../components/fx/Cursor";
import ParticleField from "../components/fx/ParticleField";
import Hero from "../components/Hero";
import HowItWorks from "../components/HowItWorks";
import Navbar from "../components/Navbar";
import Pricing from "../components/Pricing";
import { ScrollProvider } from "../context/ScrollContext";
import {
	useBlockflowCursor,
	useCursorEnabled,
} from "../hooks/useBlockflowCursor";

const FallingBlocksCanvas = lazy(() => import("../scenes/FallingBlocksCanvas"));

function LandingContent() {
	const cursorEnabled = useCursorEnabled();
	useBlockflowCursor(cursorEnabled);

	return (
		<>
			<div id="scene-layer">
				<Suspense
					fallback={
						<div
							style={{ width: "100%", height: "100%", background: "#090b12" }}
						/>
					}
				>
					<FallingBlocksCanvas />
				</Suspense>
			</div>

			<div id="fx-layer">
				<ParticleField />
			</div>

			{cursorEnabled ? <Cursor /> : null}

			<div id="ui-layer">
				<Navbar />
				<Hero />
				<div className="fade-divider" />
				<Features />
				<HowItWorks />
				<Pricing />
				<Footer />
			</div>
		</>
	);
}

export default function LandingPage() {
	// Keep ScrollProvider ONLY on landing for now.
	return (
		<ScrollProvider>
			<LandingContent />
		</ScrollProvider>
	);
}
