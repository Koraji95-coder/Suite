type AdminCrownPixelProps = {
	size?: number;
	className?: string;
	title?: string;
};

export default function AdminCrownPixel({
	size = 16,
	className,
	title = "Admin",
}: AdminCrownPixelProps) {
	const height = Math.round((size * 18) / 24);

	return (
		<svg
			viewBox="0 0 24 18"
			width={size}
			height={height}
			className={className}
			role="img"
			aria-label={title}
			shapeRendering="crispEdges"
		>
			<rect x="4" y="14" width="16" height="2" fill="#0a0f22" />
			<rect x="3" y="13" width="18" height="1" fill="#0d1330" />

			<rect x="3" y="10" width="18" height="3" fill="#1a237e" />
			<rect x="4" y="10" width="16" height="1" fill="#2a3899" />
			<rect x="5" y="11" width="3" height="1" fill="#3e4fb6" />
			<rect x="10" y="11" width="4" height="1" fill="#3e4fb6" />
			<rect x="16" y="11" width="3" height="1" fill="#3e4fb6" />

			<rect x="3" y="6" width="3" height="4" fill="#1a237e" />
			<rect x="7" y="7" width="3" height="3" fill="#1a237e" />
			<rect x="10" y="4" width="4" height="6" fill="#1a237e" />
			<rect x="14" y="7" width="3" height="3" fill="#1a237e" />
			<rect x="18" y="6" width="3" height="4" fill="#1a237e" />

			<rect x="3" y="4" width="3" height="2" fill="#2a3899" />
			<rect x="10" y="2" width="4" height="2" fill="#2a3899" />
			<rect x="18" y="4" width="3" height="2" fill="#2a3899" />

			<rect x="4" y="4" width="1" height="1" fill="#7ec8ff" />
			<rect x="11" y="2" width="1" height="1" fill="#9ed8ff" />
			<rect x="12" y="3" width="1" height="1" fill="#7ec8ff" />
			<rect x="19" y="4" width="1" height="1" fill="#7ec8ff" />

			<rect x="11" y="1" width="1" height="1" fill="#d7f1ff" />
			<rect x="4" y="3" width="1" height="1" fill="#d7f1ff" />
			<rect x="19" y="3" width="1" height="1" fill="#d7f1ff" />
		</svg>
	);
}
