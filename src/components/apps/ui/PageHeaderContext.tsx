import type { ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type PageHeaderConfig = {
	title?: string;
	subtitle?: string;
	icon?: ReactNode;
	// Legacy compatibility slot. The shell no longer renders this in the top rail.
	centerContent?: ReactNode;
};

type PageHeaderContextValue = {
	header: PageHeaderConfig;
	setHeader: (next: PageHeaderConfig) => void;
	clearHeader: () => void;
};

const PageHeaderContext = createContext<PageHeaderContextValue>({
	header: {},
	setHeader: () => {
		// noop
	},
	clearHeader: () => {
		// noop
	},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
	const [header, setHeaderState] = useState<PageHeaderConfig>({});

	const setHeader = useCallback((next: PageHeaderConfig) => {
		setHeaderState(next);
	}, []);

	const clearHeader = useCallback(() => {
		setHeaderState({});
	}, []);

	const value = useMemo(
		() => ({
			header,
			setHeader,
			clearHeader,
		}),
		[header, setHeader, clearHeader],
	);

	return (
		<PageHeaderContext.Provider value={value}>
			{children}
		</PageHeaderContext.Provider>
	);
}

export function usePageHeader() {
	return useContext(PageHeaderContext);
}

export function useRegisterPageHeader(config: PageHeaderConfig) {
	const { setHeader, clearHeader } = usePageHeader();
	const { title, subtitle, icon, centerContent } = config;

	useEffect(() => {
		if (!title && !subtitle && !icon && !centerContent) {
			clearHeader();
			return;
		}

		setHeader({
			title,
			subtitle,
			icon,
			centerContent,
		});

		return () => {
			clearHeader();
		};
	}, [centerContent, clearHeader, icon, setHeader, subtitle, title]);
}
