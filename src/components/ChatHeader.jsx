import { Plus, Copy, Sun, Moon, Terminal, Settings, FolderPlus } from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

export const ChatHeader = ({
	activeFavicon,
	activeDomain,
	theme,
	showToolCallsDetail,
	showSettings,
	handleNewChat,
	handleCopyDebugLogs,
	handleToggleTheme,
	setShowToolCallsDetail,
	setShowSettings,
	fetchApiBalance,
	persistSetting,
	handleShareCurrentTab,
}) => {
	return (
		<header className="z-30 flex items-center justify-between border-b border-border bg-card p-2.5 shadow-sm">
			<div className="flex min-w-0 max-w-[55%] items-center gap-2">
				<img
					src={activeFavicon}
					className="h-5 w-5 flex-shrink-0 rounded-md border border-zinc-800 bg-zinc-900 object-contain p-0.5"
					alt="favicon"
					onError={(e) => {
						e.target.src = "icons/icon16.png";
					}}
				/>
				<div className="flex min-w-0 flex-col">
					<span className="text-zinc-555 mb-0.5 text-xs font-bold uppercase leading-none tracking-wider">Agent Target</span>
					<span className="truncate text-[11px] font-semibold leading-tight text-zinc-200">{activeDomain}</span>
				</div>
			</div>

			<div className="flex flex-shrink-0 items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-xs" onClick={handleShareCurrentTab} className="border border-zinc-800/40 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200">
							<FolderPlus className="h-3.5 w-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent className="custom-tooltip max-w-[220px] rounded-lg border border-zinc-850 bg-[#0e1118] px-2.5 py-1.5 text-[11px] leading-normal text-zinc-300 shadow-2xl">
						<span>Share the tab you are looking at with the agent</span>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-xs" onClick={handleNewChat} className="border border-zinc-800/40 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200">
							<Plus className="h-3.5 w-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<span>New Chat</span>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-xs" onClick={handleCopyDebugLogs} className="border border-zinc-800/40 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200">
							<Copy className="h-3 w-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<span>Copy Debug Logs</span>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon-xs" onClick={handleToggleTheme} className="border border-zinc-800/40 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200">
							{theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<span>{theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={showToolCallsDetail ? "secondary" : "ghost"}
							size="icon-xs"
							onClick={() => {
								const next = !showToolCallsDetail;
								setShowToolCallsDetail(next);
								persistSetting({ showToolCallsDetail: next });
							}}
							className={`border transition-all duration-200 ${showToolCallsDetail ? "border-blue-500/35 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300" : "border-zinc-800/40 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 opacity-60"}`}
						>
							<Terminal className={`h-3.5 w-3.5 ${showToolCallsDetail ? "animate-pulse" : ""}`} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<span>{showToolCallsDetail ? "Hide Tool Call Details" : "Show Tool Call Details"}</span>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={showSettings ? "secondary" : "ghost"}
							size="icon-xs"
							onClick={() => {
								const next = !showSettings;
								setShowSettings(next);
								if (next) fetchApiBalance();
							}}
							className="border border-zinc-800/40 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
						>
							<Settings className="h-3 w-3" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<span>Settings</span>
					</TooltipContent>
				</Tooltip>
			</div>
		</header>
	);
};
