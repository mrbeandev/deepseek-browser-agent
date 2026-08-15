import { useState, useEffect, useMemo, useRef } from "react";
import ReactDOM from "react-dom/client";
import {
	Trash2,
	Search,
	Compass,
	Calendar,
	ShieldAlert,
	Cpu,
	Sparkles,
	RefreshCw,
	BarChart2,
	ChevronDown,
	ChevronUp,
	Database,
	Info,
	Clock,
	Code,
	Sun,
	Moon
} from "lucide-react";
import "./index.css";
import {
	setStorage,
	getStorage,
	removeStorage,
	loadAllChats,
	sessionStorageKey,
	estimateSessionBytes,
	getStorageUsage,
	formatBytes,
	WARN_RATIO,
	CRITICAL_RATIO,
	CHAT_KEY_PREFIX,
} from "@/lib/storage";

// Helper to estimate individual message tokens (roughly 4 characters per token)
function estimateMessageTokens(msg) {
	if (!msg) return 0;
	let chars = 0;
	if (msg.content) chars += msg.content.length;
	if (msg.reasoning) chars += msg.reasoning.length;
	if (msg.toolCalls) {
		try {
			chars += JSON.stringify(msg.toolCalls).length;
		} catch (err) {
			console.warn("Failed to stringify tool calls in token estimation:", err);
		}
	}
	return Math.ceil(chars / 4);
}

// Helper to parse and highlight custom markdown for transcript bubbles
function renderMarkdown(text) {
	if (!text) return "";

	// Escape HTML characters
	let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

	// Code block highlighter
	const highlightCode = (code, lang) => {
		if (!lang) return code;
		const l = lang.toLowerCase();

		const getLetterID = (num) => {
			let s = "";
			let n = num;
			while (n >= 0) {
				s = String.fromCharCode((n % 26) + 97) + s;
				n = Math.floor(n / 26) - 1;
			}
			return s;
		};

		if (l === "bash" || l === "shell" || l === "sh") {
			let lines = code.split("\n");
			lines = lines.map(line => {
				const lineReplacements = [];
				let highlighted = line;
				if (line.trim().startsWith("#")) {
					return `<span class="text-zinc-500 font-mono italic">${line}</span>`;
				}
				highlighted = highlighted.replace(/(https?:\/\/[^\s]+)/g, (url) => {
					const key = getLetterID(lineReplacements.length);
					lineReplacements.push(`<span class="text-zinc-450 dark:text-zinc-550 underline font-mono">${url}</span>`);
					return `%%BASHREP${key}%%`;
				});
				highlighted = highlighted.replace(/(--?\w+)/g, (flag) => {
					const key = getLetterID(lineReplacements.length);
					lineReplacements.push(`<span class="text-amber-500 font-mono">${flag}</span>`);
					return `%%BASHREP${key}%%`;
				});
				for (let r = 0; r < lineReplacements.length; r++) {
					const key = getLetterID(r);
					highlighted = highlighted.replace(`%%BASHREP${key}%%`, lineReplacements[r]);
				}
				return highlighted;
			});
			return lines.join("\n");
		}

		if (l === "python" || l === "py") {
			let highlighted = code;
			const pythonReplacements = [];
			highlighted = highlighted.replace(/(#.*)$/gm, (comment) => {
				const key = getLetterID(pythonReplacements.length);
				pythonReplacements.push(`<span class="text-zinc-500 font-mono italic">${comment}</span>`);
				return `%%PYREP${key}%%`;
			});
			highlighted = highlighted.replace(/(".*?")/g, (str) => {
				const key = getLetterID(pythonReplacements.length);
				pythonReplacements.push(`<span class="text-emerald-500 font-mono">${str}</span>`);
				return `%%PYREP${key}%%`;
			});
			const keywords = ["def", "class", "import", "from", "as", "return", "if", "elif", "else", "for", "while", "try", "except", "with", "in", "and", "or", "not", "print", "self"];
			keywords.forEach(keyword => {
				const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
				highlighted = highlighted.replace(regex, (match) => {
					const key = getLetterID(pythonReplacements.length);
					pythonReplacements.push(`<span class="text-blue-500 font-bold font-mono">${match}</span>`);
					return `%%PYREP${key}%%`;
				});
			});
			for (let r = 0; r < pythonReplacements.length; r++) {
				const key = getLetterID(r);
				highlighted = highlighted.replace(`%%PYREP${key}%%`, pythonReplacements[r]);
			}
			return highlighted;
		}

		if (l === "json") {
			let highlighted = code;
			const jsonReplacements = [];
			highlighted = highlighted.replace(/(".*?")(\s*:)/g, (match, key, colon) => {
				const idKey = getLetterID(jsonReplacements.length);
				jsonReplacements.push(`<span class="text-blue-500 font-semibold font-mono">${key}</span>`);
				return `%%JSONREP${idKey}%%${colon}`;
			});
			highlighted = highlighted.replace(/(:\s*)(".*?")/g, (match, colon, val) => {
				const idKey = getLetterID(jsonReplacements.length);
				jsonReplacements.push(`<span class="text-emerald-500 font-mono">${val}</span>`);
				return `${colon}%%JSONREP${idKey}%%`;
			});
			highlighted = highlighted.replace(/\b(true|false|null)\b/g, (match) => {
				const idKey = getLetterID(jsonReplacements.length);
				jsonReplacements.push(`<span class="text-amber-500 font-bold font-mono">${match}</span>`);
				return `%%JSONREP${idKey}%%`;
			});
			for (let r = 0; r < jsonReplacements.length; r++) {
				const idKey = getLetterID(r);
				highlighted = highlighted.replace(`%%JSONREP${idKey}%%`, jsonReplacements[r]);
			}
			return highlighted;
		}

		return code;
	};

	// Code block placeholders
	const codeBlocks = [];
	html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
		const id = "code-" + Math.random().toString(36).substring(2, 10);
		const cleanLang = lang ? lang.trim() : "";
		const highlighted = highlightCode(code.trim(), cleanLang);
		const codeHtml = `
<div class="my-2 rounded-md overflow-hidden border border-zinc-800 bg-zinc-950/60 shadow-inner">
  <div class="flex justify-between items-center px-3 py-1.5 bg-zinc-900/80 text-[10px] text-zinc-400 font-sans border-b border-zinc-800 select-none">
    <span>${cleanLang ? cleanLang.toUpperCase() : "CODE"}</span>
  </div>
  <pre class="p-2.5 overflow-x-auto"><code id="${id}" class="font-mono text-zinc-300 text-xs block leading-relaxed">${highlighted}</code></pre>
</div>`;
		codeBlocks.push(codeHtml);
		return `\n%%CODE_BLOCK_${codeBlocks.length - 1}%%\n`;
	});

	// Formatting regexes
	html = html
		.replace(/^######\s+(.+)$/gm, '<h6 class="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mt-2 mb-1">$1</h6>')
		.replace(/^#####\s+(.+)$/gm, '<h5 class="text-[11px] font-semibold text-zinc-400 mt-2 mb-1">$1</h5>')
		.replace(/^####\s+(.+)$/gm, '<h4 class="text-xs font-bold text-zinc-300 mt-2 mb-1">$1</h4>')
		.replace(/^###\s+(.+)$/gm, '<h3 class="text-xs font-bold text-zinc-200 mt-2 mb-1">$1</h3>')
		.replace(/^##\s+(.+)$/gm, '<h2 class="text-sm font-bold text-zinc-100 border-b border-zinc-900 pb-0.5 mt-3 mb-1">$1</h2>')
		.replace(/^#\s+(.+)$/gm, '<h1 class="text-base font-extrabold text-zinc-100 mt-3 mb-2">$1</h1>')
		.replace(/^[-*_]{3,}$/gm, '<hr class="my-3 border-zinc-800" />')
		.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="my-2 pl-3 border-l-2 border-zinc-800 text-zinc-400 italic bg-zinc-950/20 py-1 px-2.5 rounded-r">$1</blockquote>')
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-500 hover:underline font-medium">$1</a>')
		.replace(/`([^`\n]+)`/g, '<code class="font-mono bg-zinc-950 px-1 py-0.5 rounded text-blue-500 text-[11px] border border-zinc-900">$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>')
		.replace(/\*([^*]+)\*/g, '<em class="text-zinc-300">$1</em>');

	// Tables formatting
	const lines = html.split("\n");
	let inList = false;
	let listType = null;

	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];

		const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
		const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);

		if (line.trim().startsWith("%%CODE_BLOCK_")) {
			// skip
		} else if (ulMatch) {
			if (!inList || listType !== "ul") {
				if (inList) lines[i - 1] += `</${listType}>`;
				line = `<ul class="list-disc list-inside pl-1 mb-1 text-xs"><li>${ulMatch[2]}</li>`;
				inList = true;
				listType = "ul";
			} else {
				line = `<li>${ulMatch[2]}</li>`;
			}
		} else if (olMatch) {
			if (!inList || listType !== "ol") {
				if (inList) lines[i - 1] += `</${listType}>`;
				line = `<ol class="list-decimal list-inside pl-1 mb-1 text-xs"><li>${olMatch[2]}</li>`;
				inList = true;
				listType = "ol";
			} else {
				line = `<li>${olMatch[2]}</li>`;
			}
		} else {
			if (inList) {
				lines[i - 1] += `</${listType}>`;
				inList = false;
				listType = null;
			}
			if (line.trim() !== "" && !line.startsWith("<h") && !line.startsWith("<div") && !line.startsWith("<pre") && !line.startsWith("<hr") && !line.startsWith("<block") && !line.startsWith("<ul") && !line.startsWith("<ol") && !line.startsWith("<li")) {
				line = `<p class="mb-1.5 text-xs leading-relaxed">${line}</p>`;
			}
		}
		lines[i] = line;
	}
	html = lines.join("\n");

	// Restore code block placeholders
	for (let c = 0; c < codeBlocks.length; c++) {
		html = html.replace(`%%CODE_BLOCK_${c}%%`, codeBlocks[c]);
	}

	return html;
}

// Collapsible Tool Call renderer for trace analysis
export function ToolTraceCard({ toolCall, toolMsg }) {
	const [isOpen, setIsOpen] = useState(false);
	const toolName = toolCall.function.name;
	const args = useMemo(() => {
		try {
			return JSON.parse(toolCall.function.arguments || "{}");
		} catch {
			return {};
		}
	}, [toolCall.function.arguments]);

	const result = useMemo(() => {
		if (!toolMsg) return null;
		try {
			return JSON.parse(toolMsg.content || "{}");
		} catch {
			return toolMsg.content;
		}
	}, [toolMsg]);

	const tokensCount = useMemo(() => {
		let totalChars = JSON.stringify(toolCall).length;
		if (toolMsg && toolMsg.content) totalChars += toolMsg.content.length;
		return Math.ceil(totalChars / 4);
	}, [toolCall, toolMsg]);

	return (
		<div className="rounded-xl border border-zinc-800 bg-[#0c0e14]/90 overflow-hidden shadow-md my-2.5">
			<div
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center justify-between px-3 py-2 bg-zinc-950/60 cursor-pointer hover:bg-zinc-900/40 transition-colors select-none"
			>
				<div className="flex items-center gap-2">
					<Cpu className="h-4 w-4 text-blue-500 shrink-0" />
					<span className="font-mono text-xs font-bold text-zinc-200">{toolName}</span>
					<span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/15 text-blue-500 font-bold uppercase tracking-wider select-none">
						Tool Call
					</span>
				</div>
				<div className="flex items-center gap-2.5">
					<span className="text-[10px] font-mono text-zinc-500 select-none">
						{tokensCount.toLocaleString()} tokens
					</span>
					{isOpen ? (
						<ChevronUp className="h-4 w-4 text-zinc-400" />
					) : (
						<ChevronDown className="h-4 w-4 text-zinc-400" />
					)}
				</div>
			</div>

			{isOpen && (
				<div className="p-3 border-t border-zinc-850/60 bg-zinc-950/20 text-xs flex flex-col gap-3 font-mono">
					{/* Arguments */}
					<div>
						<div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 select-none flex items-center gap-1">
							<Code className="h-3 w-3" /> Input Parameters (Arguments)
						</div>
						<pre className="p-2 rounded bg-zinc-950 border border-zinc-900 text-zinc-350 text-[11px] overflow-x-auto max-h-[160px] leading-relaxed font-mono">
							{JSON.stringify(args, null, 2)}
						</pre>
					</div>

					{/* Outputs */}
					{result && (
						<div>
							<div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 select-none flex items-center gap-1">
								<Database className="h-3 w-3" /> Returned Output Data
							</div>
							<pre className="p-2 rounded bg-[#090b10] border border-zinc-900 text-emerald-450 text-[11px] overflow-x-auto max-h-[220px] overflow-y-auto leading-relaxed font-mono">
								{typeof result === "object" ? JSON.stringify(result, null, 2) : String(result)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export function SessionsAnalyzer() {
	const [chats, setChats] = useState({});
	const [chatMetadata, setChatMetadata] = useState({});
	const [selectedSessionKey, setSelectedSessionKey] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [isLoading, setIsLoading] = useState(true);
	const [theme, setTheme] = useState("dark");
	const [sortBy, setSortBy] = useState("recent"); // 'recent' | 'size'
	const [storageUsage, setStorageUsage] = useState(null);

	const refreshUsage = () => {
		getStorageUsage().then(setStorageUsage);
	};

	const chatAreaRef = useRef(null);

	// Load data function
	const loadData = async () => {
		setIsLoading(true);
		try {
			const [loadedChats, result] = await Promise.all([loadAllChats(), getStorage(["chatMetadata", "theme"])]);
			setChats(loadedChats);
			setChatMetadata(result.chatMetadata || {});
			if (result.theme) {
				setTheme(result.theme);
			}
			refreshUsage();
		} catch (err) {
			console.error("Failed to load sessions:", err.message);
		} finally {
			setIsLoading(false);
		}
	};

	// Force scroll to bottom on new selection
	useEffect(() => {
		if (chatAreaRef.current) {
			chatAreaRef.current.scrollTop = 0;
		}
	}, [selectedSessionKey]);

	// Sync theme with body class for Shadcn/Radix portal styles
	useEffect(() => {
		document.body.classList.remove("light", "dark");
		document.body.classList.add(theme);
	}, [theme]);

	// Fetch initial data asynchronously to satisfy React 19 rules
	useEffect(() => {
		const timer = setTimeout(() => {
			loadData();
		}, 0);
		return () => clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Storage change reactive listener
	useEffect(() => {
		const handleStorageChange = (changes, area) => {
			if (area === "local") {
				if (changes.theme) {
					setTheme(changes.theme.newValue || "dark");
				}
				const chatChanged = Object.keys(changes).some((key) => key.startsWith(CHAT_KEY_PREFIX));
				if (chatChanged || changes.chatMetadata) {
					loadData();
				}
			}
		};
		chrome.storage.onChanged.addListener(handleStorageChange);
		return () => chrome.storage.onChanged.removeListener(handleStorageChange);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Filter metadata list by search, ordered by recency or by what is costing the most space
	const filteredSessions = useMemo(() => {
		let list = Object.values(chatMetadata);

		const q = searchQuery.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(s) =>
					(s.title && s.title.toLowerCase().includes(q)) ||
					(s.scope && s.scope.toLowerCase().includes(q)) ||
					(s.domain && s.domain.toLowerCase().includes(q)) ||
					(s.url && s.url.toLowerCase().includes(q))
			);
		}

		if (sortBy === "size") {
			return list.sort((a, b) => estimateSessionBytes(chats[b.key]) - estimateSessionBytes(chats[a.key]));
		}
		return list.sort((a, b) => b.timestamp - a.timestamp);
	}, [chatMetadata, chats, searchQuery, sortBy]);

	// Deletes every saved session in one go — the blunt instrument for a full storage quota.
	const handleClearAllSessions = async () => {
		const keys = Object.keys(chatMetadata);
		if (keys.length === 0) return;

		const total = keys.reduce((sum, key) => sum + estimateSessionBytes(chats[key]), 0);
		if (!window.confirm(`Delete ALL ${keys.length} saved sessions and free about ${formatBytes(total)}?\n\nThis cannot be undone.`)) {
			return;
		}

		try {
			await removeStorage(keys.map(sessionStorageKey));
			await setStorage({ chatMetadata: {} });
			setChats({});
			setChatMetadata({});
			setSelectedSessionKey("");
			refreshUsage();
		} catch (err) {
			window.alert(`Failed to clear sessions: ${err.message}`);
		}
	};

	// Statistics
	const stats = useMemo(() => {
		const list = Object.values(chatMetadata);
		let totalTokens = 0;
		let totalMessages = 0;

		list.forEach((meta) => {
			const msgs = chats[meta.key] || [];
			totalMessages += msgs.length;
			msgs.forEach((m) => {
				totalTokens += estimateMessageTokens(m);
			});
		});

		return {
			sessionsCount: list.length,
			totalMessages,
			totalTokens,
			averageTokens: list.length ? Math.round(totalTokens / list.length) : 0,
		};
	}, [chatMetadata, chats]);

	// Delete a specific session
	const handleDeleteSession = async (key, e) => {
		e.stopPropagation();
		if (!window.confirm("Are you sure you want to delete this session and its entire history log? This cannot be undone.")) {
			return;
		}

		try {
			const result = await getStorage("chatMetadata");
			const curMeta = result.chatMetadata || {};
			delete curMeta[key];

			await removeStorage(sessionStorageKey(key));
			await setStorage({ chatMetadata: curMeta });

			setChats((prev) => {
				const next = { ...prev };
				delete next[key];
				return next;
			});
			setChatMetadata(curMeta);
			if (selectedSessionKey === key) {
				setSelectedSessionKey("");
			}
			refreshUsage();
		} catch (err) {
			window.alert(`Failed to delete session: ${err.message}`);
		}
	};

	// Toggle local theme
	const handleToggleTheme = () => {
		const nextTheme = theme === "dark" ? "light" : "dark";
		setTheme(nextTheme);
		setStorage({ theme: nextTheme }).catch((err) => console.error("Failed to save theme:", err.message));
	};

	// Scroll to next/previous user message
	const scrollToUserMessage = (direction) => {
		const container = chatAreaRef.current;
		if (!container) return;

		const msgs = Array.from(container.querySelectorAll('[data-user-msg="true"]'));
		if (msgs.length === 0) return;

		const currentScroll = container.scrollTop;

		if (direction === "down") {
			const startIndex = currentScroll < 20 ? 1 : 0;
			const nextMsg = msgs.slice(startIndex).find((m) => m.offsetTop > currentScroll + 15);
			if (nextMsg) {
				container.scrollTo({
					top: nextMsg.offsetTop - 12,
					behavior: "smooth"
				});
			} else {
				container.scrollTo({
					top: container.scrollHeight,
					behavior: "smooth"
				});
			}
		} else if (direction === "up") {
			const prevMsg = [...msgs].reverse().find((m) => m.offsetTop < currentScroll - 15);
			if (prevMsg) {
				container.scrollTo({
					top: prevMsg.offsetTop - 12,
					behavior: "smooth"
				});
			} else {
				container.scrollTo({
					top: 0,
					behavior: "smooth"
				});
			}
		}
	};

	// Active selected session full details
	const selectedMeta = chatMetadata[selectedSessionKey] || null;
	const selectedMessages = useMemo(() => {
		if (!selectedSessionKey) return [];
		return chats[selectedSessionKey] || [];
	}, [selectedSessionKey, chats]);

	const selectedStats = useMemo(() => {
		if (!selectedMessages.length) return { totalTokens: 0, userMsgs: 0, assistantMsgs: 0 };
		let tokens = 0;
		let userMsgs = 0;
		let assistantMsgs = 0;

		selectedMessages.forEach((m) => {
			tokens += estimateMessageTokens(m);
			if (m.role === "user") userMsgs++;
			if (m.role === "assistant") assistantMsgs++;
		});

		return {
			totalTokens: tokens,
			userMsgs,
			assistantMsgs,
			msgCount: selectedMessages.length
		};
	}, [selectedMessages]);

	// Render beautiful sidebar elements
	return (
		<div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans select-text">
			{/* LEFT COLUMN: SESSIONS LIST PANEL */}
			<div className="w-[380px] shrink-0 border-r border-border bg-[#090b10] flex flex-col h-full shadow-2xl relative z-10 select-none">
				{/* Top Header Title */}
				<div className="p-4 border-b border-border bg-card flex flex-col gap-1 shrink-0">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Sparkles className="h-5 w-5 text-blue-500 shrink-0" />
							<h1 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
								Deepseek Browser Agent - Analyzer
							</h1>
						</div>
						<div className="flex items-center gap-1.5">
							<button
								onClick={handleToggleTheme}
								className="border border-zinc-800/40 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 p-1.5 rounded-md transition-colors cursor-pointer"
								title="Toggle Color Theme"
							>
								{theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
							</button>
							<button
								onClick={loadData}
								disabled={isLoading}
								className="border border-zinc-800/40 bg-zinc-900/50 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40"
								title="Refresh Sessions"
							>
								<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-blue-500" : ""}`} />
							</button>
						</div>
					</div>
					<p className="text-[10px] text-zinc-500">Analyze conversational token sizes, footprints, and agent logs.</p>
				</div>

				{/* Quick Stats Grid */}
				<div className="grid grid-cols-2 gap-2 p-3 bg-zinc-950/20 border-b border-border shrink-0">
					<div className="rounded-lg border border-border bg-zinc-950/40 p-2 flex flex-col">
						<span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Total Footprint</span>
						<span className="font-mono text-xs font-black text-blue-500 mt-0.5">
							{stats.totalTokens.toLocaleString()} <span className="text-[9px] font-normal text-zinc-555">tkn</span>
						</span>
					</div>
					<div className="rounded-lg border border-border bg-zinc-950/40 p-2 flex flex-col">
						<span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Saved Sessions</span>
						<span className="font-mono text-xs font-black text-purple-500 mt-0.5">
							{stats.sessionsCount} <span className="text-[9px] font-normal text-zinc-555">sessions</span>
						</span>
					</div>
				</div>

				{/* Storage budget: the number that actually decides whether saving works */}
				{storageUsage && (
					<div className="flex flex-col gap-1.5 border-b border-border bg-zinc-950/20 px-3 py-2.5 shrink-0">
						{(() => {
							const ratio = Math.min(storageUsage.ratio || 0, 1);
							const pct = Math.round(ratio * 100);
							const isCritical = ratio >= CRITICAL_RATIO;
							const isWarn = !isCritical && ratio >= WARN_RATIO;
							const barColor = isCritical ? "bg-rose-500" : isWarn ? "bg-amber-500" : "bg-blue-600";

							return (
								<>
									<div className="flex items-center justify-between">
										<span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Extension Storage</span>
										<span className={`font-mono text-[9px] font-bold ${isCritical ? "text-rose-400" : isWarn ? "text-amber-400" : "text-zinc-400"}`}>
											{formatBytes(storageUsage.bytes)} / {formatBytes(storageUsage.quota)} ({pct}%)
										</span>
									</div>
									<div className="h-1.5 w-full overflow-hidden rounded-full border border-border bg-zinc-950">
										<div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.max(pct, 2)}%` }} />
									</div>
								</>
							);
						})()}
					</div>
				)}

				{/* Ordering and bulk cleanup */}
				<div className="flex items-center justify-between gap-2 border-b border-border bg-zinc-950/20 px-3 py-2 shrink-0">
					<div className="flex items-center gap-1">
						{[
							{ key: "recent", label: "Recent" },
							{ key: "size", label: "Largest" },
						].map((opt) => (
							<button
								key={opt.key}
								onClick={() => setSortBy(opt.key)}
								className={`cursor-pointer rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors ${
									sortBy === opt.key
										? "border-blue-500/40 bg-blue-500/10 text-blue-400"
										: "border-border bg-zinc-950/40 text-zinc-500 hover:text-zinc-300"
								}`}
							>
								{opt.label}
							</button>
						))}
					</div>
					<button
						onClick={handleClearAllSessions}
						disabled={stats.sessionsCount === 0}
						className="cursor-pointer rounded border border-border bg-zinc-950/40 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-40"
					>
						Clear All
					</button>
				</div>

				{/* Search Panel */}
				<div className="p-3 border-b border-border bg-zinc-950/20 shrink-0">
					<div className="relative flex items-center">
						<Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-550" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search by title, domain, URL..."
							className="w-full h-8 pl-8 pr-3 rounded-lg border border-border bg-zinc-950/60 text-xs text-foreground placeholder-zinc-550 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 font-mono transition-all"
						/>
					</div>
				</div>

				{/* Saved Sessions Scroll Container */}
				<div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-[#090b10]/40">
					{isLoading ? (
						<div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
							<Clock className="h-6 w-6 animate-spin text-blue-500" />
							<span className="text-xs font-mono">Querying Local Storage...</span>
						</div>
					) : filteredSessions.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-16 text-center px-4 gap-2 border border-dashed border-border rounded-xl bg-zinc-950/20">
							<Info className="h-6 w-6 text-zinc-550" />
							<span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">No Sessions Found</span>
							<p className="text-[9px] text-zinc-500 leading-relaxed max-w-[200px]">
								Start conversations in the Deepseek Browser Agent extension to compile log history.
							</p>
						</div>
					) : (
						filteredSessions.map((session) => {
							const isActive = selectedSessionKey === session.key;
							const msgs = chats[session.key] || [];
							let sumTokens = 0;
							msgs.forEach((m) => (sumTokens += estimateMessageTokens(m)));
							const sessionBytes = estimateSessionBytes(msgs);

							return (
								<div
									key={session.key}
									onClick={() => setSelectedSessionKey(session.key)}
									className={`group relative rounded-xl border p-3 cursor-pointer transition-all duration-200 ${
										isActive
											? "border-blue-500/40 bg-blue-500/5 shadow-sm"
											: "border-border bg-zinc-950/40 hover:border-zinc-800 hover:bg-zinc-900/10"
									}`}
								>
									<div className="flex items-start justify-between gap-2.5">
										<div className="flex items-center gap-2 min-w-0 flex-1">
											<span className="shrink-0">
												<Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0 animate-pulse" />
											</span>
											<h3
												className={`truncate text-xs font-bold ${
													isActive ? "text-blue-500" : "text-zinc-200 group-hover:text-zinc-100"
												}`}
											>
												{session.title || "Untitled Session"}
											</h3>
										</div>
										<button
											onClick={(e) => handleDeleteSession(session.key, e)}
											className="text-zinc-555 hover:text-rose-450 hover:bg-zinc-900 shrink-0 p-1 rounded transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
										>
											<Trash2 className="h-3.5 w-3.5" />
										</button>
									</div>

									{/* Host / URL details */}
									{session.domain && session.domain !== "none" && (
										<div className="flex items-center gap-1 text-[9px] font-mono text-zinc-550 mt-1.5 truncate">
											<Compass className="h-3 w-3 text-zinc-500 shrink-0" />
											<span className="truncate">{session.domain}</span>
										</div>
									)}

									{/* Stats footer */}
									<div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-2.5 pt-2 border-t border-border/40 select-none">
										<div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-zinc-550 font-bold">
											<span>CONVERSATION SESSION</span>
										</div>
										<div className="flex items-center gap-2 text-zinc-450">
											<span>{msgs.length} msgs</span>
											<span>•</span>
											<span className="font-bold text-zinc-350">{sumTokens.toLocaleString()} tkn</span>
											<span>•</span>
											<span className={sessionBytes > 512 * 1024 ? "font-bold text-amber-500/80" : "font-bold text-zinc-350"}>{formatBytes(sessionBytes)}</span>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>

			{/* RIGHT COLUMN: TRANSCRIPT VIEW PANEL */}
			<div className="flex-1 bg-background flex flex-col h-full relative z-0 select-text">
				{selectedMeta ? (
					<>
						{/* Session Header Details */}
						<div className="p-4 border-b border-border bg-card shrink-0 flex flex-col gap-2">
							<div className="flex items-start justify-between gap-4">
								<div className="flex flex-col gap-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<h2 className="text-sm font-extrabold text-zinc-100 truncate max-w-[450px]" title={selectedMeta.title}>
											{selectedMeta.title}
										</h2>
									</div>
									<div className="flex items-center gap-3 text-[10px] text-zinc-550 flex-wrap">
										<div className="flex items-center gap-1 font-mono">
											<Calendar className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
											<span>{new Date(selectedMeta.timestamp).toLocaleString()}</span>
										</div>
										{selectedMeta.url && selectedMeta.url !== "none" && (
											<div className="flex items-center gap-1 font-mono truncate max-w-[320px]">
												<Compass className="h-3.5 w-3.5 text-blue-500/70 shrink-0" />
												<a
													href={selectedMeta.url}
													target="_blank"
													rel="noreferrer"
													className="truncate hover:underline text-blue-400"
												>
													{selectedMeta.url}
												</a>
											</div>
										)}
									</div>
								</div>

								{/* Header Stats */}
								<div className="flex gap-2.5 shrink-0 select-none">
									<div className="rounded-lg border border-border bg-zinc-950/40 px-3 py-1 text-right font-mono flex flex-col justify-center">
										<span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider">Total Footprint</span>
										<span className="text-xs font-black text-blue-500 mt-0.5">
											{selectedStats.totalTokens.toLocaleString()}{" "}
											<span className="text-[9px] font-normal text-zinc-550">tkn</span>
										</span>
									</div>
									<div className="rounded-lg border border-border bg-zinc-950/40 px-3 py-1 text-right font-mono flex flex-col justify-center">
										<span className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider">Messages Count</span>
										<span className="text-xs font-black text-purple-500 mt-0.5">
											{selectedStats.msgCount} <span className="text-[9px] font-normal text-zinc-550">msgs</span>
										</span>
									</div>
								</div>
							</div>
						</div>

						{/* Scrollable Conversation Transcript Area */}
						<div
							ref={chatAreaRef}
							className="flex-1 overflow-y-auto p-6 bg-background relative"
						>
							<div className="max-w-3xl mx-auto w-full flex flex-col gap-6 select-text pb-12">
								{selectedMessages.map((msg, index) => {
									const msgTokens = estimateMessageTokens(msg);

									// User message
									if (msg.role === "user") {
										return (
											<div key={`msg-${index}`} data-user-msg="true" className="flex w-full justify-end animate-fade-in">
												<div className="flex max-w-[80%] flex-col gap-1.5 items-end ml-auto">
													<div className="flex items-center gap-1.5 text-[10px] text-zinc-500 select-none mr-1 font-mono">
														<span>User Prompt</span>
														<span>•</span>
														<span>{msgTokens.toLocaleString()} tokens</span>
													</div>
													<div className="rounded-xl border border-border bg-zinc-50 dark:border-zinc-800 dark:bg-[#12161f] px-4 py-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-100 shadow-sm relative group w-fit">
														<div
															className="markdown-body select-text"
															dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
														/>
													</div>
												</div>
											</div>
										);
									}

									// System message
									if (msg.role === "system") {
										// Skip intermediate internal tool logs and blocked prompts
										if (msg.content.startsWith("Agent action:") || msg.content.startsWith("Completed tool:") || msg.content.startsWith("Blocked:")) {
											return null;
										}

										// If it's a tab change log
										return (
											<div key={`msg-${index}`} className="flex w-full justify-center animate-fade-in select-none my-2">
												<div className="flex flex-col gap-1 items-center max-w-[85%]">
													<div className="flex items-center gap-1.5 rounded-md border border-border bg-zinc-950/40 px-2.5 py-1 font-mono text-[10px] text-zinc-500 leading-normal break-all">
														<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 shrink-0" />
														<span>{msg.content}</span>
													</div>
													<span className="text-[8px] font-mono text-zinc-500 select-none">
														{msgTokens.toLocaleString()} tokens
													</span>
												</div>
											</div>
										);
									}

									// Escalation Scope elevation
									if (msg.role === "escalation_request") {
										return (
											<div key={`msg-${index}`} className="flex w-full justify-center animate-fade-in select-none my-2">
												<div className="flex flex-col gap-1 items-center w-full max-w-[85%]">
													<div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex flex-col gap-1.5">
														<div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500">
															<ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
															<span>Scope Elevation Requested</span>
														</div>
														<p className="text-[11px] leading-normal text-zinc-350 italic pl-1.5 border-l border-amber-500/25">
															Reason: &quot;{msg.reason}&quot;
														</p>
														<span className="text-[9px] font-mono text-amber-500/60 uppercase tracking-widest font-extrabold select-none">
															RESOLVED BY USER
														</span>
													</div>
													<span className="text-[8px] font-mono text-zinc-500">
														{msgTokens.toLocaleString()} tokens
													</span>
												</div>
											</div>
										);
									}

									// Assistant message
									if (msg.role === "assistant") {
										// Assemble any tool calls mapped to this assistant's execution step
										const traceCalls = [];
										if (msg.toolCalls && msg.toolCalls.length > 0) {
											// Walk subsequent messages to find matching tool results
											msg.toolCalls.forEach((tc) => {
												// Find corresponding tool reply
												const matchingToolMsg = selectedMessages.find(
													(m, i) => i > index && m.role === "tool" && m.toolCallId === tc.id
												);
												traceCalls.push(
													<ToolTraceCard
														key={tc.id}
														toolCall={tc}
														toolMsg={matchingToolMsg}
													/>
												);
											});
										}

										return (
											<div key={`msg-${index}`} className="flex w-full justify-start animate-fade-in">
												<div className="flex max-w-[85%] flex-col gap-2.5 items-start w-full">
													{/* Header */}
													<div className="flex items-center gap-1.5 text-[10px] text-zinc-500 select-none ml-1 font-mono">
														<Sparkles className="h-3.5 w-3.5 text-blue-500 shrink-0 animate-pulse" />
														<span className="font-bold text-zinc-350">Deepseek Browser Agent</span>
														<span>•</span>
														<span>{msgTokens.toLocaleString()} tokens</span>
													</div>

													{/* Thinking reasoning block (using native details disclosure panel) */}
													{msg.reasoning && (
														<details className="group w-full rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden transition-all duration-200">
															<summary className="flex items-center justify-between px-3 py-2 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-colors select-none font-mono text-[9px] font-bold text-amber-500 uppercase tracking-widest list-none">
																<div className="flex items-center gap-1.5">
																	<Cpu className="h-3.5 w-3.5 animate-pulse text-amber-500/80" />
																	<span>Thinking Process</span>
																</div>
																<span className="text-zinc-500 group-open:rotate-180 transition-transform duration-200 font-sans text-xs">▼</span>
															</summary>
															<div className="px-3 pb-3 pt-2 border-t border-amber-500/10 bg-transparent">
																<pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-amber-500/80 select-text overflow-x-auto font-mono">
																	{msg.reasoning}
																</pre>
															</div>
														</details>
													)}

													{/* Verbal output bubble */}
													{msg.content && msg.content.trim() !== "" && (
														<div className="rounded-xl border border-border bg-zinc-50 dark:border-zinc-800 dark:bg-[#0e1118] p-4 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 shadow-sm w-full relative">
															<div
																className="markdown-body select-text"
																dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
															/>
														</div>
													)}

													{/* Tool call traces lists */}
													{traceCalls.length > 0 && (
														<div className="w-full flex flex-col gap-1 select-none mt-1">
															{traceCalls}
														</div>
													)}
												</div>
											</div>
										);
									}

									return null;
								})}
							</div>
						</div>

						{/* Floating Scroll Navigation Controls */}
						<div className="absolute bottom-6 right-8 z-30 flex flex-col gap-2 select-none">
							<button
								onClick={() => scrollToUserMessage("up")}
								className="h-9 w-9 rounded-xl border border-border bg-card/85 text-zinc-550 hover:text-zinc-800 dark:hover:text-zinc-150 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer backdrop-blur-sm"
								title="Scroll to previous User Message"
							>
								<ChevronUp className="h-5 w-5" />
							</button>
							<button
								onClick={() => scrollToUserMessage("down")}
								className="h-9 w-9 rounded-xl border border-border bg-card/85 text-zinc-550 hover:text-zinc-800 dark:hover:text-zinc-150 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer backdrop-blur-sm"
								title="Scroll to next User Message"
							>
								<ChevronDown className="h-5 w-5" />
							</button>
						</div>
					</>
				) : (
					/* BLANK OPTIONS DASHBOARD STATE */
					<div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none relative overflow-hidden bg-background">
						<div className="relative flex flex-col items-center max-w-[420px] gap-4 z-10">
							<div className="h-16 w-16 rounded-2xl bg-zinc-950/40 border border-border p-0.5 shadow-2xl flex items-center justify-center text-blue-500">
								<Database className="h-8 w-8" />
							</div>

							<div className="flex flex-col gap-1 mt-2">
								<h2 className="text-sm font-bold text-zinc-200">
									Analyze Conversational Memory
								</h2>
								<p className="text-xs text-zinc-400 leading-normal mt-1">
									Inspect full transcripts, token sizes, deep thinking steps, and tool execution traces to understand what occupies your model context limits.
								</p>
							</div>

							<div className="grid grid-cols-2 gap-3 w-full mt-4">
								<div className="rounded-xl border border-border bg-zinc-950/40 p-3 text-left flex flex-col gap-1.5 shadow-sm">
									<Cpu className="h-4.5 w-4.5 text-blue-500 shrink-0" />
									<span className="text-[10px] font-black text-zinc-300 uppercase tracking-wider">Expand Tools</span>
									<span className="text-[10px] text-zinc-500 leading-relaxed">
										Examine input JSON arguments and scraped HTML payloads returned by browsers.
									</span>
								</div>
								<div className="rounded-xl border border-border bg-zinc-950/40 p-3 text-left flex flex-col gap-1.5 shadow-sm">
									<BarChart2 className="h-4.5 w-4.5 text-purple-500 shrink-0" />
									<span className="text-[10px] font-black text-zinc-300 uppercase tracking-wider">Trace Footprints</span>
									<span className="text-[10px] text-zinc-500 leading-relaxed">
										View exact character sizes transformed to standard LLM token units.
									</span>
								</div>
							</div>

							<div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[10px] text-zinc-400 mt-4 font-mono font-medium shadow-sm">
								<Clock className="h-3.5 w-3.5 text-zinc-550 shrink-0" />
								<span>Select a session on the left to begin trace.</span>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// Initializing the Sessions analyzer root
ReactDOM.createRoot(document.getElementById("root")).render(<SessionsAnalyzer />);
