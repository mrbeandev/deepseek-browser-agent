import { useState } from "react";
import {
	X,
	Settings as SettingsIcon,
	History,
	Eye,
	EyeOff,
	Loader2,
	Check,
	ShieldAlert,
	Building,
	Pencil,
	Trash2,
	Compass,
	AlertTriangle,
	Cpu,
	ChevronDown,
	Image as ImageIcon,
	Sparkles,
	Terminal,
	Save,
	Database,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatBytes, WARN_RATIO, CRITICAL_RATIO } from "@/lib/storage";
import { Textarea } from "./ui/textarea";
import { Switch } from "./ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "./ui/select";

const AVAILABLE_TOOLS = [
	{
		key: "get_page_summary_content",
		name: "Scrape Page Text",
		desc: "Extracts the readable text content from the active webpage."
	},
	{
		key: "extract_all_links",
		name: "Extract Links",
		desc: "Collects and lists all hyperlinks found on the webpage."
	},
	{
		key: "query_dom_elements",
		name: "Query DOM Structure",
		desc: "Queries interactive elements on the page via CSS selectors."
	},
	{
		key: "click_element",
		name: "Click Element",
		desc: "Clicks buttons, links, or form elements dynamically."
	},
	{
		key: "fill_input",
		name: "Fill Input Fields",
		desc: "Types text values directly into inputs or textareas."
	},
	{
		key: "scroll_to_element",
		name: "Scroll Page",
		desc: "Scrolls the page up, down, or to a specific selector."
	},
	{
		key: "navigate_to",
		name: "Navigate Tab URL",
		desc: "Navigates the active browser tab to a different URL."
	},
	{
		key: "highlight_text",
		name: "Highlight Keyword Matches",
		desc: "Finds and highlights search terms in the active DOM."
	},
	{
		key: "list_open_tabs",
		name: "List Shared Tabs",
		desc: "Lists the tabs inside the agent's tab group. Tabs outside the group stay private."
	},
	{
		key: "switch_to_tab",
		name: "Target Another Shared Tab",
		desc: "Points the agent at a different tab in its group without bringing it to the foreground."
	},
	{
		key: "open_tab",
		name: "Open Tab In Group",
		desc: "Opens a URL as a new background tab inside the agent's tab group."
	},
	{
		key: "close_tab",
		name: "Close Tab In Group",
		desc: "Closes a tab inside the agent's tab group when it is no longer needed."
	},
	{
		key: "use_current_tab",
		name: "Take The Tab You Are On",
		desc: "Lets the agent see the title and URL of your current tab, and move it into its group when you ask it to work on that page. Turn this off to keep your current tab completely private."
	},
	{
		key: "get_device_details",
		name: "Device & Privacy Details",
		desc: "Exposes host OS, CPU core counts, localization, and connection."
	},
	{
		key: "execute_js_in_page",
		name: "Inject Custom Script (Scripting API)",
		desc: "Runs custom JavaScript code directly in the active tab context using Chrome's Scripting API."
	},
	{
		key: "get_page_diagnostics",
		name: "Page Diagnostics (Scripting API)",
		desc: "Diagnoses active tab response times, load times, meta headers, and document health using Chrome's Scripting API."
	},
	{
		key: "take_screenshot",
		name: "Screenshot Page",
		desc: "Captures the visible area of the agent's target tab and sends it to the model.",
		visionOnly: true
	},
	{
		key: "screenshot_element",
		name: "Screenshot Element",
		desc: "Captures a single element of the agent's target tab and sends it to the model.",
		visionOnly: true
	}
];

/**
 * Explanation lives in a tooltip, not on screen. Settings read as a short list of
 * labels; the detail is one hover away.
 */
const HelpDot = ({ children }) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<span
				role="button"
				tabIndex={0}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
				}}
				className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help select-none items-center justify-center rounded-full border border-border font-mono text-[8px] font-bold leading-none text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				?
			</span>
		</TooltipTrigger>
		<TooltipContent className="custom-tooltip max-w-[220px] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-normal text-popover-foreground shadow-2xl">
			{children}
		</TooltipContent>
	</Tooltip>
);

const FieldLabel = ({ children, help, className = "" }) => (
	<div className={`flex items-center gap-1.5 ${className}`}>
		<label className="text-[11px] font-bold text-zinc-400">{children}</label>
		{help && <HelpDot>{help}</HelpDot>}
	</div>
);

/**
 * Square toggle tile. In a palette with no hue, ON is carried by inverting the
 * surface entirely — the strongest signal available — rather than by a coloured
 * switch. Three of these wrap down to two, then one, as the panel narrows.
 */
const ToggleTile = ({ icon: Icon, label, help, checked, onChange }) => (
	<label
		className={`group relative flex min-w-[96px] flex-1 basis-[96px] cursor-pointer select-none flex-col justify-between gap-2 rounded-lg border p-2.5 transition-all duration-150 focus-within:ring-1 focus-within:ring-ring ${
			checked ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground"
		}`}
	>
		<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />

		<div className="flex items-start justify-between gap-1">
			<Icon className="h-3.5 w-3.5 shrink-0" />
			{help && <HelpDot>{help}</HelpDot>}
		</div>

		<div className="flex flex-col gap-1">
			<span className="text-[10px] font-bold leading-tight">{label}</span>
			<span className={`font-mono text-[9px] font-bold uppercase tracking-widest ${checked ? "opacity-70" : "opacity-50"}`}>{checked ? "On" : "Off"}</span>
		</div>
	</label>
);

export const SettingsDialog = ({
	showSettings,
	setShowSettings,
	settingsTab,
	setSettingsTab,
	apiKey,
	setApiKey,
	showKey,
	setShowKey,
	endpoint,
	setEndpoint,
	model,
	setModel,
	enableThinking,
	setEnableThinking,
	reasoningEffort,
	setReasoningEffort,
	showToolCallsDetail,
	setShowToolCallsDetail,
	systemPrompt,
	setSystemPrompt,
	temperature,
	setTemperature,
	maxTokens,
	setMaxTokens,
	maxIterations,
	setMaxIterations,
	isTestingKey,
	handleTestApiKey,
	testResult,
	apiBalance,
	isFetchingBalance,
	fetchApiBalance,
	saveConfiguration,
	saveSuccess,
	saveError,
	isSaving,
	supportsImages,
	setSupportsImages,
	storageUsage,
	storageBlocked,
	handleFreeUpSpace,
	handleCompactSession,
	sessionSizes,
	chatMetadata,
	editingSessionKey,
	setEditingSessionKey,
	editingTitleText,
	setEditingTitleText,
	handleSaveTitle,
	handleStartEditTitle,
	handleDeleteSession,
	handleLoadSession,
	getChatKey,
	enabledTools,
	setEnabledTools,
	fetchedModels,
	isFetchingModels,
	fetchAvailableModels,
}) => {
	const [showDropdown, setShowDropdown] = useState(false);
	return (
		<div className={`absolute right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-[#07090e] shadow-2xl transition-transform duration-300 ease-out ${showSettings ? "translate-x-0" : "translate-x-full"}`}>
			<div className="flex items-center justify-between border-b border-border bg-[#0e1118]/80 p-3">
				<h2 className="text-xs font-bold tracking-tight text-zinc-200">Configuration Settings</h2>
				<Button variant="ghost" size="icon-xs" onClick={() => setShowSettings(false)} className="border border-zinc-800/40 text-zinc-400 hover:text-foreground">
					<X className="h-3.5 w-3.5" />
				</Button>
			</div>

			{/* Storage budget lives above the tabs: it governs whether ANY tab's changes
			    can be written at all, so it is panel chrome, not a preference. */}
			{storageUsage &&
				(() => {
					const ratio = Math.min(storageUsage.ratio || 0, 1);
					const pct = Math.round(ratio * 100);
					const isCritical = storageBlocked || ratio >= CRITICAL_RATIO;
					const isWarn = !isCritical && ratio >= WARN_RATIO;
					const barColor = isCritical ? "bg-rose-500" : isWarn ? "bg-amber-500" : "bg-foreground/70";
					const textColor = isCritical ? "text-rose-400" : isWarn ? "text-amber-400" : "text-zinc-400";

					return (
						<div className="shrink-0 border-b border-border bg-zinc-950/20 px-3 py-2">
							<div className="flex items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-1.5">
									<Database className="h-3 w-3 shrink-0 text-zinc-500" />
									<span className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-500">Storage</span>
									<HelpDot>Chrome caps extension storage at 10 MB. Over-quota writes fail outright, so chats pause rather than pretend to save. Delete or compact sessions in the Sessions tab to recover space.</HelpDot>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<span className="font-mono text-[10px] text-zinc-500">
										{formatBytes(storageUsage.bytes)} / {formatBytes(storageUsage.quota)}
									</span>
									<span className={`font-mono text-[10px] font-bold tabular-nums ${textColor}`}>{pct}%</span>
									{(isWarn || isCritical) && (
										<button type="button" onClick={handleFreeUpSpace} className="cursor-pointer rounded border border-border bg-transparent px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-foreground transition-colors hover:border-foreground">
											Free up
										</button>
									)}
								</div>
							</div>

							<div className="mt-1.5 h-1 w-full overflow-hidden rounded-full border border-border bg-zinc-950">
								<div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.max(pct, 2)}%` }} />
							</div>

							{storageBlocked && (
								<span className="mt-1.5 flex items-start gap-1 text-[10px] leading-normal text-rose-400">
									<AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
									<span>Storage is full. Chats are paused until you free some space.</span>
								</span>
							)}
						</div>
					);
				})()}

			{/* Tab selection for Settings Preferences vs Tools vs Saved Sessions */}
			<div className="border-zinc-850 flex shrink-0 border-b bg-zinc-950/20 px-2 py-1">
				<button onClick={() => setSettingsTab("preferences")} className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${settingsTab === "preferences" ? "border border-zinc-800/60 bg-zinc-900/60 text-blue-400" : "border border-transparent bg-transparent text-zinc-500 hover:text-zinc-300"}`}>
					<SettingsIcon className="h-3.5 w-3.5" />
					<span>Preferences</span>
				</button>
				<button onClick={() => setSettingsTab("tools")} className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${settingsTab === "tools" ? "border border-zinc-800/60 bg-zinc-900/60 text-blue-400" : "border border-transparent bg-transparent text-zinc-500 hover:text-zinc-300"}`}>
					<Cpu className="h-3.5 w-3.5" />
					<span>Tools</span>
				</button>
				<button onClick={() => setSettingsTab("sessions")} className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${settingsTab === "sessions" ? "border border-zinc-800/60 bg-zinc-900/60 text-blue-400" : "text-zinc-555 border border-transparent bg-transparent hover:text-zinc-300"}`}>
					<History className="h-3.5 w-3.5" />
					<span>Sessions</span>
				</button>
			</div>

			<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
				{settingsTab === "preferences" ? (
					<>
						<div className="flex flex-col gap-1.5">
							<FieldLabel help="Your provider key. Stored locally in this browser only and sent straight to the endpoint below — it never passes through any server of ours.">Deepseek API Key</FieldLabel>
							<div className="relative flex items-center">
								<Input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="placeholder-zinc-750 border-zinc-800 bg-zinc-950/40 pr-10 font-mono text-xs text-foreground focus-visible:ring-blue-600/35" />
								<Button type="button" variant="ghost" size="icon-xs" onClick={() => setShowKey(!showKey)} className="text-zinc-550 absolute right-1 hover:bg-transparent hover:text-zinc-200">
									{showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
								</Button>
							</div>

							{/* Test API Key Connection Button & Status */}
							<div className="mt-1 flex items-center justify-between">
								<Button type="button" variant="outline" size="xs" onClick={handleTestApiKey} disabled={isTestingKey} className="hover:bg-zinc-850 h-6 rounded border-zinc-800 bg-zinc-900/60 px-2.5 text-[11px] font-bold text-zinc-300 transition-all hover:text-foreground">
									{isTestingKey ? (
										<>
											<Loader2 className="mr-1 h-3 w-3 animate-spin text-blue-500" />
											Testing...
										</>
									) : (
										"Test Connection"
									)}
								</Button>

								{testResult && (
									<div className={`animate-fade-in flex items-center gap-1 text-[11px] font-medium ${testResult.success ? "text-emerald-400" : "text-rose-400"}`}>
										{testResult.success ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-500" />}
										<span className="max-w-[130px] truncate" title={testResult.message}>
											{testResult.message}
										</span>
									</div>
								)}
							</div>
						</div>

						{/* Deepseek API Balance Card */}
						{endpoint && endpoint.toLowerCase().includes("deepseek.com") && (
							apiBalance ? (
								<div className="animate-fade-in mt-0.5 flex flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5">
									<div className="flex items-center justify-between">
										<span className="text-[11px] font-bold text-zinc-400">Deepseek Balance</span>
										<button type="button" onClick={fetchApiBalance} disabled={isFetchingBalance} className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-mono text-[11px] text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50">
											<span>{isFetchingBalance ? "Refreshing..." : "Refresh"}</span>
										</button>
									</div>
									<div className="mt-0.5 flex items-baseline gap-1">
										<span className="text-zinc-150 font-mono text-sm font-extrabold">{apiBalance.total}</span>
										<span className="font-mono text-[11px] font-bold text-zinc-500">{apiBalance.currency}</span>
										{!apiBalance.available && <span className="ml-2 rounded-sm border border-rose-500/20 bg-rose-500/10 px-1 text-[11px] font-bold text-rose-400">UNAVAILABLE</span>}
									</div>
								</div>
							) : (
								apiKey && (
									<div className="mt-0.5 flex justify-end">
										<button type="button" onClick={fetchApiBalance} disabled={isFetchingBalance} className="cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50">
											{isFetchingBalance ? "Loading balance..." : "Show current balance"}
										</button>
									</div>
								)
							)
						)}

						<div className="flex flex-col gap-1.5">
							<FieldLabel help="Any OpenAI-compatible base URL. Point it at DeepSeek, a self-hosted gateway, or a router. Include the version path if the provider needs one.">API Endpoint</FieldLabel>
							<Input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="border-zinc-800 bg-zinc-950/40 text-xs text-foreground placeholder-zinc-700 focus-visible:ring-blue-600/35" />
						</div>

						<div className="flex flex-col gap-1.5 relative">
							<div className="flex items-center justify-between">
								<FieldLabel help="Type any model id, or hit Fetch Models to list what the endpoint offers. Custom ids are accepted — the list is a convenience, not a restriction.">Preferred AI Model</FieldLabel>
								<button
									type="button"
									onClick={() => fetchAvailableModels()}
									disabled={isFetchingModels || !apiKey || !endpoint}
									className="cursor-pointer border-none bg-transparent p-0 text-[10px] font-bold text-blue-400 hover:text-blue-300 disabled:opacity-50"
								>
									{isFetchingModels ? "Fetching..." : "Fetch Models"}
								</button>
							</div>
							<div className="relative">
								<Input
									type="text"
									value={model}
									onChange={(e) => {
										setModel(e.target.value);
										setShowDropdown(true);
									}}
									onFocus={() => setShowDropdown(true)}
									onBlur={() => {
										// Use 200ms timeout so that mouse down events on items execute first
										setTimeout(() => setShowDropdown(false), 200);
									}}
									placeholder="Search or enter model name (e.g. gpt-4o)"
									className="h-8 w-full border-zinc-800 bg-zinc-950/40 text-xs text-foreground placeholder-zinc-700 focus-visible:ring-blue-600/35"
								/>
								{showDropdown && (
									<div className="absolute left-0 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-1 shadow-xl z-50">
										{(() => {
											const term = (model || "").toLowerCase().trim();
											const filtered = fetchedModels.filter(m => m.toLowerCase().includes(term));
											const isExactMatch = fetchedModels.some(m => m.toLowerCase() === term);

											return (
												<>
													{filtered.length > 0 ? (
														filtered.map((m) => (
															<button
																key={m}
																type="button"
																onMouseDown={() => setModel(m)}
																className="flex w-full cursor-pointer items-center rounded px-2.5 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-blue-600/10 hover:text-blue-400 border-none bg-transparent"
															>
																{m}
															</button>
														))
													) : (
														<div className="px-2.5 py-1.5 text-xs text-zinc-500">No matching models found</div>
													)}

													{term.length > 0 && !isExactMatch && (
														<button
															type="button"
															onMouseDown={() => setModel(model)}
															className="flex w-full cursor-pointer items-center gap-1.5 rounded border-t border-zinc-900 bg-transparent px-2.5 py-1.5 text-left text-xs font-semibold text-blue-400 transition-colors hover:bg-blue-600/10"
														>
															<span>✨</span> Use custom name: "{model}"
														</button>
													)}
												</>
											);
										})()}
									</div>
								)}
							</div>
						</div>

						{/* Three switches, one row, square tiles. They wrap to 2-up then 1-up as
						    the panel narrows. All sub-copy has moved into the help tooltips. */}
						<div className="flex flex-wrap gap-2">
							<ToggleTile
								icon={ImageIcon}
								label="Image model"
								checked={supportsImages}
								onChange={setSupportsImages}
								help="Turn on only if the selected model accepts images. Adds the screenshot tools and sends page captures to the model. Text-only models will reject image content, and vision requests cost noticeably more tokens."
							/>
							<ToggleTile
								icon={Sparkles}
								label="Deep thinking"
								checked={enableThinking}
								onChange={setEnableThinking}
								help="Streams the model's chain-of-thought block above its answer. Thinking mode still supports concurrent DOM tool calling."
							/>
							<ToggleTile
								icon={Terminal}
								label="Tool detail"
								checked={showToolCallsDetail}
								onChange={setShowToolCallsDetail}
								help="Shows every tool call step by step in the transcript instead of collapsing them into a single summary line."
							/>
						</div>

						{enableThinking && (
							<div className="animate-fade-in flex flex-col gap-1.5">
								<FieldLabel help="How long the model is allowed to reason before answering. Higher effort is slower and costs more tokens, but handles multi-step browser tasks far better.">Reasoning Effort</FieldLabel>
								<Select value={reasoningEffort} onValueChange={(val) => setReasoningEffort(val)}>
									<SelectTrigger className="h-7 w-full border-zinc-800 bg-zinc-950/40 text-xs text-zinc-300 focus-visible:ring-blue-600/35">
										<SelectValue placeholder="Select effort" />
									</SelectTrigger>
									<SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-300">
										<SelectItem value="low" className="text-xs focus:bg-blue-600/10 focus:text-blue-400">
											Low
										</SelectItem>
										<SelectItem value="medium" className="text-xs focus:bg-blue-600/10 focus:text-blue-400">
											Medium
										</SelectItem>
										<SelectItem value="high" className="text-xs focus:bg-blue-600/10 focus:text-blue-400">
											High (Recommended)
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}

											{/* Set once, rarely touched — folded away so it stops dominating the panel. */}
						<details className="group rounded-xl border border-zinc-800 bg-zinc-900/40 open:pb-3">
							<summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3">
								<div className="flex items-center gap-1.5">
									<span className="text-[11px] font-bold text-zinc-400">Agent System Instructions</span>
									<HelpDot>The agent&apos;s standing brief — its persona, tone, and house rules. Prepended to every request. Mostly a one-time setup; leave it alone unless you want to change how the agent behaves across all chats.</HelpDot>
								</div>
								<ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180" />
							</summary>
							<div className="px-3">
								<Textarea rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="h-[18vh] resize-none border border-zinc-800 bg-zinc-950/40 font-sans text-xs leading-relaxed text-zinc-300 focus-visible:ring-blue-600/35" />
							</div>
						</details>

						<div className="flex gap-2">
							<div className="flex w-[30%] flex-col gap-1.5">
								<FieldLabel help="Sampling temperature, 0 to 2. Low values keep the agent literal and repeatable, which is what browser automation wants. Ignored while deep thinking is on.">Temp</FieldLabel>
								<Input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="border-zinc-800 bg-zinc-950/40 pr-1 text-xs text-foreground focus-visible:ring-blue-600/35" />
							</div>
							<div className="flex w-[35%] flex-col gap-1.5">
								<FieldLabel help="Ceiling on the length of a single reply. Raise it if long page summaries are getting cut off mid-sentence.">Max Tokens</FieldLabel>
								<Input type="number" min="1" max="8192" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="border-zinc-800 bg-zinc-950/40 pr-1 text-xs text-foreground focus-visible:ring-blue-600/35" />
							</div>
							<div className="flex w-[35%] flex-col gap-1.5">
								<FieldLabel help="How many tool calls the agent may chain before it must stop and report back. The safety brake on a task that loops.">Max Steps</FieldLabel>
								<Input type="number" min="1" max="100" value={maxIterations} onChange={(e) => setMaxIterations(e.target.value)} className="border-zinc-800 bg-zinc-950/40 pr-1 text-xs text-foreground focus-visible:ring-blue-600/35" />
							</div>
						</div>

					</>
				) : settingsTab === "tools" ? (
					<div className="flex flex-col gap-3 p-1">
						<div className="text-[11px] text-zinc-400 leading-relaxed mb-1 border-b border-zinc-850 pb-2 text-left">
							Toggle individual capabilities to control the agent's action boundaries and privacy permissions. Disabled tools will be completely hidden from the AI models.
						</div>
						{!supportsImages && (
							<div className="flex items-start gap-1.5 rounded-lg border border-zinc-850 bg-zinc-950/60 p-2.5 text-[11px] leading-normal text-zinc-500">
								<AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-600" />
								<span>Screenshot tools are hidden. Turn on &quot;Image-capable model&quot; in Preferences to enable them.</span>
							</div>
						)}
						{AVAILABLE_TOOLS.filter((tool) => !tool.visionOnly || supportsImages).map((tool) => (
							<div key={tool.key} className="flex items-start justify-between gap-3 p-2.5 border border-zinc-900 bg-zinc-950/40 rounded-xl transition-colors hover:border-zinc-800/80">
								<div className="flex flex-col gap-1 flex-1 text-left">
									<div className="flex flex-wrap items-center gap-1.5">
										<span className="text-[11px] font-bold text-zinc-200">{tool.name}</span>
										{tool.required && (
											<span className="rounded bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-400 select-none leading-none">Required</span>
										)}
										<span className="text-[11px] font-mono text-zinc-550 bg-zinc-950 border border-zinc-900 px-1 py-0.5 rounded select-all leading-none">{tool.key}</span>
									</div>
									<span className="text-[11px] text-zinc-400 leading-normal">{tool.desc}</span>
								</div>
								<Switch
									checked={tool.required ? true : (enabledTools[tool.key] !== false)}
									disabled={tool.required}
									onCheckedChange={(checked) => {
										setEnabledTools((prev) => ({
											...prev,
											[tool.key]: checked,
										}));
									}}
								/>
							</div>
						))}
					</div>
				) : (
					<div className="flex flex-col gap-2 p-1">
						{Object.values(chatMetadata).length > 0 && (
							<Button
								variant="outline"
								size="xs"
								onClick={() => {
									chrome.tabs.create({ url: chrome.runtime.getURL("sessions.html") });
								}}
								className="w-full justify-center gap-1.5 border-zinc-800 bg-zinc-950/40 text-[11px] text-blue-400 hover:bg-zinc-900/60 hover:text-blue-300 rounded-lg h-7 font-bold uppercase tracking-wider mb-2 cursor-pointer transition-all"
							>
								<Compass className="h-3.5 w-3.5" />
								<span>More Info</span>
							</Button>
						)}
						{Object.values(chatMetadata).length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
								<History className="text-zinc-650 h-8 w-8 animate-pulse" />
								<p className="text-[11px] font-medium text-zinc-500">No saved sessions yet.</p>
								<p className="text-zinc-650 max-w-[180px] text-center text-[11px]">Start a conversation to automatically save history logs.</p>
							</div>
						) : (
							Object.values(chatMetadata)
								.sort((a, b) => b.timestamp - a.timestamp)
								.map((session) => {
									const dateStr = new Date(session.timestamp).toLocaleString();
									const isActive = getChatKey() === session.key;
									const sessionBytes = (sessionSizes && sessionSizes[session.key]) || 0;

									return (
										<div key={session.key} onClick={() => handleLoadSession(session)} className={`group relative flex cursor-pointer select-none flex-col gap-2.5 rounded-xl border p-3 transition-all duration-200 ${isActive ? "border-blue-500/40 bg-blue-600/5 shadow-[0_0_10px_rgba(59,130,246,0.05)] hover:border-blue-500/60" : "border-zinc-900 bg-zinc-950/40 hover:border-zinc-800/80 hover:bg-zinc-900/10"}`}>
											<div className="flex items-start justify-between gap-2">
												{editingSessionKey === session.key ? (
													<div className="mr-4 flex flex-1 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
														<Input
															value={editingTitleText}
															onChange={(e) => setEditingTitleText(e.target.value)}
															onKeyDown={(e) => {
																if (e.key === "Enter") {
																	handleSaveTitle(session.key);
																} else if (e.key === "Escape") {
																	setEditingSessionKey(null);
																}
															}}
															onBlur={() => handleSaveTitle(session.key)}
															autoFocus
															className="h-6 rounded border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[11px] text-zinc-200 focus-visible:ring-1 focus-visible:ring-blue-500"
														/>
													</div>
												) : (
													<div className="flex flex-1 items-center gap-2 truncate">
														<span className="shrink-0"><History className="h-3.5 w-3.5 text-blue-500 shrink-0" /></span>
														<h3 className={`truncate text-[11px] font-bold ${isActive ? "text-blue-400" : "text-zinc-200 group-hover:text-foreground"}`} title={session.title}>
															{session.title}
														</h3>
														<Tooltip>
															<TooltipTrigger asChild>
																<button onClick={(e) => handleStartEditTitle(session, e)} className="text-zinc-550 shrink-0 cursor-pointer rounded border-none bg-transparent p-0.5 transition-colors hover:text-zinc-200">
																	<Pencil className="h-3 w-3" />
																</button>
															</TooltipTrigger>
															<TooltipContent>
																<span>Rename Session</span>
															</TooltipContent>
														</Tooltip>
													</div>
												)}

												{/* Delete Session Button */}
												<Tooltip>
													<TooltipTrigger asChild>
														<button onClick={(e) => handleDeleteSession(session.key, e)} className="text-zinc-650 shrink-0 cursor-pointer rounded border-none bg-transparent p-0.5 opacity-0 transition-opacity hover:bg-zinc-900 hover:text-rose-400 group-hover:opacity-100">
															<Trash2 className="h-3.5 w-3.5" />
														</button>
													</TooltipTrigger>
													<TooltipContent>
														<span>Delete Session</span>
													</TooltipContent>
												</Tooltip>
											</div>

											{/* Professional Webpage / Domain Link Display */}
											{(session.url && session.url !== "none" && session.url !== "") || (session.domain && session.domain !== "none" && session.domain !== "") ? (
												<div className="flex flex-col gap-1 font-mono text-[11px]">
													{session.domain && session.domain !== "none" && session.domain !== "" && (
														<div className="flex max-w-full items-center gap-1.5 rounded-md border border-zinc-900 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-500">
															<Building className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />
															<span className="flex-1 truncate text-zinc-400">{session.domain}</span>
														</div>
													)}
													{session.url && session.url !== "none" && session.url !== "" && (
														<div className="flex max-w-full items-center gap-1.5 overflow-hidden rounded-md border border-zinc-900 bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300">
															<Compass className="h-3.5 w-3.5 shrink-0 text-blue-500/70" />
															<span className="flex-1 truncate text-zinc-400" title={session.url}>
																{session.url}
															</span>
														</div>
													)}
												</div>
											) : null}

											<div className="mt-1 flex items-center justify-between text-[11px] text-zinc-600">
												<div className="flex items-center gap-1.5">
													<span className="font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-500 select-none">{formatBytes(sessionBytes)}</span>
													{sessionBytes > 200 * 1024 && (
														<Tooltip>
															<TooltipTrigger asChild>
																<button
																	onClick={(e) => handleCompactSession(session.key, e)}
																	className="cursor-pointer rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500/80 transition-colors hover:border-amber-500/40 hover:text-amber-400"
																>
																	Compact
																</button>
															</TooltipTrigger>
															<TooltipContent>
																<span>Shorten long tool results in this session to reclaim space</span>
															</TooltipContent>
														</Tooltip>
													)}
												</div>
												<span className="font-sans font-medium">{dateStr}</span>
											</div>

											{isActive && (
												<span className="absolute right-1 top-1 flex h-1.5 w-1.5">
													<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
													<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500"></span>
												</span>
											)}
										</div>
									);
								})
						)}
					</div>
				)}
			</div>

			{/* Sticky action bar. Saving keeps the panel open and reports its own state —
			    closing a settings drawer on save hides whether the write actually landed. */}
			{settingsTab === "preferences" && (
				<div className="shrink-0 border-t border-border bg-card p-3">
					{saveError && (
						<div className="animate-fade-in mb-2 flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] leading-normal text-rose-300">
							<ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
							<span>{saveError}</span>
						</div>
					)}

					<Button
						onClick={saveConfiguration}
						disabled={isSaving}
						className={`w-full cursor-pointer rounded-lg py-2 text-center text-xs font-bold transition-all duration-200 disabled:opacity-60 ${
							saveSuccess ? "bg-foreground/15 text-foreground ring-1 ring-inset ring-foreground/35" : "bg-foreground text-background hover:bg-foreground/85"
						}`}
					>
						{isSaving ? (
							<>
								<Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
								Saving…
							</>
						) : saveSuccess ? (
							<>
								<Check className="mr-1.5 h-3.5 w-3.5" />
								Saved
							</>
						) : (
							<>
								<Save className="mr-1.5 h-3.5 w-3.5" />
								Save Configuration
							</>
						)}
					</Button>
				</div>
			)}
		</div>
	);
};
