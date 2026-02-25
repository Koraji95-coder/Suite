// src/components/Footer.tsx

export default function Footer() {
	return (
		<footer>
			<div style={{ maxWidth: 1160, margin: "0 auto" }}>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "2fr 1fr 1fr 1fr",
						gap: 48,
						marginBottom: 48,
					}}
				>
					<div>
						<a
							href="#hero"
							className="nav-logo"
							style={{ marginBottom: 14, display: "inline-flex" }}
						>
							<div className="nav-logo-mark" style={{ width: 26, height: 26 }}>
								<span />
								<span />
								<span />
								<span />
							</div>
							<span className="nav-logo-name" style={{ fontSize: 14 }}>
								BlockFlow
							</span>
						</a>
						<p
							style={{
								fontSize: 13,
								fontWeight: 300,
								color: "var(--white-faint)",
								lineHeight: 1.6,
								maxWidth: 240,
							}}
						>
							The modern component platform for teams who build at scale.
						</p>
					</div>

					{[
						{
							title: "Product",
							links: ["Features", "Changelog", "Docs", "Status"],
						},
						{
							title: "Company",
							links: ["About", "Blog", "Careers", "Contact"],
						},
						{ title: "Legal", links: ["Privacy", "Terms", "Security"] },
					].map((col) => (
						<div key={col.title}>
							<div
								style={{
									fontSize: 11,
									letterSpacing: "0.1em",
									textTransform: "uppercase",
									color: "var(--white-faint)",
									marginBottom: 16,
								}}
							>
								{col.title}
							</div>
							<ul
								style={{
									listStyle: "none",
									display: "flex",
									flexDirection: "column",
									gap: 10,
								}}
							>
								{col.links.map((l) => (
									<li key={l}>
										<a
											href="#"
											style={{
												fontSize: 13.5,
												fontWeight: 300,
												color: "var(--white-faint)",
												textDecoration: "none",
											}}
										>
											{l}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div
					style={{
						borderTop: "1px solid var(--border)",
						paddingTop: 24,
						display: "flex",
						justifyContent: "space-between",
					}}
				>
					<span
						style={{
							fontSize: 12,
							fontWeight: 300,
							color: "var(--white-faint)",
						}}
					>
						© 2026 BlockFlow, Inc. All rights reserved.
					</span>
					<span
						style={{
							fontSize: 12,
							fontWeight: 300,
							color: "var(--white-faint)",
						}}
					>
						Built with React • Vite • Three
					</span>
				</div>
			</div>
		</footer>
	);
}
