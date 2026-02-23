import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

interface ScrollContextValue {
	scrollProgress: RefObject<number>;
	scrollY: RefObject<number>;
	burstTrigger: RefObject<number>;
	mouseX: RefObject<number>;
	mouseY: RefObject<number>;
	activeSection: string;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function useScrollContext() {
	const ctx = useContext(ScrollContext);
	if (!ctx)
		throw new Error("useScrollContext must be used within ScrollProvider");
	return ctx;
}

const SECTIONS = ["hero", "features", "how-it-works", "use-cases"];

export function ScrollProvider({ children }: { children: ReactNode }) {
	const scrollProgress = useRef(0);
	const scrollY = useRef(0);
	const burstTrigger = useRef(0);
	const mouseX = useRef(0.5);
	const mouseY = useRef(0.5);
	const [activeSection, setActiveSection] = useState("hero");

	useEffect(() => {
		const onScroll = () => {
			const maxScroll =
				document.documentElement.scrollHeight - window.innerHeight;
			scrollProgress.current = maxScroll > 0 ? window.scrollY / maxScroll : 0;
			scrollY.current = window.scrollY;

			let current = "hero";
			for (const id of SECTIONS) {
				const el =
					document.getElementById(id) ||
					document.querySelector(`[data-section="${id}"]`);
				if (el) {
					const rect = el.getBoundingClientRect();
					if (rect.top <= window.innerHeight * 0.4) {
						current = id;
					}
				}
			}
			setActiveSection(current);
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			mouseX.current = e.clientX / window.innerWidth;
			mouseY.current = e.clientY / window.innerHeight;
		};
		window.addEventListener("mousemove", onMouseMove, { passive: true });
		return () => window.removeEventListener("mousemove", onMouseMove);
	}, []);

	return (
		<ScrollContext.Provider
			value={{
				scrollProgress,
				scrollY,
				burstTrigger,
				mouseX,
				mouseY,
				activeSection,
			}}
		>
			{children}
		</ScrollContext.Provider>
	);
}
