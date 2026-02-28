import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

interface Toast {
	id: string;
	type: "success" | "error" | "info";
	message: string;
}

interface ToastContextType {
	showToast: (type: Toast["type"], message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within ToastProvider");
	}
	return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const showToast = useCallback((type: Toast["type"], message: string) => {
		const id = crypto.randomUUID();
		setToasts((prev) => [...prev, { id, type, message }]);
	}, []);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}
			<div className="fixed bottom-4 right-4 z-[100] space-y-2">
				{toasts.map((toast) => (
					<ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
				))}
			</div>
		</ToastContext.Provider>
	);
}

function ToastItem({
	toast,
	onRemove,
}: {
	toast: Toast;
	onRemove: (id: string) => void;
}) {
	useEffect(() => {
		const timer = setTimeout(() => onRemove(toast.id), 4000);
		return () => clearTimeout(timer);
	}, [toast.id, onRemove]);

	const icons = {
		success: <CheckCircle className="w-5 h-5 text-green-400" />,
		error: <AlertCircle className="w-5 h-5 text-red-400" />,
		info: <Info className="w-5 h-5 text-blue-400" />,
	};

	const colors = {
		success: "border-green-500/50 bg-green-500/10",
		error: "border-red-500/50 bg-red-500/10",
		info: "border-blue-500/50 bg-blue-500/10",
	};

	return (
		<div
			className={`flex items-center space-x-3 px-4 py-3 rounded-lg border backdrop-blur-md shadow-lg animate-in slide-in-from-right ${colors[toast.type]}`}
		>
			{icons[toast.type]}
			<span className="text-white text-sm">{toast.message}</span>
			<button
				onClick={() => onRemove(toast.id)}
				className="p-1 hover:bg-white/10 rounded"
			>
				<X className="w-4 h-4 text-white/70" />
			</button>
		</div>
	);
}
