import { Folder } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { storageData } from "./file-manager-dashboard-models";

export function FileManagerDashboardStoragePanel() {
	return (
		<>
			<Panel className="mb-6" padding="lg">
				<h3 className="mb-6 text-lg font-semibold">Storage usage</h3>
				<div className="mb-6 flex flex-col items-center">
					<div className="relative mb-4 h-32 w-32">
						<svg className="h-32 w-32 -rotate-90 transform" viewBox="0 0 36 36">
							<path
								d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								className="text-muted"
							/>
							<path
								d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeDasharray="65, 100"
								className="[color:var(--primary)]"
							/>
						</svg>
						<div className="absolute inset-0 flex flex-col items-center justify-center">
							<Folder className="text-muted-foreground mb-1 h-6 w-6" />
							<div className="text-2xl font-bold">104.6 GB</div>
							<div className="text-muted-foreground text-xs">of 256 GB</div>
						</div>
					</div>
				</div>

				<div className="space-y-4">
					{storageData.map((item) => (
						<div key={item.type} className="flex items-center gap-3">
							<div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
								<item.icon className="text-muted-foreground h-4 w-4" />
							</div>
							<div className="flex-1">
								<div className="mb-1 flex items-center justify-between">
									<span className="text-sm font-medium">{item.type}</span>
								</div>
								<div className="text-muted-foreground text-xs">
									{item.files} Files | {item.size}
								</div>
							</div>
						</div>
					))}
				</div>
			</Panel>

			<Panel padding="lg">
				<div className="text-center">
					<div className="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
						<div className="border-muted-foreground flex h-6 w-6 items-center justify-center rounded-full border-2">
							<span className="text-xs font-bold">$</span>
						</div>
					</div>
					<h3 className="mb-2 font-semibold">Get more space for your files</h3>
					<p className="text-muted-foreground mb-4 text-sm">
						Upgrade your account to pro to get more storage
					</p>
					<Button variant="secondary" fluid>
						Upgrade to pro
					</Button>
				</div>
			</Panel>
		</>
	);
}
