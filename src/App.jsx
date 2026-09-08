import { useState, useEffect, useRef, useCallback } from "react";
import { Send, ShieldAlert, AlertTriangle, Loader2, Search, Terminal, Square, MessageSquarePlus, FileText, Compass, Layers, Image as ImageIcon, Maximize2, Paperclip, X as XIcon } from "lucide-react";

// Helper to generate unique session keys (impure function declared outside react context)
function generateSessionKey() {
	return `global_chat_${Date.now()}`;
}

// A global array to collect sidebar console logs for debugging
const sidebarLogs = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
	sidebarLogs.push(`[LOG] ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}`);
	originalLog.apply(console, args);
};
console.warn = (...args) => {
	sidebarLogs.push(`[WARN] ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}`);
	originalWarn.apply(console, args);
};
console.error = (...args) => {
	sidebarLogs.push(`[ERROR] ${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : a)).join(" ")}`);
	originalError.apply(console, args);
};

// Import official Shadcn components
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

import { ChatHeader } from "./components/ChatHeader";
import { SettingsDialog } from "./components/SettingsDialog";
import { CopyButton } from "./components/CopyButton";
import { ImageLightbox } from "./components/ImageLightbox";
import {
	setStorage,
	getStorage,
	removeStorage,
	getStorageUsage,
	loadAllChats,
	sessionStorageKey,
	estimateSessionBytes,
	formatBytes,
	WARN_RATIO,
	CRITICAL_RATIO,
} from "@/lib/storage";
import {
	AGENT_GROUP_TITLE,
	ensureGroup,
	getGroupInfo,
	getGroupTabs,
	isInGroup,
	openInGroup,
	adoptTab,
	ensureGroupWithTab,
	isGroupPristine,
	reconcileStaleWorkspaces,
	pruneBlankTabs,
	isWorkspacePlaceholder,
	releaseGroup,
	outOfScopeError,
} from "@/lib/agentTabs";
import { cropImage, makeThumbnail, dataUrlBytes, getImageSize, stripImagesForStorage, downscaleToMaxEdge, fileToAttachment, CAPTURE_QUALITY } from "@/lib/images";

// Helper to parse and format system messages, particularly active tab change logs with long URLs
function parseSystemMessage(content) {
	if (!content) return null;
	const urlIndex = content.indexOf(" (URL: ");
	const tabIdIndex = content.lastIndexOf(", Tab ID: ");

	if (urlIndex !== -1 && tabIdIndex !== -1 && tabIdIndex > urlIndex) {
		const prefix = content.slice(0, urlIndex);
		const url = content.slice(urlIndex + 7, tabIdIndex);
		const suffix = content.slice(tabIdIndex);

		// Truncate URL if it's too long
		const maxLen = 30;
		const truncatedUrl = url.length > maxLen ? url.slice(0, maxLen) + "..." : url;

		return (
			<span className="flex items-center gap-1 flex-wrap">
				<span>{prefix} (URL: </span>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="cursor-pointer underline decoration-dotted text-blue-400 hover:text-blue-300 break-all select-all font-mono">
							{truncatedUrl}
						</span>
					</TooltipTrigger>
					<TooltipContent className="custom-tooltip max-w-[280px] rounded-lg border border-zinc-850 bg-[#0e1118] px-2.5 py-1.5 text-[11px] text-zinc-300 shadow-2xl leading-normal break-all select-all font-mono">
						{url}
					</TooltipContent>
				</Tooltip>
				<span>{suffix}</span>
			</span>
		);
	}

	return <span>{content}</span>;
}

// A screenshot the agent took. Sessions saved before screenshots had their own role stored
// them as user messages, so those are recognised too rather than rendering as things the user
// said.
function isToolImageMessage(m) {
	if (!m) return false;
	if (m.role === "tool_image") return true;
	// Images the user attached themselves are their message, not a tool result
	if (m.userUploaded) return false;
	return m.role === "user" && ((m.images?.length > 0) || (m.thumbnails?.length > 0) || (m.imagesStripped > 0));
}


export default function App() {
	// App state
	const [apiKey, setApiKey] = useState("");
	const [endpoint, setEndpoint] = useState("https://api.deepseek.com");
	const [model, setModel] = useState("deepseek-v4-flash");
	const [systemPrompt, setSystemPrompt] = useState("You are Deepseek Browser Agent, a highly capable AI assistant embedded in a web browser sidebar. You have access to tools that let you read, search, click, scroll, navigate, audit page diagnostics, and inject secure custom JavaScript in the active browser tab. Always be extremely concise, direct, and professional. When answering questions about a webpage or tab content, give direct, straight-to-the-point answers. Do not include unrequested explanations, redundant descriptions of your steps, or generic background info. Keep your answers brief, factual, and focused entirely on the user's specific question. ALWAYS RESPOND IN ENGLISH. Whenever the user requests setup instructions, scripting guidance, or troubleshooting steps that depend on their host operating system or hardware parameters, you MUST call the \"get_device_details\" tool first to identify their system details and provide a highly targeted response tailored to their active platform.");
	const [temperature, setTemperature] = useState(0.2);
	const [maxTokens, setMaxTokens] = useState(2048);

	// Vision states: opt-in, because /models returns bare ids with no capability metadata
	const [supportsImages, setSupportsImages] = useState(false);
	const supportsImagesRef = useRef(false);
	useEffect(() => {
		supportsImagesRef.current = supportsImages;
	}, [supportsImages]);

	// Vision requests are expensive, so only the most recent captures are sent
	const MAX_IMAGES_PER_REQUEST = 3;

	// V4 Thinking states
	const [enableThinking, setEnableThinking] = useState(true);
	const [reasoningEffort, setReasoningEffort] = useState("medium");
	const [showToolCallsDetail, setShowToolCallsDetail] = useState(false);

	// Tools permissions state
	const [enabledTools, setEnabledTools] = useState({
		get_page_summary_content: true,
		extract_all_links: true,
		query_dom_elements: true,
		click_element: true,
		fill_input: true,
		scroll_to_element: true,
		navigate_to: true,
		highlight_text: true,
		list_open_tabs: true,
		switch_to_tab: true,
		open_tab: true,
		close_tab: true,
		use_current_tab: true,
		get_device_details: true,
		execute_js_in_page: true,
		get_page_diagnostics: true,
		take_screenshot: true,
		screenshot_element: true,
	});

	// Agent workspace: a native Chrome tab group. Membership is the permission boundary — the
	// agent can only see and act on tabs inside this group. One group per chat session.
	const [agentGroupId, setAgentGroupId] = useState(null);
	const agentGroupIdRef = useRef(null);
	const [groupTabs, setGroupTabs] = useState([]);
	const groupTabsRef = useRef([]);

	// The tab the USER is looking at. Read-only awareness so the agent can answer "work on this
	// page" — it still cannot touch the tab until use_current_tab moves it into the group.
	const userActiveTabRef = useRef(null);

	// Tab states — these describe the AGENT's target tab, not the user's foreground tab
	const [activeTabId, setActiveTabId] = useState(null);
	const [activeDomain, setActiveDomain] = useState("loading...");
	const [activeFavicon, setActiveFavicon] = useState("icons/icon16.png");
	const [isConnected, setIsConnected] = useState(false);
	const [activeUrl, setActiveUrl] = useState("");

	// Chat states
	const [chats, setChats] = useState({}); // { scope_key: [messages] }
	const [currentScope, setCurrentScope] = useState("global"); // 'website', 'domain', 'global'
	const currentScopeRef = useRef(currentScope);
	useEffect(() => {
		currentScopeRef.current = currentScope;
	}, [currentScope]);
	const [inputMessage, setInputMessage] = useState("");
	const [attachments, setAttachments] = useState([]); // user-picked images, pending send
	const [attachError, setAttachError] = useState("");
	const fileInputRef = useRef(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [userScrolledUp, setUserScrolledUp] = useState(false);

	// UI states
	const [showSettings, setShowSettings] = useState(false);
	const [lightbox, setLightbox] = useState(null); // { src, alt, meta } — full-canvas screenshot viewer
	const [settingsTab, setSettingsTab] = useState("preferences"); // 'preferences', 'sessions'
	const [chatMetadata, setChatMetadata] = useState({}); // registry of session metadata
	const [activeTabTitle, setActiveTabTitle] = useState("");
	const [editingSessionKey, setEditingSessionKey] = useState(null);
	const [editingTitleText, setEditingTitleText] = useState("");
	const [showKey, setShowKey] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [saveError, setSaveError] = useState(null);
	const [isSaving, setIsSaving] = useState(false);
	const [apiKeyMissing, setApiKeyMissing] = useState(false);
	const [isTestingKey, setIsTestingKey] = useState(false);
	const [testResult, setTestResult] = useState(null);
	const [retryNotice, setRetryNotice] = useState("");
	const [streamingThinking, setStreamingThinking] = useState("");
	const [streamingResponse, setStreamingResponse] = useState("");

	// Agent control states
	const [, setStopRequested] = useState(false);
	const stopRequestedRef = useRef(false);
	const [queuedComment, setQueuedComment] = useState("");
	const queuedCommentRef = useRef("");

	// Prompt history states
	const [promptHistory, setPromptHistory] = useState([]);
	const [historyIndex, setHistoryIndex] = useState(-1);

	// Balance states
	const [apiBalance, setApiBalance] = useState(null);
	const [isFetchingBalance, setIsFetchingBalance] = useState(false);
	const [fetchedModels, setFetchedModels] = useState(["deepseek-v4-flash", "deepseek-v4-pro"]);
	const [isFetchingModels, setIsFetchingModels] = useState(false);

	// Iterations limit setting state
	const [maxIterations, setMaxIterations] = useState(50);

	// Active session key for persistent global-only conversations
	const [activeSessionKey, setActiveSessionKey] = useState("global_chat_history");

	// Storage health states
	const [storageUsage, setStorageUsage] = useState(null); // { bytes, quota, ratio }
	const [storageError, setStorageError] = useState(null); // last write failure message
	const [storageBlocked, setStorageBlocked] = useState(false); // quota exhausted, chats paused
	const storageBlockedRef = useRef(false);
	const usageRefreshTimerRef = useRef(null);

	const refreshStorageUsage = useCallback(async () => {
		const usage = await getStorageUsage();
		setStorageUsage(usage);
		return usage;
	}, []);

	// Coalesce usage reads: the agent loop writes far more often than the meter needs updating
	const scheduleUsageRefresh = useCallback(() => {
		if (usageRefreshTimerRef.current) return;
		usageRefreshTimerRef.current = setTimeout(() => {
			usageRefreshTimerRef.current = null;
			refreshStorageUsage();
		}, 2000);
	}, [refreshStorageUsage]);

	// Single funnel for every write. A quota failure pauses chats instead of being swallowed.
	const persist = useCallback(
		async (items) => {
			try {
				await setStorage(items);
				setStorageError(null);
				if (storageBlockedRef.current) {
					storageBlockedRef.current = false;
					setStorageBlocked(false);
				}
				scheduleUsageRefresh();
				return true;
			} catch (err) {
				console.error("Storage write failed:", err.message);
				setStorageError(err.message);
				if (err.isQuota) {
					storageBlockedRef.current = true;
					setStorageBlocked(true);
				}
				refreshStorageUsage();
				return false;
			}
		},
		[scheduleUsageRefresh, refreshStorageUsage],
	);

	// The agent loop used to rewrite the whole archive twice per tool call. The in-memory
	// transcript still updates immediately; storage is flushed at most every 1.5s and once at
	// the end of a run.
	const pendingWritesRef = useRef({});
	const writeTimerRef = useRef(null);

	const flushSessionWrites = useCallback(async () => {
		if (writeTimerRef.current) {
			clearTimeout(writeTimerRef.current);
			writeTimerRef.current = null;
		}
		const pending = pendingWritesRef.current;
		pendingWritesRef.current = {};

		const keys = Object.keys(pending);
		if (keys.length === 0) return true;

		const payload = {};
		keys.forEach((key) => {
			// Full-size captures live in memory only; the transcript keeps a thumbnail
			payload[sessionStorageKey(key)] = stripImagesForStorage(pending[key]);
		});
		return persist(payload);
	}, [persist]);

	const queueSessionWrite = useCallback(
		(key, messages) => {
			pendingWritesRef.current[key] = messages;
			if (writeTimerRef.current) return;
			writeTimerRef.current = setTimeout(() => {
				writeTimerRef.current = null;
				flushSessionWrites();
			}, 1500);
		},
		[flushSessionWrites],
	);

	// Device privacy states
	const [showDevicePrivacyPrompt, setShowDevicePrivacyPrompt] = useState(false);
	const [devicePrivacyTimer, setDevicePrivacyTimer] = useState(30);
	const [shareOsAndPlatform, setShareOsAndPlatform] = useState(true);
	const [shareHardware, setShareHardware] = useState(true);
	const [shareNetworkAndLocal, setShareNetworkAndLocal] = useState(false);
	const devicePrivacyResolveRef = useRef(null);

	const handleResolveDeviceDetails = async (sendOs, sendHardware, sendNetwork) => {
		setShowDevicePrivacyPrompt(false);
		const resolve = devicePrivacyResolveRef.current;
		if (!resolve) return;
		devicePrivacyResolveRef.current = null;

		// Gather platform info
		const platform = await new Promise((res) => chrome.runtime.getPlatformInfo(res));

		let battery = { level: "unknown", charging: "unknown" };
		try {
			const batt = await navigator.getBattery();
			battery = {
				level: `${Math.round(batt.level * 100)}%`,
				charging: batt.charging
			};
		} catch { /* ignore */ }

		const result = { success: true };

		if (sendOs) {
			result.platform = {
				os: platform.os,
				architecture: platform.arch
			};
		}

		if (sendHardware) {
			result.hardware = {
				cpuCores: navigator.hardwareConcurrency || "unknown",
				approximateRamGb: navigator.deviceMemory || "unknown",
				screenResolution: `${window.screen.width}x${window.screen.height}`,
				pixelRatio: window.devicePixelRatio
			};
		}

		if (sendNetwork) {
			result.localization = {
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				language: navigator.language,
				languages: navigator.languages
			};
			result.network = {
				onlineStatus: navigator.onLine ? "online" : "offline",
				effectiveType: navigator.connection?.effectiveType || "unknown",
				downlinkMbps: navigator.connection?.downlink || "unknown",
				rttMs: navigator.connection?.rtt || "unknown"
			};
			result.battery = battery;
		}

		resolve(result);
	};

	// Device Privacy countdown timer
	useEffect(() => {
		let interval = null;
		if (showDevicePrivacyPrompt) {
			interval = setInterval(() => {
				setDevicePrivacyTimer((prev) => {
					if (prev <= 1) {
						clearInterval(interval);
						handleResolveDeviceDetails(true, true, false); // Auto resolve fallback
						return 0;
					}
					return prev - 1;
				});
			}, 1000);
		}
		return () => {
			if (interval) clearInterval(interval);
		};
	}, [showDevicePrivacyPrompt]);

	// Theme states (light vs dark mode)
	const [theme, setTheme] = useState("dark");

	// Sync theme with body class for Shadcn/Radix portal styles
	useEffect(() => {
		document.body.classList.remove("light", "dark");
		document.body.classList.add(theme);
	}, [theme]);

	// Refs
	const chatAreaRef = useRef(null);
	const inputRef = useRef(null);
	const [lockedChatKey, setLockedChatKey] = useState(null);

	// Sync references to prevent stale closures in event handlers and background messaging
	const activeTabIdRef = useRef(activeTabId);
	const activeUrlRef = useRef(activeUrl);
	const activeTabTitleRef = useRef(activeTabTitle);
	const activeDomainRef = useRef(activeDomain);
	const apiKeyRef = useRef(apiKey);
	const chatsRef = useRef(chats);
	const activeSessionKeyRef = useRef(activeSessionKey);
	const lockedChatKeyRef = useRef(lockedChatKey);
	const isGeneratingRef = useRef(isGenerating);

	// Sync references inside an effect to satisfy React lints (no ref updates during render).
	//
	// activeTabIdRef is deliberately NOT synced here. It is the agent's target tab, written by
	// the code that actually retargets (trackAgentTab, open_tab, switch_to_tab, use_current_tab,
	// share). Mirroring it from state made this effect race those writers: any unrelated render
	// — a saveMessageLog during the agent loop is enough — would reset the ref to the previous
	// tab, so the next tool acted on the wrong page.
	useEffect(() => {
		activeUrlRef.current = activeUrl;
		activeTabTitleRef.current = activeTabTitle;
		activeDomainRef.current = activeDomain;
		apiKeyRef.current = apiKey;
		chatsRef.current = chats;
		activeSessionKeyRef.current = activeSessionKey;
		lockedChatKeyRef.current = lockedChatKey;
		isGeneratingRef.current = isGenerating;
	}, [activeTabId, activeUrl, activeTabTitle, activeDomain, apiKey, chats, activeSessionKey, lockedChatKey, isGenerating]);

	// Test API Key validity
	async function handleTestApiKey() {
		if (!apiKey) {
			setTestResult({ success: false, message: "Enter API key first." });
			return;
		}

		setIsTestingKey(true);
		setTestResult(null);

		const isDeepseek = endpoint.trim().toLowerCase().includes("deepseek.com");

		try {
			if (isDeepseek) {
				// 1. Try balance endpoint
				const balanceUrl = `${endpoint.trim()}/user/balance`;
				const res = await fetch(balanceUrl, {
					method: "GET",
					headers: {
						Authorization: `Bearer ${apiKey.trim()}`,
						Accept: "application/json",
					},
				});

				if (res.ok) {
					const data = await res.json();
					if (data && data.balance_infos && data.balance_infos[0]) {
						const info = data.balance_infos[0];
						setTestResult({
							success: true,
							message: `Valid! Balance: ${info.total_balance} ${info.currency}`,
						});
						fetchAvailableModels(endpoint, apiKey);
						return;
					}
				}
			}

			// 2. Try models endpoint as fallback
			const modelsUrl = `${endpoint.trim()}/models`;
			const modelsRes = await fetch(modelsUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey.trim()}`,
					Accept: "application/json",
				},
			});

			if (modelsRes.ok) {
				setTestResult({
					success: true,
					message: "API Key is valid!",
				});
				const data = await modelsRes.json();
				if (data && Array.isArray(data.data)) {
					const modelIds = data.data.map(m => m.id);
					if (modelIds.length > 0) {
						setFetchedModels(modelIds);
						persist({ fetchedModels: modelIds });
					}
				}
			} else {
				const errText = await modelsRes.text();
				let errMsg = `Failed (${modelsRes.status})`;
				try {
					const errObj = JSON.parse(errText);
					if (errObj.error && errObj.error.message) {
						errMsg = errObj.error.message;
					}
				} catch {
					if (errText) {
						errMsg = errText.substring(0, 40);
					}
				}
				setTestResult({
					success: false,
					message: errMsg,
				});
			}
		} catch (err) {
			setTestResult({
				success: false,
				message: err.message || "Connection failed.",
			});
		} finally {
			setIsTestingKey(false);
		}
	}

	// Fetch current user balance from Deepseek API
	async function fetchApiBalance() {
		if (!apiKey) return;
		const isDeepseek = endpoint.trim().toLowerCase().includes("deepseek.com");
		if (!isDeepseek) {
			setApiBalance(null);
			setIsFetchingBalance(false);
			return;
		}
		setIsFetchingBalance(true);
		try {
			const balanceUrl = `${endpoint.trim()}/user/balance`;
			const res = await fetch(balanceUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey.trim()}`,
					Accept: "application/json",
				},
			});
			if (res.ok) {
				const data = await res.json();
				if (data && data.balance_infos && data.balance_infos[0]) {
					const info = data.balance_infos[0];
					setApiBalance({
						total: info.total_balance,
						currency: info.currency,
						available: data.is_available,
					});
				}
			} else {
				setApiBalance(null);
			}
		} catch {
			setApiBalance(null);
		} finally {
			setIsFetchingBalance(false);
		}
	}

	// Auto-fetch the models list from the configured base URL
	async function fetchAvailableModels(customEndpoint, customKey) {
		const activeEndpoint = (customEndpoint || endpoint || "").trim();
		const activeKey = (customKey || apiKey || "").trim();
		if (!activeEndpoint || !activeKey) return;

		setIsFetchingModels(true);
		try {
			const modelsUrl = `${activeEndpoint}/models`;
			const res = await fetch(modelsUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${activeKey}`,
					Accept: "application/json",
				},
			});
			if (res.ok) {
				const data = await res.json();
				if (data && Array.isArray(data.data)) {
					const modelIds = data.data.map(m => m.id);
					if (modelIds.length > 0) {
						setFetchedModels(modelIds);
						persist({ fetchedModels: modelIds });
					}
				}
			}
		} catch (err) {
			console.error("Failed to fetch models:", err);
		} finally {
			setIsFetchingModels(false);
		}
	}

	// Handle keydown in prompt text area for arrow history navigation
	function handleKeyDown(e) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmitMessage(e);
		} else if (e.key === "ArrowUp") {
			if (e.target.selectionStart === 0 && promptHistory.length > 0) {
				e.preventDefault();
				let nextIndex = historyIndex === -1 ? promptHistory.length - 1 : historyIndex - 1;
				if (nextIndex >= 0) {
					setHistoryIndex(nextIndex);
					setInputMessage(promptHistory[nextIndex]);
				}
			}
		} else if (e.key === "ArrowDown") {
			if (e.target.selectionEnd === e.target.value.length && promptHistory.length > 0) {
				e.preventDefault();
				if (historyIndex !== -1) {
					let nextIndex = historyIndex + 1;
					if (nextIndex < promptHistory.length) {
						setHistoryIndex(nextIndex);
						setInputMessage(promptHistory[nextIndex]);
					} else {
						setHistoryIndex(-1);
						setInputMessage("");
					}
				}
			}
		}
	}

	// Force Scroll to bottom
	function scrollToBottom() {
		if (chatAreaRef.current) {
			chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
		}
	}

	// Read settings from storage
	async function loadSettings() {
		let result;
		try {
			result = await getStorage(["apiKey", "endpoint", "model", "systemPrompt", "temperature", "maxTokens", "chatMetadata", "enableThinking", "reasoningEffort", "maxIterations", "activeSessionKey", "theme", "showToolCallsDetail", "enabledTools", "fetchedModels", "supportsImages", "agentGroupId"]);
		} catch (err) {
			console.error("Failed to read settings from storage:", err.message);
			setStorageError(err.message);
			return;
		}

		refreshStorageUsage();

		// Reattach to the workspace from before the side panel was closed, but only if that
		// group still exists — a stale id would silently point every tool at nothing.
		if (result.agentGroupId) {
			const stillThere = await getGroupInfo(result.agentGroupId);
			if (stillThere) {
				agentGroupIdRef.current = result.agentGroupId;
				setAgentGroupId(result.agentGroupId);
				trackAgentTab();
			} else {
				persist({ agentGroupId: null });
			}
		}

		// Only now is the active workspace known, so it is safe to clear the placeholder tabs
		// and empty groups an earlier session stranded. Running this any earlier would close
		// the very group we just reattached to.
		reconcileStaleWorkspaces(agentGroupIdRef.current)
			.then((closed) => {
				if (closed > 0) console.log(`Cleared ${closed} stale agent workspace tab(s).`);
			})
			.catch(() => {});

		if (result.enabledTools) {
			// Merged, not replaced, so tools added in a later version keep their default
			setEnabledTools((prev) => ({ ...prev, ...result.enabledTools }));
		}
		setApiKey(result.apiKey || "");
		setEndpoint(result.endpoint || "https://api.deepseek.com");
		setModel(result.model || "deepseek-v4-flash");
		setSupportsImages(result.supportsImages === true);
		if (result.fetchedModels && Array.isArray(result.fetchedModels)) {
			setFetchedModels(result.fetchedModels);
		}

		let currentPrompt = result.systemPrompt;
		const oldDefaultPrompt = "You are Deepseek Browser Agent, a highly capable AI assistant embedded in a web browser sidebar. You have access to tools that let you read, search, click, scroll, and navigate the active browser tab. Always be extremely concise, direct, and professional. When answering questions about a webpage or tab content, give direct, straight-to-the-point answers. Do not include unrequested explanations, redundant descriptions of your steps, or generic background info. Keep your answers brief, factual, and focused entirely on the user's specific question. ALWAYS RESPOND IN ENGLISH.";
		const newDefaultPrompt = "You are Deepseek Browser Agent, a highly capable AI assistant embedded in a web browser sidebar. You have access to tools that let you read, search, click, scroll, navigate, audit page diagnostics, and inject secure custom JavaScript in the active browser tab. Always be extremely concise, direct, and professional. When answering questions about a webpage or tab content, give direct, straight-to-the-point answers. Do not include unrequested explanations, redundant descriptions of your steps, or generic background info. Keep your answers brief, factual, and focused entirely on the user's specific question. ALWAYS RESPOND IN ENGLISH. Whenever the user requests setup instructions, scripting guidance, or troubleshooting steps that depend on their host operating system or hardware parameters, you MUST call the \"get_device_details\" tool first to identify their system details and provide a highly targeted response tailored to their active platform.";

		if (currentPrompt === oldDefaultPrompt || !currentPrompt) {
			currentPrompt = newDefaultPrompt;
			persist({ systemPrompt: newDefaultPrompt });
		}
		setSystemPrompt(currentPrompt);
		if (result.activeSessionKey) {
			setActiveSessionKey(result.activeSessionKey);
		}
		if (result.theme) {
			setTheme(result.theme);
		}
		setTemperature(result.temperature !== undefined ? parseFloat(result.temperature) : 0.2);
		setMaxTokens(result.maxTokens !== undefined ? parseInt(result.maxTokens) : 2048);
		setEnableThinking(result.enableThinking !== undefined ? result.enableThinking : true);
		setReasoningEffort(result.reasoningEffort || "medium");
		setShowToolCallsDetail(result.showToolCallsDetail !== undefined ? result.showToolCallsDetail : false);

		// Per-session storage keys, migrating the legacy monolithic "chats" object if present
		let loadedChats = {};
		try {
			loadedChats = await loadAllChats();
		} catch (err) {
			console.error("Failed to load chat history:", err.message);
			setStorageError(err.message);
		}
		let loadedMeta = result.chatMetadata || {};

		// Sync migration: check if chats keys exist in loadedMeta or if website scopes lack a URL
		let changed = false;
		Object.keys(loadedChats).forEach((key) => {
			if (loadedChats[key] && loadedChats[key].length > 0) {
				const isMissingMeta = !loadedMeta[key];
				const isWebsiteScopeLackingUrl = loadedMeta[key] && loadedMeta[key].scope === "website" && !loadedMeta[key].url;

				if (isMissingMeta || isWebsiteScopeLackingUrl) {
					changed = true;
					let scope;
					let domain = "none";
					let url = "";
					let title;

					if (key === "global_chat_history") {
						scope = "global";
						title = "Global Chat";
					} else if (key.startsWith("domain_chat_history_")) {
						scope = "domain";
						domain = key.substring("domain_chat_history_".length);
						title = `Domain: ${domain}`;
					} else {
						scope = "website";
						title = "Website Chat";
					}

					const messages = loadedChats[key];

					// Try to extract the webpage URL from system context or links in prior messages
					for (const m of messages) {
						if (m.role === "system" && m.content) {
							const textMatch = m.content.match(/extracted from the webpage "[^"]*" \((https?:\/\/[^\s)]+)\)/);
							if (textMatch) {
								url = textMatch[1];
								break;
							}
						}
						if (m.content && m.content.includes("https://")) {
							const linkMatch = m.content.match(/(https?:\/\/[^\s"']+)/);
							if (linkMatch) {
								url = linkMatch[1];
								break;
							}
						}
					}

					const firstUserMsg = messages.find((m) => m.role === "user")?.content || "";
					const currentTitle = loadedMeta[key]?.title || (firstUserMsg ? firstUserMsg.substring(0, 47) + (firstUserMsg.length > 47 ? "..." : "") : title);

					loadedMeta[key] = {
						...(loadedMeta[key] || {}),
						key,
						scope,
						domain,
						url,
						title: currentTitle,
						timestamp: loadedMeta[key]?.timestamp || Date.now(),
					};
				}
			}
		});

		if (changed) {
			persist({ chatMetadata: loadedMeta });
		}

		setChats((prevChats) => {
			const merged = { ...loadedChats };
			Object.keys(prevChats).forEach((key) => {
				if (prevChats[key] && prevChats[key].length > (merged[key]?.length || 0)) {
					merged[key] = prevChats[key];
				}
			});
			return merged;
		});
		setChatMetadata(loadedMeta);
		setApiKeyMissing(!result.apiKey);
		setMaxIterations(result.maxIterations !== undefined ? parseInt(result.maxIterations) : 50);
	}

	// Persisted so closing and reopening the side panel reattaches to the same workspace
	// instead of orphaning it and grouping a second set of tabs.
	const setAgentGroup = useCallback(
		(groupId) => {
			agentGroupIdRef.current = groupId;
			setAgentGroupId(groupId);
			persist({ agentGroupId: groupId });
		},
		[persist],
	);

	// Resolves the agent's TARGET tab from its tab group.
	//
	// The activeTabId / activeUrl / activeDomain / activeTabTitle state below describes the tab
	// the AGENT is pointed at, never the tab the user happens to be looking at. Tabs outside the
	// group are invisible here and to every tool.
	const trackAgentTab = useCallback(async () => {
		const groupId = agentGroupIdRef.current;

		if (!groupId) {
			groupTabsRef.current = [];
			setGroupTabs([]);
			setActiveTabId(null);
			setActiveUrl("");
			setActiveTabTitle("");
			setActiveDomain("no workspace");
			setActiveFavicon("icons/icon16.png");
			setIsConnected(false);
			return;
		}

		const info = await getGroupInfo(groupId);
		if (!info) {
			// The user closed or dissolved the group; forget the stale id
			setAgentGroup(null);
			setGroupTabs([]);
			setActiveTabId(null);
			setActiveDomain("no workspace");
			setIsConnected(false);
			return;
		}

		const tabs = await getGroupTabs(groupId);
		groupTabsRef.current = tabs;
		setGroupTabs(tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, favIconUrl: t.favIconUrl })));

		if (tabs.length === 0) {
			setActiveTabId(null);
			setActiveUrl("");
			setActiveTabTitle("");
			setActiveDomain("workspace empty");
			setActiveFavicon("icons/icon16.png");
			setIsConnected(false);
			return;
		}

		const tab = tabs.find((t) => t.id === activeTabIdRef.current) || tabs[0];

		// Refs are written directly as well as through state: a message sent in the same tick
		// as the workspace being created would otherwise be told there are no tabs.
		activeTabIdRef.current = tab.id;
		activeUrlRef.current = tab.url || "";
		activeTabTitleRef.current = tab.title || "";
		setActiveTabId(tab.id);
		setActiveUrl(tab.url || "");
		setActiveFavicon(tab.favIconUrl || "icons/icon16.png");
		setActiveTabTitle(tab.title || "");

		let domain = "none";
		try {
			if (tab.url) {
				domain = new URL(tab.url).hostname;
			}
		} catch {
			domain = "restricted";
		}
		setActiveDomain(isWorkspacePlaceholder(tab.url) ? "agent workspace" : domain || "workspace");

		const url = tab.url || "";
		const isChromeSystemPage = url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:") || url.startsWith("devtools://") || url.includes("chromewebstore.google.com");

		if (isChromeSystemPage) {
			setIsConnected(false);
			return;
		}

		chrome.tabs.sendMessage(tab.id, { action: "PING" }, (response) => {
			// Purely informational now. A target tab without a content script is a normal resting
			// state, not something the user has to fix, so nothing is surfaced as a warning.
			setIsConnected(!chrome.runtime.lastError && !!response?.success);
		});
	}, [setAgentGroup]);

	// Records which tab the user is currently on. Title and URL only, and only the active tab —
	// never the rest of their browsing. Disclosure to the model is gated on the use_current_tab
	// tool being enabled, so one switch controls both awareness and access.
	const trackUserActiveTab = useCallback(async () => {
		try {
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
			userActiveTabRef.current = tab?.id
				? {
						id: tab.id,
						title: tab.title || "",
						url: tab.url || "",
						groupId: tab.groupId,
					}
				: null;
		} catch {
			userActiveTabRef.current = null;
		}
	}, []);

	// Creates the workspace on demand and points the agent at it.
	const ensureAgentWorkspace = useCallback(async () => {
		const { groupId, tabId } = await ensureGroup(agentGroupIdRef.current);
		setAgentGroup(groupId);
		activeTabIdRef.current = tabId;
		setActiveTabId(tabId);
		await trackAgentTab();
		return { groupId, tabId };
	}, [trackAgentTab, setAgentGroup]);

	// Sync scroll on new messages
	useEffect(() => {
		if (!userScrolledUp) {
			scrollToBottom();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chats, streamingResponse, streamingThinking, isGenerating]);

	// (loadSettings and trackAgentTab are hoisted above the useEffect)

	// Get active chat key based on scope (memoized to prevent dependency changes)
	const getChatKey = useCallback(() => {
		if (lockedChatKey) {
			return lockedChatKey;
		}
		return activeSessionKey;
	}, [lockedChatKey, activeSessionKey]);

	// Fetch history array for current scope
	const getMessages = () => {
		const key = getChatKey();
		return chats[key] || [];
	};

	// Stale-closure safe getters using refs directly (for use in async callbacks/handlers)
	const getLatestChatKey = () => {
		if (lockedChatKeyRef.current) {
			return lockedChatKeyRef.current;
		}
		return activeSessionKeyRef.current;
	};

	const getLatestMessages = () => {
		const key = getLatestChatKey();
		return chatsRef.current[key] || [];
	};


	// Save changes to storage. A failed write must never be reported as a success, so this
	// awaits the checked wrapper and keeps the drawer open with the real reason on failure.
	const saveConfiguration = async () => {
		const trimmedKey = apiKey.trim();
		setIsSaving(true);
		setSaveError(null);

		try {
			await setStorage({
				apiKey: trimmedKey,
				endpoint: endpoint.trim(),
				model: model,
				systemPrompt: systemPrompt.trim(),
				temperature: parseFloat(temperature) || 0.2,
				maxTokens: parseInt(maxTokens) || 2048,
				enableThinking: enableThinking,
				reasoningEffort: reasoningEffort,
				maxIterations: parseInt(maxIterations) || 50,
				showToolCallsDetail: showToolCallsDetail,
				enabledTools: enabledTools,
				fetchedModels: fetchedModels,
				supportsImages: supportsImages,
			});
		} catch (err) {
			setIsSaving(false);
			setStorageError(err.message);
			if (err.isQuota) {
				storageBlockedRef.current = true;
				setStorageBlocked(true);
				setSaveError("Browser storage is full — settings were NOT saved. Free up space in the Sessions tab, then save again.");
			} else {
				setSaveError(`Settings were NOT saved: ${err.message}`);
			}
			refreshStorageUsage();
			return;
		}

		setIsSaving(false);
		setApiKeyMissing(!trimmedKey);
		setStorageError(null);
		if (storageBlockedRef.current) {
			storageBlockedRef.current = false;
			setStorageBlocked(false);
		}
		refreshStorageUsage();
		// The drawer stays open. Closing it on save hides whether the write landed,
		// which is exactly the failure this whole storage pass exists to surface.
		setSaveSuccess(true);
		setTimeout(() => setSaveSuccess(false), 2200);
	};

	// Deletes whole sessions to recover quota. Used by the "storage full" recovery banner.
	const purgeSessions = async (sessionKeys) => {
		if (!sessionKeys || sessionKeys.length === 0) return false;

		try {
			await removeStorage(sessionKeys.map(sessionStorageKey));
		} catch (err) {
			setStorageError(err.message);
			return false;
		}

		const nextChats = { ...chatsRef.current };
		const nextMeta = { ...chatMetadata };
		sessionKeys.forEach((key) => {
			delete nextChats[key];
			delete nextMeta[key];
		});
		setChats(nextChats);
		setChatMetadata(nextMeta);

		const ok = await persist({ chatMetadata: nextMeta });
		await refreshStorageUsage();
		return ok;
	};

	// Largest sessions first — what the recovery banner offers to delete.
	const heaviestSessions = () => {
		return Object.values(chatMetadata)
			.map((meta) => ({
				...meta,
				bytes: estimateSessionBytes(chats[meta.key]),
			}))
			.filter((s) => s.bytes > 0)
			.sort((a, b) => b.bytes - a.bytes);
	};

	// Suggests the heaviest sessions and deletes only what the user confirms.
	const handleFreeUpSpace = async () => {
		const candidates = heaviestSessions()
			.filter((s) => s.key !== getChatKey())
			.slice(0, 3);

		if (candidates.length === 0) {
			window.alert("No other saved sessions to delete. Open the Sessions tab to review the current conversation.");
			return;
		}

		const freed = candidates.reduce((sum, s) => sum + s.bytes, 0);
		const list = candidates.map((s) => `  - ${s.title} (${formatBytes(s.bytes)})`).join("\n");

		if (!window.confirm(`Delete these ${candidates.length} largest saved sessions and free about ${formatBytes(freed)}?\n\n${list}\n\nThis cannot be undone.`)) {
			return;
		}

		await purgeSessions(candidates.map((s) => s.key));
	};

	// Opt-in, per session. Tool results are stored in full by default so a transcript replays
	// exactly what the model saw; this trades that fidelity for space on a session the user
	// picks. Nothing is ever compacted automatically.
	const TOOL_PREVIEW_CHARS = 4000;

	const handleCompactSession = async (sessionKey, e) => {
		if (e) e.stopPropagation();

		const messages = chats[sessionKey];
		if (!messages || messages.length === 0) return;

		const before = estimateSessionBytes(messages);
		const compacted = messages.map((m) => {
			if (m.thumbnails && m.thumbnails.length > 0) {
				const { thumbnails, ...rest } = m;
				return { ...rest, thumbnailsDropped: thumbnails.length, compacted: true };
			}
			if (m.role !== "tool" || !m.content || m.content.length <= TOOL_PREVIEW_CHARS) return m;
			return {
				...m,
				content: `${m.content.slice(0, TOOL_PREVIEW_CHARS)}\n…[compacted, ${m.content.length - TOOL_PREVIEW_CHARS} characters removed]`,
				compacted: true,
			};
		});

		const after = estimateSessionBytes(compacted);
		if (after >= before) {
			window.alert("Nothing to compact in this session — no oversized tool results.");
			return;
		}

		if (!window.confirm(`Compact this session and free about ${formatBytes(before - after)}?\n\nLong tool results are shortened to a preview. Your messages and the assistant's replies are untouched. This cannot be undone.`)) {
			return;
		}

		const ok = await persist({ [sessionStorageKey(sessionKey)]: compacted });
		if (ok) {
			setChats((prev) => ({ ...prev, [sessionKey]: compacted }));
			await refreshStorageUsage();
		}
	};

	// Byte size per session, for the session list and the recovery banner.
	const sessionSizes = () => {
		const sizes = {};
		Object.keys(chats).forEach((key) => {
			sizes[key] = estimateSessionBytes(chats[key]);
		});
		return sizes;
	};

	// Helper to estimate total context tokens accumulated for the active session
	const estimateContextTokens = (messages) => {
		let totalChars = (systemPrompt || "").length;
		
		const tabContextStr = `[CURRENT TAB ID: ${activeTabId || ""}]\n[CURRENT TAB URL: ${activeUrl || ""}]\n[CURRENT TAB TITLE: ${activeTabTitle || ""}]`;
		totalChars += tabContextStr.length;

		messages.forEach((m) => {
			if (m.content) totalChars += m.content.length;
			if (m.reasoning) totalChars += m.reasoning.length;
			if (m.toolCalls) {
				try {
					totalChars += JSON.stringify(m.toolCalls).length;
				} catch { /* ignore parsing errors */ }
			}
		});

		return Math.ceil(totalChars / 4);
	};



	// Save new messages to log in local storage
	function saveMessageLog(newMessages) {
		const key = getLatestChatKey();

		// Determine a title for the session based on first user message, or activeTabTitle, or key
		let firstUserMsg = newMessages.find((m) => m.role === "user")?.content || "";
		if (firstUserMsg.length > 50) {
			firstUserMsg = firstUserMsg.substring(0, 47) + "...";
		}

		const scope = currentScopeRef.current;
		let fallbackTitle;
		if (scope === "global") fallbackTitle = "Global Chat";
		else if (scope === "domain") fallbackTitle = `Domain: ${activeDomainRef.current}`;
		else fallbackTitle = activeTabTitleRef.current || activeUrlRef.current || "Website Chat";

		const title = firstUserMsg || fallbackTitle;

		setChats((prevChats) => {
			const updatedChats = {
				...prevChats,
				[key]: newMessages,
			};
			queueSessionWrite(key, newMessages);
			return updatedChats;
		});

		setChatMetadata((prevMeta) => {
			const existing = prevMeta[key];
			const finalTitle = existing?.title || title;

			const updatedMeta = {
				...prevMeta,
				[key]: {
					key,
					scope,
					domain: activeDomainRef.current,
					url: activeUrlRef.current,
					title: finalTitle,
					timestamp: Date.now(),
					hasAiTitle: existing?.hasAiTitle || false,
				},
			};
			persist({ chatMetadata: updatedMeta });

			// Auto generate AI title after 2 user messages (deepseek-v4-flash only)
			const userMsgs = newMessages.filter((m) => m.role === "user");
			if (userMsgs.length === 2 && !updatedMeta[key]?.hasAiTitle && apiKeyRef.current) {
				generateAiTitle(newMessages, key);
			}

			return updatedMeta;
		});
	}

	// Starts a fresh conversation. One tab group per chat session, so the previous group's real
	// pages are handed back to the user — ungrouped, still open, no longer visible to the agent.
	const handleNewChat = async () => {
		const previousGroupId = agentGroupIdRef.current;

		const newKey = generateSessionKey();
		setActiveSessionKey(newKey);
		persist({ activeSessionKey: newKey });

		// An unused workspace is already exactly what a new chat wants. Tearing it down only to
		// build an identical one leaves a stray placeholder tab and a second group in the strip.
		if (previousGroupId && (await isGroupPristine(previousGroupId))) {
			const tabs = await getGroupTabs(previousGroupId);
			activeTabIdRef.current = tabs[0]?.id || null;
			setActiveTabId(tabs[0]?.id || null);
			await trackAgentTab();
			return;
		}

		setAgentGroup(null);
		activeTabIdRef.current = null;
		setActiveTabId(null);

		if (previousGroupId) {
			await releaseGroup(previousGroupId);
		}

		// A fresh chat gets its workspace immediately, so the group is visible in the tab strip
		// from the start rather than appearing partway through the first answer.
		try {
			await ensureAgentWorkspace();
		} catch (err) {
			console.warn("Could not open the agent workspace:", err.message);
			await trackAgentTab();
		}
	};

	// Theme toggle action
	const handleToggleTheme = () => {
		const nextTheme = theme === "dark" ? "light" : "dark";
		setTheme(nextTheme);
		persist({ theme: nextTheme });
	};

	// Handles loading a saved session. Switching chats switches workspaces: the current group's
	// tabs are released back to the user and the loaded session starts without one. The agent
	// creates a fresh group on its next action.
	const handleLoadSession = async (session) => {
		const previousGroupId = agentGroupIdRef.current;

		setActiveSessionKey(session.key);
		persist({ activeSessionKey: session.key });
		setShowSettings(false);

		setCurrentScope("global");

		// An unused workspace carries no state worth releasing — keep it for the loaded session
		if (previousGroupId && (await isGroupPristine(previousGroupId))) {
			await trackAgentTab();
			return;
		}

		setAgentGroup(null);
		activeTabIdRef.current = null;
		setActiveTabId(null);

		if (previousGroupId) {
			await releaseGroup(previousGroupId);
		}
		await trackAgentTab();
	};

	// Shares a specific tab with the agent, creating the group around it if there is none.
	const shareTabWithAgent = useCallback(
		async (tabId) => {
			const groupId = await ensureGroupWithTab(agentGroupIdRef.current, tabId);
			setAgentGroup(groupId);
			activeTabIdRef.current = tabId;
			setActiveTabId(tabId);
			await trackAgentTab();
			return groupId;
		},
		[trackAgentTab, setAgentGroup],
	);

	// Phrases that mean "work on the page I am looking at" rather than "go find something".
	const CURRENT_TAB_HINT = /\b(?:this|current|the)\s+(?:page|tab|site|website|url|article|screen|form|document)\b|\bon\s+(?:this|the)\s+page\b|\bhere\s+on\b|\bwhat(?:'s| is)\s+on\s+(?:this|the)\b/i;

	const isRestrictedUrl = (url) =>
		!url || url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:") || url.startsWith("devtools://") || url.includes("chromewebstore.google.com");

	// Decides what the agent's workspace should contain before a message is sent. If the user is
	// clearly talking about the page in front of them, that tab is pulled into the group and the
	// placeholder blank tab is cleaned up. Otherwise the agent just gets its blank workspace.
	const prepareWorkspaceForMessage = async (text) => {
		try {
			const groupId = agentGroupIdRef.current;
			const info = groupId ? await getGroupInfo(groupId) : null;
			const tabs = info ? await getGroupTabs(groupId) : [];
			const hasRealPage = tabs.some((t) => !isRestrictedUrl(t.url));

			// Same switch as the tool: with it off, the tab the user is on stays private
			const canUseCurrentTab = enabledTools.use_current_tab !== false;

			if (canUseCurrentTab && !hasRealPage && CURRENT_TAB_HINT.test(text)) {
				const [userTab] = await chrome.tabs.query({ active: true, currentWindow: true });
				if (userTab?.id && !isRestrictedUrl(userTab.url)) {
					const newGroupId = await shareTabWithAgent(userTab.id);
					await pruneBlankTabs(newGroupId, userTab.id);
					await trackAgentTab();
					return;
				}
			}

			if (!info) {
				await ensureAgentWorkspace();
			}
		} catch (err) {
			console.warn("Could not prepare the agent workspace:", err.message);
		}
	};

	// Header action: hand the user's current foreground tab to the agent. The programmatic twin
	// of dragging it into the group.
	const handleShareCurrentTab = async () => {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab || !tab.id) return;

		try {
			await shareTabWithAgent(tab.id);
		} catch (err) {
			console.error("Failed to share tab with the agent:", err.message);
		}
	};

	// Handles deleting a saved session
	const handleDeleteSession = async (sessionKey, e) => {
		e.stopPropagation();
		if (!window.confirm("Are you sure you want to delete this saved session?")) return;
		await purgeSessions([sessionKey]);
	};

	// Uses deepseek-v4-flash only to generate a clean title after 2 user messages
	const generateAiTitle = async (messages, key) => {
		try {
			const userMsgs = messages.filter((m) => m.role === "user");
			if (userMsgs.length !== 2) return;

			const payload = {
				model: "deepseek-v4-flash",
				messages: [
					{
						role: "system",
						content: "You are a session title generator. Analyze the 2 user messages from a conversation and generate a very short, concise, and clean title (max 5 words). Do not use quotes, punctuation, markdown, or explanations. Respond with ONLY the title.",
					},
					{
						role: "user",
						content: `User message 1: "${userMsgs[0].content}"\nUser message 2: "${userMsgs[1].content}"`,
					},
				],
				max_tokens: 30,
				temperature: 0.3,
			};

			const response = await fetch(`${endpoint}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify(payload),
			});

			if (response.ok) {
				const data = await response.json();
				let cleanTitle = data.choices[0]?.message?.content?.trim();
				if (cleanTitle) {
					cleanTitle = cleanTitle.replace(/^["']|["']$/g, "");
					setChatMetadata((prevMeta) => {
						if (!prevMeta[key]) return prevMeta;
						const updated = {
							...prevMeta,
							[key]: {
								...prevMeta[key],
								title: cleanTitle,
								hasAiTitle: true,
							},
						};
						persist({ chatMetadata: updated });
						return updated;
					});
				}
			}
		} catch (err) {
			console.warn("Failed to generate AI title:", err);
		}
	};

	const handleStartEditTitle = (session, e) => {
		e.stopPropagation();
		setEditingSessionKey(session.key);
		setEditingTitleText(session.title);
	};

	const handleSaveTitle = (sessionKey) => {
		if (!editingTitleText.trim()) {
			setEditingSessionKey(null);
			return;
		}
		setChatMetadata((prevMeta) => {
			if (!prevMeta[sessionKey]) return prevMeta;
			const updated = {
				...prevMeta,
				[sessionKey]: {
					...prevMeta[sessionKey],
					title: editingTitleText.trim(),
				},
			};
			persist({ chatMetadata: updated });
			return updated;
		});
		setEditingSessionKey(null);
	};

	// Copies comprehensive formatted debug logs and conversation transcript to clipboard
	const handleCopyDebugLogs = async () => {
		try {
			// 1. Get console errors from webpage via content script
			let webpageLogs = [];
			if (isConnected && activeTabId) {
				try {
					const response = await new Promise((resolve) => {
						chrome.tabs.sendMessage(activeTabId, { action: "GET_PAGE_ERRORS" }, (res) => {
							if (chrome.runtime.lastError || !res) {
								resolve(null);
							} else {
								resolve(res);
							}
						});
					});
					if (response && response.success && response.errors) {
						webpageLogs = response.errors;
					}
				} catch (e) {
					console.warn("Failed to retrieve webpage error logs:", e);
				}
			}

			// 2. Format the messages transcript
			const currentMsgs = getMessages();
			let transcriptText = "";

			if (currentMsgs.length === 0) {
				transcriptText = "_No messages in current session._\n";
			} else {
				currentMsgs.forEach((msg, idx) => {
					transcriptText += `\n--- MESSAGE #${idx + 1} ---\n`;
					transcriptText += `[ROLE] ${msg.role.toUpperCase()}\n`;

					if (msg.content) {
						transcriptText += `[CONTENT]\n${msg.content}\n`;
					}
					if (msg.reasoning) {
						transcriptText += `[THINKING PROCESS]\n${msg.reasoning}\n`;
					}
					if (msg.toolName) {
						transcriptText += `[TOOL CALLED] ${msg.toolName} (ID: ${msg.toolCallId || "N/A"})\n`;
					}
					if (msg.toolCalls) {
						transcriptText += `[TOOL CALLS DECLARATION]\n${JSON.stringify(msg.toolCalls, null, 2)}\n`;
					}
				});
			}

			// 3. Format the collected sidebar logs
			const sidebarLogText = sidebarLogs.length > 0 ? sidebarLogs.join("\n") : "_No console logs captured inside the sidebar yet._";

			// 4. Format webpage logs
			const webpageLogText = webpageLogs.length > 0 ? webpageLogs.join("\n") : "_No page-level uncaught exceptions or rejection logs captured._";

			// 5. Compile everything into a comprehensive markdown template
			const debugOutput = `
# DEEPSEEK BROWSER AGENT DEBUG COMPILATION
========================================
Generated At: ${new Date().toLocaleString()}
Active Domain: ${activeDomain}
Active URL: ${activeUrl}
Current Scope: ${currentScopeRef.current}
Automation Status: ${isConnected ? "Connected (Online)" : "Disconnected (Offline)"}

## 1. CONVERSATION TRANSCRIPT
========================================
${transcriptText}

## 2. SIDEBAR EXTENSION CONSOLE LOGS
========================================
${sidebarLogText}

## 3. WEBPAGE CONSOLE / RUNTIME ERROR LOGS
========================================
${webpageLogText}

========================================
END OF DEBUG COMPILATION
`.trim();

			// 6. Write to Clipboard
			await navigator.clipboard.writeText(debugOutput);
			alert("✓ Debug logs and transcript successfully copied to clipboard!");
		} catch (err) {
			alert(`Failed to copy debug logs: ${err.message}`);
		}
	};

	// (scrollToBottom is hoisted above the useEffect)

	// --- User image attachments -------------------------------------------------------------
	// Only reachable when the model has been declared image-capable; a text-only endpoint would
	// reject the multipart content outright.

	const addFiles = useCallback(
		async (files) => {
			const images = Array.from(files || []).filter((f) => f.type?.startsWith("image/"));
			if (images.length === 0) return;

			setAttachError("");
			const room = MAX_IMAGES_PER_REQUEST - attachments.length;
			if (room <= 0) {
				setAttachError(`Up to ${MAX_IMAGES_PER_REQUEST} images per message.`);
				return;
			}
			if (images.length > room) {
				setAttachError(`Only the first ${room} added — ${MAX_IMAGES_PER_REQUEST} images per message.`);
			}

			for (const file of images.slice(0, room)) {
				try {
					const built = await fileToAttachment(file);
					setAttachments((prev) => [...prev, { id: `${file.name}-${prev.length}-${file.size}`, ...built }]);
				} catch (err) {
					setAttachError(err.message);
				}
			}
		},
		[attachments.length],
	);

	const removeAttachment = (id) => setAttachments((prev) => prev.filter((a) => a.id !== id));

	const handleComposerPaste = (e) => {
		if (!supportsImages) return;
		const files = Array.from(e.clipboardData?.files || []);
		if (files.some((f) => f.type?.startsWith("image/"))) {
			e.preventDefault();
			addFiles(files);
		}
	};

	// Auto-expand input box
	const handleInputChange = (e) => {
		setInputMessage(e.target.value);
		if (inputRef.current) {
			inputRef.current.style.height = "auto";
			inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
		}
	};

	// Appends a new message block locally
	function addLocalMessage(role, content, additional = {}) {
		const currentMsgs = getLatestMessages();
		const newMsg = {
			role,
			content,
			...additional,
		};
		const updated = [...currentMsgs, newMsg];
		saveMessageLog(updated);
		return updated;
	}

	// (triggerQuickAction and loadSettings are hoisted above);

	const handleStopAgent = () => {
		stopRequestedRef.current = true;
		setStopRequested(true);
		setIsGenerating(false);
	};

	// User input submission
	const handleSubmitMessage = async (e) => {
		e.preventDefault();
		const text = inputMessage.trim();
		const pending = supportsImages ? attachments : [];
		// An image on its own is a valid message
		if (!text && pending.length === 0) return;
		if (storageBlockedRef.current) return;

		if (isGenerating) {
			// Enqueue intermediate user comment
			queuedCommentRef.current = text;
			setQueuedComment(text);
			setInputMessage("");
			if (inputRef.current) {
				inputRef.current.style.height = "auto";
			}
			return;
		}

		setPromptHistory((prev) => {
			if (prev.length > 0 && prev[prev.length - 1] === text) return prev;
			return [...prev, text].slice(-50);
		});
		setHistoryIndex(-1);
		setInputMessage("");
		if (inputRef.current) {
			inputRef.current.style.height = "auto";
		}

		setAttachments([]);
		setAttachError("");

		const updated = addLocalMessage(
			"user",
			text,
			pending.length > 0
				? {
						userUploaded: true,
						images: pending.map((a) => a.dataUrl),
						thumbnails: pending.map((a) => a.thumbnail),
						imageMeta: pending.map((a) => a.meta),
					}
				: {},
		);

		if (!apiKey) {
			addLocalMessage("assistant", "⚠️ **Deepseek API Key is missing!** Open configurations (gear icon) to save your credentials.");
			return;
		}

		await prepareWorkspaceForMessage(text);
		await executeDeepSeekCall(null, null, updated);
	};

	// Transient upstream failures — gateway capacity, rate limits, bad gateways. These say
	// "retry shortly" and mean it; without this a single hiccup ends the whole agent run and the
	// user loses the turn along with everything the tools already did.
	const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
	const MAX_REQUEST_RETRIES = 3;

	const postChatCompletion = async (url, init, onRetry) => {
		let lastError = null;

		for (let attempt = 0; attempt <= MAX_REQUEST_RETRIES; attempt++) {
			if (stopRequestedRef.current) throw lastError || new Error("Stopped by user.");

			let response;
			try {
				response = await fetch(url, init);
			} catch (err) {
				// Network-level failure: worth one more go
				lastError = err;
				if (attempt === MAX_REQUEST_RETRIES) throw err;
				await waitBeforeRetry(attempt, null, onRetry, err.message);
				continue;
			}

			if (response.ok || !RETRYABLE_STATUSES.has(response.status)) return response;

			const detail = await response.text();
			lastError = new Error(`API Response Error (${response.status}): ${detail}`);
			if (attempt === MAX_REQUEST_RETRIES) throw lastError;

			await waitBeforeRetry(attempt, response.headers.get("retry-after"), onRetry, `${response.status}`);
		}

		throw lastError || new Error("Request failed.");
	};

	const waitBeforeRetry = async (attempt, retryAfterHeader, onRetry, reason) => {
		// Honour Retry-After when the server sends one, else exponential backoff with jitter
		const headerSeconds = Number.parseFloat(retryAfterHeader);
		const backoff = Number.isFinite(headerSeconds) && headerSeconds > 0 ? headerSeconds * 1000 : 2 ** attempt * 1000 + Math.random() * 400;

		if (onRetry) onRetry(attempt + 1, Math.round(backoff / 100) / 10, reason);
		await new Promise((resolve) => setTimeout(resolve, Math.min(backoff, 15000)));
	};

	// Executes DeepSeek V4 agent loop
	async function executeDeepSeekCall(extraSystemContext = null, overrideUserPrompt = null, currentMessagesState = null) {
		// Chats are paused while storage is full: continuing would spend API credit on turns
		// that cannot be saved.
		if (storageBlockedRef.current) {
			return;
		}

		// Lock the chat key so navigation mid-flight doesn't switch or vanish the chat history
		setLockedChatKey(getChatKey());

		// Race condition safeguard: resolve active API key directly from storage if state is not updated yet
		let activeApiKey = apiKeyRef.current;
		if (!activeApiKey) {
			const storageResult = await getStorage("apiKey").catch(() => ({}));
			activeApiKey = storageResult.apiKey || "";
		}

		setIsGenerating(true);
		setStreamingResponse("");
		setStreamingThinking("");
		setStopRequested(false);
		stopRequestedRef.current = false;
		setQueuedComment("");
		queuedCommentRef.current = "";

		let activeMessages = currentMessagesState || getMessages();
		let retryCount = 0;

		// Define agentic tools (unrestricted, global browser controls)
		const agentTools = [
			{
				type: "function",
				function: {
					name: "get_page_summary_content",
					description: "Extract the primary readable text content from the current webpage for analysis or summarizing.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "extract_all_links",
					description: "Get all hyperlinks present on the current webpage to enable mapping out where to navigate.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "query_dom_elements",
					description: "Query elements on the current page using a CSS selector (e.g. 'button', 'input') to inspect page interactive structure.",
					parameters: {
						type: "object",
						properties: {
							selector: {
								type: "string",
								description: "The CSS selector to query (e.g., 'input', 'button', 'a')",
							},
						},
					},
				},
			},
			{
				type: "function",
				function: {
					name: "click_element",
					description: "Click a button, link, or input on the active webpage by its CSS selector or text match.",
					parameters: {
						type: "object",
						properties: {
							selector: {
								type: "string",
								description: "CSS selector of the element to click (e.g. '#submit')",
							},
							text: {
								type: "string",
								description: "Case-insensitive visible text to match and click (e.g. 'Sign Up')",
							},
						},
					},
				},
			},
			{
				type: "function",
				function: {
					name: "fill_input",
					description: "Type a value into an input field or textarea on the active webpage.",
					parameters: {
						type: "object",
						properties: {
							selector: {
								type: "string",
								description: "CSS selector or placeholder descriptor of the input element",
							},
							value: {
								type: "string",
								description: "The text content to input",
							},
						},
						required: ["value"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "scroll_to_element",
					description: "Scroll the page to a specific element or scroll down/up.",
					parameters: {
						type: "object",
						properties: {
							selector: {
								type: "string",
								description: "Optional CSS selector of the element to scroll to",
							},
							direction: {
								type: "string",
								enum: ["up", "down", "top", "bottom"],
							},
							amount: {
								type: "number",
								description: "Pixels to scroll (default 300)",
							},
						},
					},
				},
			},
			{
				type: "function",
				function: {
					name: "navigate_to",
					description: "Direct the active webpage to a new URL.",
					parameters: {
						type: "object",
						properties: {
							url: {
								type: "string",
								description: "The absolute URL to navigate to",
							},
						},
						required: ["url"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "highlight_text",
					description: "Search and highlight a specific text phrase on the webpage, and scroll it into view.",
					parameters: {
						type: "object",
						properties: {
							query: {
								type: "string",
								description: "The text string to search and highlight",
							},
						},
						required: ["query"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "list_open_tabs",
					description: `List the tabs shared with you. You can only see and act on tabs inside the "${AGENT_GROUP_TITLE}" tab group; every other tab in the browser is private to the user. Returns IDs, URLs, and titles, and marks which tab you are currently targeting.`,
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "switch_to_tab",
					description: "Switch to a different tab inside your tab group. This changes which tab your page tools act on. Your group has its own Chrome window, so this never disturbs what the user is looking at. Only tabs in your group can be targeted.",
					parameters: {
						type: "object",
						properties: {
							tabId: {
								type: "number",
								description: "The numeric ID of a tab inside your tab group.",
							},
						},
						required: ["tabId"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "open_tab",
					description: "Open a URL in a NEW background tab inside your tab group, and target it. Prefer this over navigate_to when you want to keep the current page as well.",
					parameters: {
						type: "object",
						properties: {
							url: {
								type: "string",
								description: "The absolute URL to open",
							},
						},
						required: ["url"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "use_current_tab",
					description: "Move the tab the user is currently looking at into your tab group and target it. Use this whenever the user asks you to do something with 'this page', 'this tab', or the page they are on. You are told which tab that is in the system context, but you cannot read or act on it until you call this.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "close_tab",
					description: "Close a tab inside your tab group when you no longer need it. Only tabs in your group can be closed.",
					parameters: {
						type: "object",
						properties: {
							tabId: {
								type: "number",
								description: "The numeric ID of a tab inside your tab group.",
							},
						},
						required: ["tabId"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "get_device_details",
					description: "Retrieve comprehensive details about the user's host device, operating system, processor architecture, hardware capabilities, timezone, and network status.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "execute_js_in_page",
					description: "Execute a custom, secure JavaScript code block directly within the active tab context using Chrome's Scripting API. Use this for complex DOM calculations, custom node parsing, or advanced web automated tasks where standard DOM tools fall short.",
					parameters: {
						type: "object",
						properties: {
							code: {
								type: "string",
								description: "The complete JavaScript code block as a string to be evaluated. It should be wrapped in an immediately invoked function or direct body statements, and can return a value (e.g. 'return document.title;').",
							},
						},
						required: ["code"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "get_page_diagnostics",
					description: "Run automated diagnostic audits on the active tab page using Chrome's Scripting API. Retrieves page load metrics, DOM completion metrics, SSL status, and full lists of SEO meta headers.",
					parameters: { type: "object", properties: {} },
				},
			},
			// Vision tools exist only when the user has declared the model image-capable
			...(supportsImages
				? [
						{
							type: "function",
							function: {
								name: "take_screenshot",
								description: "Capture what is currently visible in your target tab as an image. Use this when the page's layout, rendering, or visual state matters and the DOM text is not enough. The image is attached to the conversation right after this call.",
								parameters: { type: "object", properties: {} },
							},
						},
						{
							type: "function",
							function: {
								name: "screenshot_element",
								description: "Capture a single element of your target tab as an image, scrolling it into view first. Cheaper and sharper than a full screenshot when you only care about one component.",
								parameters: {
									type: "object",
									properties: {
										selector: {
											type: "string",
											description: "CSS selector of the element to capture",
										},
									},
									required: ["selector"],
								},
							},
						},
					]
				: []),
		];

		try {
			while (retryCount < maxIterations) {
				if (stopRequestedRef.current) {
					const stoppedMessages = [
						...activeMessages,
						{ role: "system", content: "Agent execution stopped by user." }
					];
					saveMessageLog(stoppedMessages);
					break;
				}

				if (storageBlockedRef.current) {
					saveMessageLog([
						...activeMessages,
						{ role: "system", content: "Agent paused: browser storage is full. Nothing after this point was saved." },
					]);
					break;
				}

				// Compile messages payload mapped exactly to OpenAI/Deepseek specifications
				let payloadMessages = [{ role: "system", content: systemPrompt }];

				// Tell the model what it is pointed at, and that its reach stops at the group
				const onPlaceholder = isWorkspacePlaceholder(activeUrlRef.current);

				// Awareness of the user's current tab is disclosed only when use_current_tab is
				// enabled, so a single switch governs both seeing it and being able to take it.
				const canUseCurrentTab = enabledTools.use_current_tab !== false;
				const userTab = userActiveTabRef.current;
				let userTabLine = "";
				if (canUseCurrentTab && userTab && userTab.groupId !== agentGroupIdRef.current) {
					userTabLine = isRestrictedUrl(userTab.url)
						? `\n[USER IS CURRENTLY ON: a restricted Chrome page, which cannot be automated]`
						: `\n[USER IS CURRENTLY ON: "${userTab.title}" — ${userTab.url}. This tab is NOT yours yet: you cannot read or act on it. If the user asks you to work on "this page" or "this tab", call use_current_tab to move it into your group first.]`;
				}

				const tabContextStr = `[WORKSPACE: you operate only inside the "${AGENT_GROUP_TITLE}" tab group, which has its own Chrome window. You cannot read or act on any tab outside it. The user shares a tab by dragging it into the group.]\n[TABS SHARED WITH YOU: ${groupTabsRef.current.length}]\n[CURRENT TAB ID: ${activeTabIdRef.current}]\n[CURRENT TAB URL: ${activeUrlRef.current}]\n[CURRENT TAB TITLE: ${activeTabTitleRef.current}]${onPlaceholder ? "\n[NOTE: your current tab is the empty workspace placeholder. It has no content to read. Use open_tab or navigate_to to load a real page before using any page tool.]" : ""}${userTabLine}`;
				payloadMessages.push({ role: "system", content: tabContextStr });

				if (extraSystemContext) {
					payloadMessages.push({ role: "system", content: extraSystemContext });
				}

				// Vision is expensive, so only the most recent captures are actually sent
				const imageIndexes = [];
				activeMessages.forEach((m, idx) => {
					if (m.images && m.images.length > 0) imageIndexes.push(idx);
				});
				const allowedImageIndexes = new Set(imageIndexes.slice(-MAX_IMAGES_PER_REQUEST));

				// Add history mapping reasoning_content and tool_calls context seamlessly in full (no truncation)
				activeMessages.forEach((m, idx) => {
					// The agent's own screenshots. Stored under their own role so the UI never
					// mistakes them for something the user said, but encoded as a user message here
					// because that is the only shape a vision API accepts an image in.
					if (isToolImageMessage(m) || (m.role === "user" && m.userUploaded)) {
						const hasImages = m.images && m.images.length > 0;

						if (hasImages && supportsImages && allowedImageIndexes.has(idx)) {
							payloadMessages.push({
								role: "user",
								content: [
									{ type: "text", text: m.content || (m.userUploaded ? "" : "Screenshot") },
									...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
								],
							});
						} else {
							payloadMessages.push({
								role: "user",
								content: `${m.content || (m.userUploaded ? "[image]" : "Screenshot")} (image not attached — ${supportsImages ? "older image dropped to save tokens" : "image support is off"})`,
							});
						}
					} else if (m.role === "user") {
						payloadMessages.push({ role: "user", content: m.content });
					} else if (m.role === "assistant") {
						const msgObj = { role: "assistant", content: m.content || "" };
						if (m.reasoning) {
							msgObj.reasoning_content = m.reasoning;
						}
						if (m.toolCalls) {
							msgObj.tool_calls = m.toolCalls;
						}
						payloadMessages.push(msgObj);
					} else if (m.role === "tool") {
						payloadMessages.push({
							role: "tool",
							tool_call_id: m.toolCallId,
							name: m.toolName,
							content: m.content,
						});
					}
				});

				if (overrideUserPrompt) {
					payloadMessages.push({ role: "user", content: overrideUserPrompt });
				}

				// V4 supports both thinking and tools at the same time.
				// Tools are attached whenever any are enabled, not gated on a live content-script
				// connection: with no workspace yet the agent's first tool call creates the group
				// and opens a page. Connectivity is resolved per call instead.
				const activeTools = agentTools.filter((t) => enabledTools[t.function.name] !== false);
				const attachTools = activeTools.length > 0;

				const requestPayload = {
					model: model,
					messages: payloadMessages,
					max_tokens: parseInt(maxTokens),
					stream: !attachTools,
				};

				if (enableThinking) {
					requestPayload.thinking = { type: "enabled" };
					requestPayload.reasoning_effort = reasoningEffort;
				} else {
					requestPayload.temperature = parseFloat(temperature);
				}

				if (attachTools) {
					requestPayload.tools = activeTools;
					requestPayload.tool_choice = "auto";
				}

				const response = await postChatCompletion(
					`${endpoint}/chat/completions`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${activeApiKey}`,
						},
						body: JSON.stringify(requestPayload),
					},
					(attempt, seconds, reason) => {
						setRetryNotice(`Upstream busy (${reason}). Retrying in ${seconds}s — attempt ${attempt} of ${MAX_REQUEST_RETRIES}.`);
					},
				);
				setRetryNotice("");

				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`API Response Error (${response.status}): ${errorText}`);
				}

				// 1. Tool Call Evaluation Loop (Non-streaming)
				if (attachTools) {
					const result = await response.json();
					const choice = result.choices[0];
					const message = choice.message;

					if (message.tool_calls && message.tool_calls.length > 0) {
						let nextMessages = [...activeMessages];

						nextMessages.push({
							role: "assistant",
							content: message.content || "",
							reasoning: message.reasoning_content || null,
							toolCalls: message.tool_calls,
						});

						// Captured images ride along as user messages, but every tool result must
						// follow its assistant tool_calls message without anything in between,
						// so they are held back until the whole batch has been answered.
						const pendingImageMessages = [];

						for (const toolCall of message.tool_calls) {
							const toolName = toolCall.function.name;
							const args = JSON.parse(toolCall.function.arguments || "{}");
							const callId = toolCall.id;

							nextMessages.push({
								role: "system",
								content: `Agent action: ${toolName}`,
							});
							saveMessageLog(nextMessages);

							let actionResult;
							try {
								actionResult = await executeContentScriptAction(toolName, args);
							} catch (err) {
								actionResult = { success: false, error: err.message };
							}

							// Vision APIs only accept images on a user message, so this is encoded as
							// one at request time — but it is the agent's own output, not something
							// the user said, so it is stored under its own role and rendered as a
							// tool result. Full-size data stays in memory.
							const capturedImage = actionResult?.__image;
							const capturedThumb = actionResult?.__thumbnail;
							const capturedCaption = actionResult?.__caption;
							const capturedSource = actionResult?.__source;
							const capturedMeta = actionResult?.__meta;
							if (capturedImage) {
								actionResult = { ...actionResult };
								delete actionResult.__image;
								delete actionResult.__thumbnail;
								delete actionResult.__caption;
								delete actionResult.__source;
								delete actionResult.__meta;
							}

							nextMessages.push({
								role: "tool",
								toolCallId: callId,
								toolName: toolName,
								content: JSON.stringify(actionResult),
							});

							if (capturedImage) {
								pendingImageMessages.push({
									role: "tool_image",
									toolName: toolName,
									content: capturedCaption || "Screenshot",
									source: capturedSource || "",
									images: [capturedImage],
									thumbnails: capturedThumb ? [capturedThumb] : [],
									imageMeta: capturedMeta ? [capturedMeta] : [],
								});
							}

							nextMessages.push({
								role: "system",
								content: `Completed tool: ${toolName}`,
							});
							saveMessageLog(nextMessages);
						}

						if (pendingImageMessages.length > 0) {
							nextMessages.push(...pendingImageMessages);
							saveMessageLog(nextMessages);
						}

						if (queuedCommentRef.current) {
							const commentText = queuedCommentRef.current;
							queuedCommentRef.current = "";
							setQueuedComment("");

							nextMessages.push({
								role: "user",
								content: commentText,
							});
							saveMessageLog(nextMessages);
						}

						activeMessages = nextMessages;
						retryCount++;
						continue;
					}

					// Verbal final responses
					const finalMessages = [
						...activeMessages,
						{
							role: "assistant",
							content: message.content,
							reasoning: message.reasoning_content || null,
						},
					];
					saveMessageLog(finalMessages);
					break;
				}

				// 2. Chat / Streaming Reader
				else {
					const reader = response.body.getReader();
					const decoder = new TextDecoder();

					let streamDone = false;
					let thinkingAccumulator = "";
					let responseAccumulator = "";

					while (!streamDone) {
						const { value, done } = await reader.read();
						if (done) {
							streamDone = true;
							break;
						}

						const chunk = decoder.decode(value, { stream: true });
						const lines = chunk.split("\n");

						for (const line of lines) {
							const clean = line.trim();
							if (!clean || !clean.startsWith("data:")) continue;
							if (clean === "data: [DONE]") {
								streamDone = true;
								break;
							}

							try {
								const parsed = JSON.parse(clean.substring(5).trim());
								const delta = parsed.choices[0].delta;

								if (delta.reasoning_content) {
									thinkingAccumulator += delta.reasoning_content;
									setStreamingThinking(thinkingAccumulator);
								}
								if (delta.content) {
									responseAccumulator += delta.content;
									setStreamingResponse(responseAccumulator);
								}
							} catch {
								// Ignore parser slits
							}
						}
					}

					const finalMessages = [
						...activeMessages,
						{
							role: "assistant",
							content: responseAccumulator,
							reasoning: thinkingAccumulator || null,
						},
					];
					saveMessageLog(finalMessages);
					setStreamingResponse("");
					setStreamingThinking("");
					break;
				}
			}

			if (retryCount >= maxIterations) {
				const finalMessages = [
					...activeMessages,
					{
						role: "assistant",
						content: "⚠️ **Agent Iteration limit:** Executed too many recursive actions without summary.",
					},
				];
				saveMessageLog(finalMessages);
			}
		} catch (err) {
			console.error(err);
			const finalMessages = [
				...activeMessages,
				{
					role: "assistant",
					content: `❌ **API Connection Error:** ${err.message}`,
				},
			];
			saveMessageLog(finalMessages);
		} finally {
			setRetryNotice("");
			await flushSessionWrites();
			setIsGenerating(false);
			setLockedChatKey(null);
		}
	}

	// Trigger quick action pills
	async function triggerQuickAction(action, text = "", overrideTabId = null, overrideUrl = null) {
		if (isGeneratingRef.current) return;

		// A quick action (or a context-menu item) is an explicit "act on this page" gesture, so
		// the tab the user is pointing at is shared with the agent rather than refused.
		let targetTabId = overrideTabId;
		if (!targetTabId) {
			const [userTab] = await chrome.tabs.query({ active: true, currentWindow: true });
			targetTabId = userTab?.id || activeTabIdRef.current;
		}

		if (!targetTabId) {
			addLocalMessage("assistant", "⚠️ **No page to work on.** Open a webpage first, then try again.");
			return;
		}

		try {
			await shareTabWithAgent(targetTabId);
		} catch (err) {
			addLocalMessage("assistant", `❌ **Could not share this tab with the agent:** ${err.message}`);
			return;
		}

		try {
			const tab = await chrome.tabs.get(targetTabId);
			activeUrlRef.current = tab.url || overrideUrl || "";
			activeTabTitleRef.current = tab.title || "";
			setActiveUrl(activeUrlRef.current);
			setActiveTabTitle(activeTabTitleRef.current);
		} catch {
			activeUrlRef.current = overrideUrl || activeUrlRef.current;
		}

		// Race condition safeguard: if apiKey state is empty, fetch it directly from storage first
		let currentApiKey = apiKeyRef.current;
		if (!currentApiKey) {
			const result = await getStorage("apiKey").catch(() => ({}));
			currentApiKey = result.apiKey || "";
			if (currentApiKey) {
				setApiKey(currentApiKey);
				setApiKeyMissing(false);
				apiKeyRef.current = currentApiKey;
			}
		}

		if (!currentApiKey) {
			setApiKeyMissing(true);
			return;
		}

		if (action === "summarize") {
			const msgs = addLocalMessage("user", "Summarize this page content.");
			const activeMsgs = [...msgs, { role: "system", content: "Scraping readable page text..." }];
			saveMessageLog(activeMsgs);

			chrome.tabs.sendMessage(activeTabIdRef.current, { action: "GET_PAGE_TEXT" }, async (response) => {
				if (chrome.runtime.lastError || !response || !response.success) {
					addLocalMessage("assistant", "❌ **Unable to access page contents.** Active tab does not permit content script execution.");
					return;
				}

				const pageText = response.text;
				const systemContext = `Here is the clean text extracted from the webpage "${response.title}" (${response.url}):\n\n${pageText}`;
				await executeDeepSeekCall(systemContext, "Please write a comprehensive, sleek summary of this page content, listing key highlights and primary topics in bullet points.", activeMsgs);
			});
		} else if (action === "links") {
			const msgs = addLocalMessage("user", "Extract and analyze page links.");
			const activeMsgs = [...msgs, { role: "system", content: "Extracting hyperlinks..." }];
			saveMessageLog(activeMsgs);

			chrome.tabs.sendMessage(activeTabIdRef.current, { action: "EXTRACT_ALL_LINKS" }, async (response) => {
				if (chrome.runtime.lastError || !response || !response.success) {
					addLocalMessage("assistant", "❌ **Failed to retrieve links.** Content script blocked.");
					return;
				}

				const linksStr = response.links.map((l) => `- [${l.text}](${l.href})`).join("\n");
				const systemContext = `Here is a list of links extracted from this page:\n\n${linksStr}`;
				await executeDeepSeekCall(systemContext, "Analyze these links, group the interesting ones, and explain where they lead.", activeMsgs);
			});
		} else if (action === "search") {
			const query = window.prompt("What term do you want to find on the page?");
			if (!query) return;

			const msgs = addLocalMessage("user", `Search page for: "${query}"`);
			const activeMsgs = [...msgs, { role: "system", content: `Searching active DOM for "${query}"...` }];
			saveMessageLog(activeMsgs);

			chrome.tabs.sendMessage(activeTabIdRef.current, { action: "HIGHLIGHT_TEXT", query: query }, async (response) => {
				if (chrome.runtime.lastError || !response) {
					addLocalMessage("assistant", "❌ **Content script connection failure.**");
					return;
				}

				const count = response.matchCount || 0;
				const withFeedback = [
					...msgs,
					{
						role: "system",
						content: `Highlighted ${count} matches on the webpage.`,
					},
				];
				saveMessageLog(withFeedback);

				const systemContext = `The user searched for "${query}". We found and highlighted ${count} occurrences on the page.`;
				await executeDeepSeekCall(systemContext, `Summarize findings and provide context for "${query}" based on the webpage text.`, withFeedback);
			});
		} else if (action === "explain" && text) {
			addLocalMessage("user", `Explain this selected text:\n"${text}"`);
			await executeDeepSeekCall(null, `Explain this selected text from the active webpage:\n\n"${text}"`);
		}
	}

	// Ref to always hold the latest version of triggerQuickAction for stale-closure-free message listeners
	const triggerQuickActionRef = useRef(triggerQuickAction);
	useEffect(() => {
		triggerQuickActionRef.current = triggerQuickAction;
	});

	// Load configuration and observe tabs
	useEffect(() => {
		// Deferred so the initial state writes land outside the effect body
		const bootTimer = setTimeout(() => {
			loadSettings();
			trackAgentTab();
			trackUserActiveTab();
		}, 0);

		// Only changes inside the agent's own group are interesting. The user switching between
		// their own tabs is deliberately invisible here.
		let refreshTimer = null;
		const refresh = () => {
			if (refreshTimer) return;
			refreshTimer = setTimeout(() => {
				refreshTimer = null;
				trackAgentTab();
			}, 150);
		};

		// Cheap, write-nothing listeners that just keep note of the user's current tab
		const userTabHandler = () => trackUserActiveTab();

		const tabUpdateHandler = (_tabId, changeInfo, tab) => {
			if (tab?.active) trackUserActiveTab();
			if (!agentGroupIdRef.current) return;
			// changeInfo.groupId is the direct signal that a tab joined or left a group, which
			// is exactly how the user grants and revokes access
			if (changeInfo.groupId !== undefined) {
				refresh();
				return;
			}
			if (tab && tab.groupId !== agentGroupIdRef.current) return;
			if (changeInfo.status === "complete" || changeInfo.title || changeInfo.favIconUrl) {
				refresh();
			}
		};
		// Belt and braces: dragging a tab into a group also reorders the strip
		const tabMovedHandler = () => {
			if (agentGroupIdRef.current) refresh();
		};
		const tabRemovedHandler = (tabId) => {
			if (!agentGroupIdRef.current) return;
			if (tabId === activeTabIdRef.current) {
				activeTabIdRef.current = null;
			}
			refresh();
		};
		const groupRemovedHandler = (group) => {
			if (group.id !== agentGroupIdRef.current) return;
			setAgentGroup(null);
			activeTabIdRef.current = null;
			refresh();
		};

		chrome.tabs.onActivated.addListener(userTabHandler);
		chrome.windows.onFocusChanged.addListener(userTabHandler);
		chrome.tabs.onUpdated.addListener(tabUpdateHandler);
		chrome.tabs.onMoved.addListener(tabMovedHandler);
		chrome.tabs.onAttached.addListener(tabMovedHandler);
		chrome.tabs.onDetached.addListener(tabMovedHandler);
		chrome.tabs.onRemoved.addListener(tabRemovedHandler);
		chrome.tabGroups?.onRemoved.addListener(groupRemovedHandler);
		chrome.tabGroups?.onUpdated.addListener(tabMovedHandler);

		const messageHandler = (message) => {
			if (message.action === "CONTEXT_MENU_SUMMARIZE") {
				triggerQuickActionRef.current("summarize", "", message.tabId, message.url);
			} else if (message.action === "CONTEXT_MENU_EXPLAIN") {
				triggerQuickActionRef.current("explain", message.text, message.tabId, message.url);
			}
			return true;
		};
		chrome.runtime.onMessage.addListener(messageHandler);

		return () => {
			clearTimeout(bootTimer);
			if (refreshTimer) clearTimeout(refreshTimer);
			chrome.tabs.onActivated.removeListener(userTabHandler);
			chrome.windows.onFocusChanged.removeListener(userTabHandler);
			chrome.tabs.onUpdated.removeListener(tabUpdateHandler);
			chrome.tabs.onMoved.removeListener(tabMovedHandler);
			chrome.tabs.onAttached.removeListener(tabMovedHandler);
			chrome.tabs.onDetached.removeListener(tabMovedHandler);
			chrome.tabs.onRemoved.removeListener(tabRemovedHandler);
			chrome.tabGroups?.onRemoved.removeListener(groupRemovedHandler);
			chrome.tabGroups?.onUpdated.removeListener(tabMovedHandler);
			chrome.runtime.onMessage.removeListener(messageHandler);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Delegate copy-code clicks safely to avoid CSP violations (inline event handlers are banned in MV3)
	useEffect(() => {
		const handleGlobalClick = (e) => {
			const btn = e.target.closest(".copy-code-btn");
			if (btn) {
				const targetId = btn.getAttribute("data-copy-target");
				if (targetId) {
					const codeEl = document.getElementById(targetId);
					if (codeEl) {
						navigator.clipboard.writeText(codeEl.innerText).then(() => {
							const originalText = btn.innerText;
							btn.innerText = "Copied!";
							btn.classList.add("text-emerald-500", "dark:text-emerald-400");
							setTimeout(() => {
								btn.innerText = originalText;
								btn.classList.remove("text-emerald-500", "dark:text-emerald-400");
							}, 1500);
						}).catch((err) => {
							console.error("Failed to copy code: ", err);
						});
					}
				}
			}
		};

		document.addEventListener("click", handleGlobalClick);
		return () => {
			document.removeEventListener("click", handleGlobalClick);
		};
	}, []);

	// captureVisibleTab can only capture the ACTIVE tab of a window, so this is the only tool
	// that ever surfaces a tab. It restores whatever the user was looking at straight after —
	// and if the group has been popped into its own window, they see nothing at all.
	const captureScreenshot = async (groupId, toolName, args) => {
		const info = await getGroupInfo(groupId);
		const windowId = info?.windowId;

		let targetTabId = activeTabIdRef.current;
		if (!targetTabId || !(await isInGroup(groupId, targetTabId))) {
			const tabs = await getGroupTabs(groupId);
			if (tabs.length === 0) {
				return { success: false, error: `The "${AGENT_GROUP_TITLE}" group has no tabs to capture. Use open_tab first.` };
			}
			const real = tabs.find((t) => !isWorkspacePlaceholder(t.url));
			targetTabId = (real || tabs[0]).id;
			activeTabIdRef.current = targetTabId;
			setActiveTabId(targetTabId);
		}

		try {
			// captureVisibleTab only sees a window's active tab. The agent window is its own,
			// so activating there is free — and leaving it active keeps it consistent with
			// switch_to_tab instead of silently flipping back.
			// ponytail: if the user shared a tab from their own window, this activates in that
			// window. Restore the previous tab here if that turns out to matter.
			await chrome.tabs.update(targetTabId, { active: true }).catch(() => {});
			await new Promise((r) => setTimeout(r, 250));

			// A crop is re-encoded afterwards, so capture it losslessly: JPEG here plus JPEG
			// again after cropping would compress the same pixels twice.
			const wantsCrop = toolName === "screenshot_element";
			const fullDataUrl = await chrome.tabs.captureVisibleTab(windowId, wantsCrop ? { format: "png" } : { format: "jpeg", quality: CAPTURE_QUALITY });

			let image = fullDataUrl;
			let size = await getImageSize(fullDataUrl);

			if (wantsCrop) {
				if (!args.selector) {
					return { success: false, error: "selector is required for screenshot_element." };
				}
				const [{ result: rect } = {}] = await chrome.scripting.executeScript({
					target: { tabId: targetTabId },
					func: (selector) => {
						const el = document.querySelector(selector);
						if (!el) return null;
						el.scrollIntoView({ block: "center", behavior: "instant" });
						const r = el.getBoundingClientRect();
						return { x: r.x, y: r.y, width: r.width, height: r.height, dpr: window.devicePixelRatio || 1 };
					},
					args: [args.selector],
				});

				if (!rect) {
					return { success: false, error: `No element matched the selector "${args.selector}".` };
				}

				const cropped = await cropImage(fullDataUrl, rect, rect.dpr);
				image = cropped.dataUrl;
				size = { width: cropped.width, height: cropped.height };
			}

			// Hi-DPI displays hand back captures around 2900px wide. Vision models downscale
			// anything that large anyway, so sending it just inflates the request body and the
			// resolution-based token bill for no extra detail.
			image = await downscaleToMaxEdge(image);
			size = await getImageSize(image);

			const thumbnail = await makeThumbnail(image);
			const tab = await chrome.tabs.get(targetTabId);

			return {
				success: true,
				message: `Captured ${size.width}x${size.height} of ${tab.url}. The image is attached in the next message.`,
				__image: image,
				__thumbnail: thumbnail,
				__caption: toolName === "screenshot_element" ? `Screenshot of "${args.selector}" on ${tab.url}` : `Screenshot of ${tab.url}`,
				__source: toolName === "screenshot_element" ? `${args.selector} — ${tab.url}` : tab.url,
				__meta: { ...size, bytes: dataUrlBytes(image) },
			};
		} catch (err) {
			return { success: false, error: err.message };
		}
	};

	const executeContentScriptAction = async (toolName, args) => {
		// Device details are about the host machine, not a page, so this must not spin up a
		// workspace the user never asked for.
		if (toolName === "get_device_details") {
			return new Promise((resolve) => {
				devicePrivacyResolveRef.current = resolve;
				setShareOsAndPlatform(true);
				setShareHardware(true);
				setShareNetworkAndLocal(false);
				setDevicePrivacyTimer(30);
				setShowDevicePrivacyPrompt(true);
			});
		}

		// Every other tool runs inside the agent's tab group, which is created on demand.
		const { groupId } = await ensureAgentWorkspace();

		// --- Workspace tools: they choose the target rather than acting on a page ----------

		if (toolName === "list_open_tabs") {
			const tabs = await getGroupTabs(groupId);
			return {
				success: true,
				note: `These are the only tabs shared with you (the "${AGENT_GROUP_TITLE}" tab group). Every other tab in the browser is private to the user and invisible to you.`,
				tabs: tabs.map((t) => ({
					id: t.id,
					url: t.url,
					title: t.title,
					isCurrentTarget: t.id === activeTabIdRef.current,
				})),
			};
		}

		if (toolName === "switch_to_tab") {
			const numericTabId = parseInt(args.tabId);
			if (isNaN(numericTabId)) {
				return { success: false, error: "tabId must be a valid number." };
			}
			if (!(await isInGroup(groupId, numericTabId))) {
				return outOfScopeError(numericTabId);
			}

			activeTabIdRef.current = numericTabId;
			setActiveTabId(numericTabId);
			// Safe to actually show it: the group has its own window, so this never disturbs
			// whatever the user is looking at.
			await chrome.tabs.update(numericTabId, { active: true }).catch(() => {});
			await trackAgentTab();

			const tab = await chrome.tabs.get(numericTabId);
			return { success: true, message: `Now on tab ${numericTabId} ("${tab.title}").` };
		}

		if (toolName === "open_tab") {
			if (!args.url) return { success: false, error: "url is required." };
			try {
				const tab = await openInGroup(groupId, args.url);
				activeTabIdRef.current = tab.id;
				setActiveTabId(tab.id);
				await new Promise((r) => setTimeout(r, 1500));
				await trackAgentTab();
				return {
					success: true,
					tabId: tab.id,
					message: `Opened ${args.url} in a new background tab inside the agent group and targeted it.`,
				};
			} catch (err) {
				return { success: false, error: err.message };
			}
		}

		if (toolName === "use_current_tab") {
			const [userTab] = await chrome.tabs.query({ active: true, currentWindow: true });
			if (!userTab?.id) {
				return { success: false, error: "Could not determine which tab the user is on." };
			}
			if (isWorkspacePlaceholder(userTab.url)) {
				return {
					success: false,
					error: "The user is looking at your own workspace placeholder tab, which has no content. Ask them which page they mean, or open one with open_tab.",
				};
			}
			if (isRestrictedUrl(userTab.url)) {
				return {
					success: false,
					error: "The user is on a restricted Chrome page (chrome://, the Web Store, or a settings page). Chrome does not allow automation there. Ask them to switch to a normal website.",
				};
			}

			if (userTab.groupId !== groupId) {
				try {
					await adoptTab(groupId, userTab.id);
				} catch (err) {
					return { success: false, error: err.message };
				}
			}

			activeTabIdRef.current = userTab.id;
			setActiveTabId(userTab.id);
			await pruneBlankTabs(groupId, userTab.id);
			await trackAgentTab();

			return {
				success: true,
				tabId: userTab.id,
				url: userTab.url,
				title: userTab.title,
				message: `Moved the user's active tab into your group and targeted it: "${userTab.title}". You can now use your page tools on it.`,
			};
		}

		if (toolName === "close_tab") {
			const numericTabId = parseInt(args.tabId);
			if (isNaN(numericTabId)) {
				return { success: false, error: "tabId must be a valid number." };
			}
			if (!(await isInGroup(groupId, numericTabId))) {
				return outOfScopeError(numericTabId);
			}
			try {
				await chrome.tabs.remove(numericTabId);
			} catch (err) {
				return { success: false, error: err.message };
			}
			if (activeTabIdRef.current === numericTabId) {
				activeTabIdRef.current = null;
			}
			await trackAgentTab();
			return { success: true, message: `Closed tab ${numericTabId}.` };
		}

		// --- Screenshots: the one operation that needs its tab to be the active one --------

		if (toolName === "take_screenshot" || toolName === "screenshot_element") {
			if (!supportsImagesRef.current) {
				return { success: false, error: "Image support is turned off. The user must enable \"Image-capable model\" in settings first." };
			}
			return captureScreenshot(groupId, toolName, args);
		}

		// --- Everything below acts on a page, so resolve a live in-group target tab --------

		let targetTabId = activeTabIdRef.current;
		if (!targetTabId || !(await isInGroup(groupId, targetTabId))) {
			const tabs = await getGroupTabs(groupId);
			if (tabs.length === 0) {
				return {
					success: false,
					error: `The "${AGENT_GROUP_TITLE}" group has no tabs. Use open_tab to open a page, or ask the user to drag a tab into the group.`,
				};
			}
			// Prefer a real page over the workspace placeholder that holds the group open
			const real = tabs.find((t) => !isWorkspacePlaceholder(t.url));
			targetTabId = (real || tabs[0]).id;
			activeTabIdRef.current = targetTabId;
			setActiveTabId(targetTabId);
		}

		// The placeholder is an extension page: no content script, nothing to read. navigate_to
		// is exempt — putting content ON the placeholder is exactly what it is for, and refusing
		// it told the model to "use navigate_to", which is what it had just tried.
		const targetTab = toolName === "navigate_to" ? null : await chrome.tabs.get(targetTabId).catch(() => null);
		if (targetTab && isWorkspacePlaceholder(targetTab.url)) {
			return {
				success: false,
				error: "Your only tab is the empty workspace page, which has no content. Use open_tab or navigate_to to load a real page first.",
			};
		}

		return new Promise((resolve, reject) => {
			let payload;

			switch (toolName) {
				case "get_page_summary_content":
					payload = { action: "GET_PAGE_TEXT" };
					break;
				case "extract_all_links":
					payload = { action: "EXTRACT_ALL_LINKS" };
					break;
				case "query_dom_elements":
					payload = { action: "QUERY_DOM_ELEMENTS", selector: args.selector };
					break;
				case "click_element":
					payload = {
						action: "CLICK_ELEMENT",
						selector: args.selector,
						text: args.text,
					};
					break;
				case "fill_input":
					payload = {
						action: "FILL_INPUT",
						selector: args.selector,
						value: args.value,
					};
					break;
				case "scroll_to_element":
					payload = {
						action: "SCROLL_TO",
						selector: args.selector,
						direction: args.direction,
						amount: args.amount,
					};
					break;
				case "navigate_to":
					chrome.tabs.update(targetTabId, { url: args.url }, () => {
						if (chrome.runtime.lastError) {
							resolve({ success: false, error: chrome.runtime.lastError.message });
							return;
						}
						setTimeout(() => {
							trackAgentTab();
							resolve({
								success: true,
								message: `Navigated tab ${targetTabId} to ${args.url}`,
							});
						}, 2000);
					});
					return;
				case "highlight_text":
					payload = { action: "HIGHLIGHT_TEXT", query: args.query };
					break;
				case "execute_js_in_page": {
					chrome.scripting.executeScript({
						target: { tabId: targetTabId },
						func: (codeStr) => {
							try {
								const fn = new Function(codeStr);
								const result = fn();
								return { success: true, result: result !== undefined ? result : null };
							} catch (err) {
								return { success: false, error: err.message };
							}
						},
						args: [args.code]
					}, (results) => {
						if (chrome.runtime.lastError) {
							resolve({ success: false, error: chrome.runtime.lastError.message });
						} else {
							resolve(results && results[0]?.result ? results[0].result : { success: true, message: "Script executed successfully but returned no value." });
						}
					});
					return;
				}
				case "get_page_diagnostics": {
					chrome.scripting.executeScript({
						target: { tabId: targetTabId },
						func: () => {
							try {
								const performanceData = {};
								if (window.performance && window.performance.timing) {
									const t = window.performance.timing;
									performanceData.loadTimeMs = t.loadEventEnd - t.navigationStart;
									performanceData.domReadyTimeMs = t.domComplete - t.responseStart;
									performanceData.responseTimeMs = t.responseEnd - t.requestStart;
								}
								
								const metaTags = Array.from(document.querySelectorAll('meta')).map(m => ({
									name: m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv'),
									content: m.getAttribute('content')
								})).filter(m => m.name && m.content);

								return {
									success: true,
									url: window.location.href,
									title: document.title,
									ssl: window.location.protocol === 'https:',
									performance: performanceData,
									meta: metaTags,
									consoleCheck: "OK"
								};
							} catch (err) {
								return { success: false, error: err.message };
							}
						}
					}, (results) => {
						if (chrome.runtime.lastError) {
							resolve({ success: false, error: chrome.runtime.lastError.message });
						} else {
							resolve(results && results[0]?.result ? results[0].result : { success: false, error: "Failed to collect diagnostic data." });
						}
					});
					return;
				}
				default:
					reject(new Error(`Unknown tool action: ${toolName}`));
					return;
			}

			chrome.tabs.sendMessage(targetTabId, payload, (response) => {
				if (chrome.runtime.lastError) {
					reject(new Error(`Page Control Error: ${chrome.runtime.lastError.message}`));
				} else {
					resolve(response);
				}
			});
		});
	};

	const renderMarkdown = (text) => {
		if (!text) return "";

		// First, escape HTML characters to avoid raw script injections
		let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

		// Helper function for custom lightweight syntax highlighting
		const highlightCode = (code, lang) => {
			if (!lang) return code;
			const l = lang.toLowerCase();

			// Generate letter-only IDs (no digits) to prevent number-replacing regexes from matching/corrupting placeholder keys
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

					// Comment lines
					if (line.trim().startsWith("#")) {
						return `<span class="text-zinc-500 font-mono italic">${line}</span>`;
					}
					// Output lines (like "Output: ...")
					if (line.startsWith("Output:")) {
						return `<span class="text-blue-600 dark:text-blue-400 font-bold font-mono">${line}</span>`;
					}

					// Highlight URLs
					highlighted = highlighted.replace(/(https?:\/\/[^\s]+)/g, (url) => {
						const key = getLetterID(lineReplacements.length);
						const placeholder = `%%BASHREP${key}%%`;
						lineReplacements.push(`<span class="text-zinc-400 dark:text-zinc-500 underline font-mono">${url}</span>`);
						return placeholder;
					});

					// Highlight parameters/flags
					highlighted = highlighted.replace(/(--?\w+)/g, (flag) => {
						const key = getLetterID(lineReplacements.length);
						const placeholder = `%%BASHREP${key}%%`;
						lineReplacements.push(`<span class="text-amber-600 dark:text-amber-400 font-mono">${flag}</span>`);
						return placeholder;
					});

					// Command keywords
					const keywords = ["git clone", "git", "cd", "uv sync", "uv", "pip install", "pip", "npm run", "npm", "python", "node", "ultrarag run", "ultrarag", "echo"];
					keywords.forEach(keyword => {
						const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
						highlighted = highlighted.replace(regex, (match) => {
							const key = getLetterID(lineReplacements.length);
							const placeholder = `%%BASHREP${key}%%`;
							lineReplacements.push(`<span class="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">${match}</span>`);
							return placeholder;
						});
					});

					// Restore BASH placeholders
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

				// Comments
				highlighted = highlighted.replace(/(#.*)$/gm, (comment) => {
					const key = getLetterID(pythonReplacements.length);
					const placeholder = `%%PYREP${key}%%`;
					pythonReplacements.push(`<span class="text-zinc-500 font-mono italic">${comment}</span>`);
					return placeholder;
				});

				// Strings
				highlighted = highlighted.replace(/(".*?")/g, (str) => {
					const key = getLetterID(pythonReplacements.length);
					const placeholder = `%%PYREP${key}%%`;
					pythonReplacements.push(`<span class="text-emerald-600 dark:text-emerald-400 font-mono">${str}</span>`);
					return placeholder;
				});
				highlighted = highlighted.replace(/('.*?')/g, (str) => {
					const key = getLetterID(pythonReplacements.length);
					const placeholder = `%%PYREP${key}%%`;
					pythonReplacements.push(`<span class="text-emerald-600 dark:text-emerald-400 font-mono">${str}</span>`);
					return placeholder;
				});

				// Keywords
				const keywords = ["def", "class", "import", "from", "as", "return", "if", "elif", "else", "for", "while", "try", "except", "with", "in", "and", "or", "not", "print", "self"];
				keywords.forEach(keyword => {
					const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
					highlighted = highlighted.replace(regex, (match) => {
						const key = getLetterID(pythonReplacements.length);
						const placeholder = `%%PYREP${key}%%`;
						pythonReplacements.push(`<span class="text-blue-600 dark:text-blue-400 font-bold font-mono">${match}</span>`);
						return placeholder;
					});
				});

				// Restore Python placeholders
				for (let r = 0; r < pythonReplacements.length; r++) {
					const key = getLetterID(r);
					highlighted = highlighted.replace(`%%PYREP${key}%%`, pythonReplacements[r]);
				}
				return highlighted;
			}

			if (l === "javascript" || l === "js" || l === "jsx" || l === "ts" || l === "tsx") {
				let highlighted = code;
				const jsReplacements = [];

				// Comments
				highlighted = highlighted.replace(/(\/\/.*)$/gm, (comment) => {
					const key = getLetterID(jsReplacements.length);
					const placeholder = `%%JSREP${key}%%`;
					jsReplacements.push(`<span class="text-zinc-500 font-mono italic">${comment}</span>`);
					return placeholder;
				});
				highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, (comment) => {
					const key = getLetterID(jsReplacements.length);
					const placeholder = `%%JSREP${key}%%`;
					jsReplacements.push(`<span class="text-zinc-500 font-mono italic">${comment}</span>`);
					return placeholder;
				});

				// Strings
				highlighted = highlighted.replace(/(".*?")/g, (str) => {
					const key = getLetterID(jsReplacements.length);
					const placeholder = `%%JSREP${key}%%`;
					jsReplacements.push(`<span class="text-emerald-600 dark:text-emerald-400 font-mono">${str}</span>`);
					return placeholder;
				});
				highlighted = highlighted.replace(/('.*?')/g, (str) => {
					const key = getLetterID(jsReplacements.length);
					const placeholder = `%%JSREP${key}%%`;
					jsReplacements.push(`<span class="text-emerald-600 dark:text-emerald-400 font-mono">${str}</span>`);
					return placeholder;
				});
				highlighted = highlighted.replace(/(`.*?`)/g, (str) => {
					const key = getLetterID(jsReplacements.length);
					const placeholder = `%%JSREP${key}%%`;
					jsReplacements.push(`<span class="text-emerald-600 dark:text-emerald-400 font-mono">${str}</span>`);
					return placeholder;
				});

				// Keywords
				const keywords = ["const", "let", "var", "function", "return", "import", "export", "default", "from", "class", "extends", "if", "else", "for", "while", "try", "catch", "async", "await", "new", "this", "true", "false", "null", "undefined"];
				keywords.forEach(keyword => {
					const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
					highlighted = highlighted.replace(regex, (match) => {
						const key = getLetterID(jsReplacements.length);
						const placeholder = `%%JSREP${key}%%`;
						jsReplacements.push(`<span class="text-blue-600 dark:text-blue-400 font-bold font-mono">${match}</span>`);
						return placeholder;
					});
				});

				// Restore JS placeholders
				for (let r = 0; r < jsReplacements.length; r++) {
					const key = getLetterID(r);
					highlighted = highlighted.replace(`%%JSREP${key}%%`, jsReplacements[r]);
				}
				return highlighted;
			}

			if (l === "yaml" || l === "yml") {
				let lines = code.split("\n");
				lines = lines.map(line => {
					const yamlReplacements = [];
					let highlighted = line;

					// Comments
					if (line.trim().startsWith("#")) {
						const key = getLetterID(yamlReplacements.length);
						const placeholder = `%%YAMLREP${key}%%`;
						yamlReplacements.push(`<span class="text-zinc-500 font-mono italic">${line}</span>`);
						return placeholder;
					}

					// Keys and values
					const match = line.match(/^(\s*)([^#:]+):(.*)$/);
					if (match) {
						const indent = match[1];
						const key = match[2];
						const val = match[3];

						const keyId = getLetterID(yamlReplacements.length);
						const keyPlaceholder = `%%YAMLREP${keyId}%%`;
						yamlReplacements.push(`<span class="text-blue-600 dark:text-blue-400 font-semibold font-mono">${key}</span>`);

						const valId = getLetterID(yamlReplacements.length);
						const valPlaceholder = `%%YAMLREP${valId}%%`;
						yamlReplacements.push(`<span class="text-zinc-700 dark:text-zinc-300 font-mono">${val}</span>`);

						highlighted = `${indent}${keyPlaceholder}:${valPlaceholder}`;
					}

					// Restore YAML placeholders
					for (let r = 0; r < yamlReplacements.length; r++) {
						const key = getLetterID(r);
						highlighted = highlighted.replace(`%%YAMLREP${key}%%`, yamlReplacements[r]);
					}
					return highlighted;
				});
				return lines.join("\n");
			}

			if (l === "json") {
				let highlighted = code;
				const jsonReplacements = [];

				// 1. Keys (strings followed by colon)
				highlighted = highlighted.replace(/(".*?")(\s*:)/g, (match, key, colon) => {
					const idKey = getLetterID(jsonReplacements.length);
					const placeholder = `%%JSONREP${idKey}%%`;
					jsonReplacements.push(`<span class="text-blue-600 dark:text-blue-400 font-semibold font-mono">${key}</span>`);
					return placeholder + colon;
				});

				// 2. Value Strings (colon followed by string)
				highlighted = highlighted.replace(/(:\s*)(".*?")/g, (match, colon, val) => {
					const idKey = getLetterID(jsonReplacements.length);
					const placeholder = `%%JSONREP${idKey}%%`;
					jsonReplacements.push(`<span class="text-emerald-600 dark:text-emerald-400 font-mono">${val}</span>`);
					return colon + placeholder;
				});

				// 3. Booleans/Null
				highlighted = highlighted.replace(/\b(true|false|null)\b/g, (match) => {
					const idKey = getLetterID(jsonReplacements.length);
					const placeholder = `%%JSONREP${idKey}%%`;
					jsonReplacements.push(`<span class="text-amber-600 dark:text-amber-500 font-bold font-mono">${match}</span>`);
					return placeholder;
				});

				// 4. Numbers
				highlighted = highlighted.replace(/\b(\d+)\b/g, (match) => {
					const idKey = getLetterID(jsonReplacements.length);
					const placeholder = `%%JSONREP${idKey}%%`;
					jsonReplacements.push(`<span class="text-violet-600 dark:text-violet-400 font-mono">${match}</span>`);
					return placeholder;
				});

				// 5. Restore JSON placeholders
				for (let r = 0; r < jsonReplacements.length; r++) {
					const idKey = getLetterID(r);
					highlighted = highlighted.replace(`%%JSONREP${idKey}%%`, jsonReplacements[r]);
				}
				return highlighted;
			}

			return code;
		};

		// Extract code blocks and store them safely as raw placeholders to protect them from ALL subsequent formatting
		const codeBlocks = [];
		html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
			const id = "code-" + Math.random().toString(36).substring(2, 10);
			const cleanLang = lang ? lang.trim() : "";
			const highlighted = highlightCode(code.trim(), cleanLang);
			const codeHtml = `
<div class="my-2 rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/60 shadow-inner">
  <div class="flex justify-between items-center px-3 py-1.5 bg-zinc-100/80 dark:bg-zinc-900/80 text-[10px] text-zinc-500 dark:text-zinc-400 font-sans border-b border-zinc-200 dark:border-zinc-800 select-none">
    <span>${cleanLang ? cleanLang.toUpperCase() : "CODE"}</span>
    <button class="copy-code-btn hover:text-zinc-850 dark:hover:text-foreground transition-colors" data-copy-target="${id}">Copy</button>
  </div>
  <pre class="p-2.5 overflow-x-auto"><code id="${id}" class="font-mono text-zinc-700 dark:text-zinc-300 text-xs block leading-relaxed">${highlighted}</code></pre>
</div>`;
			codeBlocks.push(codeHtml);
			return `\n%%CODE_BLOCK_${codeBlocks.length - 1}%%\n`;
		});

		// Headings (H1 to H6)
		html = html
			.replace(/^######\s+(.+)$/gm, '<h6 class="text-[10px] font-bold uppercase tracking-wider text-zinc-455 mt-2.5 mb-1.5">$1</h6>')
			.replace(/^#####\s+(.+)$/gm, '<h5 class="text-[11px] font-semibold text-zinc-350 mt-2 mb-1">$1</h5>')
			.replace(/^####\s+(.+)$/gm, '<h4 class="text-xs font-bold text-zinc-300 mt-2 mb-1">$1</h4>')
			.replace(/^###\s+(.+)$/gm, '<h3 class="text-[13px] font-bold text-zinc-200 mt-2.5 mb-1">$1</h3>')
			.replace(/^##\s+(.+)$/gm, '<h2 class="text-sm font-bold text-zinc-100 border-b border-zinc-850/60 pb-0.5 mt-3.5 mb-1.5">$1</h2>')
			.replace(/^#\s+(.+)$/gm, '<h1 class="text-base font-extrabold text-white mt-4 mb-2">$1</h1>');

		// Horizontal rules (e.g. ---, ***, ___)
		html = html.replace(/^[-*_]{3,}$/gm, '<hr class="my-3 border-zinc-800/50" />');

		// Blockquotes (e.g. > text)
		html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="my-2.5 pl-3 border-l-2 border-zinc-755 text-zinc-400 italic bg-zinc-950/20 py-1.5 px-3 rounded-r">$1</blockquote>');

		// Markdown Links: [text](url)
		html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-500 hover:underline font-semibold">$1</a>');

		// Inline codes
		html = html.replace(/`([^`\n]+)`/g, '<code class="font-mono bg-zinc-950 px-1 py-0.5 rounded text-blue-400 text-[11px] border border-zinc-900/50">$1</code>');
		// Bold stars
		html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>');
		// Italic stars
		html = html.replace(/\*([^*]+)\*/g, '<em class="text-zinc-300">$1</em>');

		// Helper function to render a beautiful styled HTML table
		const renderHtmlTable = (headers, rows) => {
			let tHtml = `<div class="my-2.5 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/30">
        <table class="min-w-full divide-y divide-zinc-800 text-[11px] font-sans text-left">
          <thead class="bg-zinc-900/60 text-zinc-300 font-bold uppercase tracking-wider text-[9px]">
            <tr>`;
			headers.forEach((h) => {
				tHtml += `<th class="px-3 py-2 font-bold">${h}</th>`;
			});
			tHtml += `</tr>
          </thead>
          <tbody class="divide-y divide-zinc-850/40 text-zinc-300">`;
			rows.forEach((row, idx) => {
				const bgClass = idx % 2 === 0 ? "bg-zinc-950/10" : "bg-transparent";
				tHtml += `<tr class="${bgClass}">`;
				row.forEach((cell) => {
					tHtml += `<td class="px-3 py-2">${cell}</td>`;
				});
				tHtml += `</tr>`;
			});
			tHtml += `</tbody>
        </table>
      </div>`;
			return tHtml;
		};

		// Parse blocks line-by-line (for bullet lists and tables)
		const lines = html.split("\n");
		let inList = false;
		let listType = null;

		let inTable = false;
		let tableHeaderCols = null;
		let tableBodyRows = [];

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];

			// Table line detection
			const isTableLine = line.trim().startsWith("|");
			if (isTableLine) {
				// If list is active, close it
				if (inList) {
					lines[i - 1] += `</${listType}>`;
					inList = false;
					listType = null;
				}

				const isSeparator = /^\|\s*[:\-|\s]+\s*\|$/.test(line.trim());
				if (isSeparator) {
					// Clear separator line
					line = "";
					inTable = true;
					lines[i] = line;
					continue;
				}

				const cols = line
					.split("|")
					.slice(1, -1)
					.map((c) => c.trim());

				if (!inTable) {
					// Candidate for header row. Check if next row is a separator
					const nextLine = lines[i + 1];
					const nextIsSeparator = nextLine && /^\|\s*[:\-|\s]+\s*\|$/.test(nextLine.trim());
					if (nextIsSeparator) {
						tableHeaderCols = cols;
						line = "";
						lines[i] = line;
						continue;
					}
				} else {
					// Body row
					tableBodyRows.push(cols);
					line = "";
					lines[i] = line;
					continue;
				}
			} else {
				if (inTable) {
					// Table has ended! Render it
					const htmlTable = renderHtmlTable(tableHeaderCols, tableBodyRows);
					lines[i - 1] = htmlTable;
					inTable = false;
					tableHeaderCols = null;
					tableBodyRows = [];
				}
			}

			// List parsing
			const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
			const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);

			if (line.trim().startsWith("%%CODE_BLOCK_")) {
				// Keep placeholder line completely intact, don't wrap it in paragraphs!
			} else if (ulMatch) {
				if (!inList || listType !== "ul") {
					if (inList) lines[i - 1] += `</${listType}>`;
					line = `<ul class="list-disc list-inside pl-1 mb-2"><li>${ulMatch[2]}</li>`;
					inList = true;
					listType = "ul";
				} else {
					line = `<li>${ulMatch[2]}</li>`;
				}
			} else if (olMatch) {
				if (!inList || listType !== "ol") {
					if (inList) lines[i - 1] += `</${listType}>`;
					line = `<ol class="list-decimal list-inside pl-1 mb-2"><li>${olMatch[2]}</li>`;
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

				// Treat as plain paragraph unless it's an HTML block
				if (line.trim() && !line.startsWith("<div") && !line.startsWith("</div") && !line.startsWith("<h") && !line.startsWith("<p") && !line.startsWith("<pre") && !line.startsWith("</pre") && !line.startsWith("<blockquote") && !line.startsWith("</blockquote") && !line.startsWith("<hr") && !line.startsWith("<table") && !line.startsWith("</table")) {
					line = `<p class="mb-1.5 last:mb-0">${line}</p>`;
				}
			}
			lines[i] = line;
		}

		if (inTable) {
			const htmlTable = renderHtmlTable(tableHeaderCols, tableBodyRows);
			lines[lines.length - 1] = htmlTable;
		}

		if (inList) {
			lines[lines.length - 1] += `</${listType}>`;
		}

		let finalHtml = lines.join("\n");
		codeBlocks.forEach((codeHtml, idx) => {
			finalHtml = finalHtml.replace(`%%CODE_BLOCK_${idx}%%`, codeHtml);
		});

		return finalHtml;
	};

	// Images the user attached to their own message. Rendered inside the bubble, and clickable
	// into the same full-canvas viewer the agent's captures use.
	const renderAttachments = (msg) => {
		const previews = msg.images?.length ? msg.images : msg.thumbnails;
		if (!previews || previews.length === 0) {
			return msg.imagesStripped ? <div className="mt-1.5 font-mono text-[9px] opacity-60">[{msg.imagesStripped} image{msg.imagesStripped === 1 ? "" : "s"} not kept in history]</div> : null;
		}

		return (
			<div className="mt-1.5 flex flex-wrap gap-1.5">
				{previews.map((src, idx) => (
					<button
						key={idx}
						type="button"
						onClick={() => setLightbox({ src, alt: `Attached image ${idx + 1}`, meta: msg.imageMeta?.[idx] })}
						title="Open full size"
						className="block cursor-zoom-in overflow-hidden rounded-md border border-background/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						<img src={src} alt={`Attached image ${idx + 1}`} className="max-h-32 max-w-[140px] object-cover" />
					</button>
				))}
			</div>
		);
	};

	// A screenshot the agent took. Rendered as a tool result, left-aligned and clearly the
	// agent's own output — it only becomes a "user" message at request time, because that is
	// the only shape a vision API accepts an image in. Live runs show the full capture; a
	// reloaded session shows the stored thumbnail, since full-size images are never persisted.
	const renderToolImage = (msg, key) => {
		const previews = msg.images?.length ? msg.images : msg.thumbnails;
		const dropped = msg.imagesStripped || msg.thumbnailsDropped;
		const label = msg.toolName === "screenshot_element" ? "Element screenshot" : "Screenshot";
		const source = msg.source || msg.content || "";

		return (
			<div key={key} className="animate-fade-in flex w-full min-w-0 justify-start">
				<div className="flex w-full min-w-0 max-w-[88%] flex-col gap-1.5 overflow-hidden rounded-xl rounded-tl-none border border-zinc-800 bg-zinc-950/60 p-2.5 shadow-sm">
					<div className="flex min-w-0 items-center gap-1.5">
						<ImageIcon className="h-3 w-3 shrink-0 text-blue-500" />
						<span className="shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-blue-400">{label}</span>
						{source && (
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="min-w-0 flex-1 cursor-help truncate font-mono text-[9px] text-zinc-500" title={source}>
										{source}
									</span>
								</TooltipTrigger>
								<TooltipContent className="custom-tooltip max-w-[280px] break-all rounded-lg border border-zinc-850 bg-[#0e1118] px-2.5 py-1.5 font-mono text-[11px] leading-normal text-zinc-300 shadow-2xl">
									{source}
								</TooltipContent>
							</Tooltip>
						)}
					</div>

					{previews && previews.length > 0 ? (
						previews.map((src, idx) => (
							<button
								key={idx}
								type="button"
								onClick={() => setLightbox({ src, alt: source || "Agent screenshot", meta: msg.imageMeta?.[0] })}
								title="Open full size — scroll to zoom, drag to pan"
								className="group/shot relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							>
								<img src={src} alt={source || "Agent screenshot"} className="max-h-56 w-full object-contain transition-transform duration-200 group-hover/shot:scale-[1.015]" />
								<span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/0 opacity-0 transition-all duration-150 group-hover/shot:bg-background/45 group-hover/shot:opacity-100">
									<span className="flex items-center gap-1 rounded border border-foreground/25 bg-background/85 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-foreground">
										<Maximize2 className="h-2.5 w-2.5" /> Expand
									</span>
								</span>
							</button>
						))
					) : (
						<span className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-mono text-[10px] text-zinc-500">
							{dropped ? `${dropped} image not kept in history` : "Image unavailable"}
						</span>
					)}

					{msg.imageMeta?.[0] && (
						<span className="font-mono text-[9px] text-zinc-500">
							{msg.imageMeta[0].width}x{msg.imageMeta[0].height} · {formatBytes(msg.imageMeta[0].bytes)}
						</span>
					)}
				</div>
			</div>
		);
	};

	return (
		<TooltipProvider delayDuration={10}>
			<div className={`relative flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground ${theme}`}>
				{/* 1. Header Bar */}
				<ChatHeader
					activeFavicon={activeFavicon}
					activeDomain={activeDomain}
					theme={theme}
					showToolCallsDetail={showToolCallsDetail}
					showSettings={showSettings}
					handleNewChat={handleNewChat}
					handleCopyDebugLogs={handleCopyDebugLogs}
					handleToggleTheme={handleToggleTheme}
					setShowToolCallsDetail={setShowToolCallsDetail}
					setShowSettings={setShowSettings}
					fetchApiBalance={fetchApiBalance}
					persistSetting={persist}
					handleShareCurrentTab={handleShareCurrentTab}
				/>

				{/* 2. API Key Warning Alert banner */}
				{apiKeyMissing && (
					<div className="z-20 flex items-center justify-between border-b border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] font-medium text-rose-300">
						<div className="flex items-center gap-1.5">
							<ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
							<span>API credentials missing.</span>
						</div>
						<Button
							variant="destructive"
							size="xs"
							onClick={() => {
								setShowSettings(true);
								fetchApiBalance();
							}}
							className="h-5 rounded bg-rose-600 px-1.5 text-[10px] font-semibold hover:bg-rose-500"
						>
							Configure
						</Button>
					</div>
				)}

				{/* 2b. Storage health banner: warn early, pause and offer a way out when full */}
				{(() => {
					const ratio = storageUsage?.ratio ?? 0;
					if (!storageBlocked && !storageError && ratio < WARN_RATIO) return null;

					const isCritical = storageBlocked || !!storageError || ratio >= CRITICAL_RATIO;
					const tone = isCritical
						? "border-rose-500/20 bg-rose-500/10 text-rose-300"
						: "border-amber-500/20 bg-amber-500/10 text-amber-300";

					let message;
					if (storageBlocked) {
						message = "Browser storage is full. Chats are paused and nothing is being saved.";
					} else if (storageError) {
						message = `Last save failed: ${storageError}`;
					} else {
						message = `Storage ${Math.round(ratio * 100)}% full (${formatBytes(storageUsage.bytes)} of ${formatBytes(storageUsage.quota)}).`;
					}

					return (
						<div className={`z-20 flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] font-medium ${tone}`}>
							<div className="flex min-w-0 items-center gap-1.5">
								<AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${isCritical ? "text-rose-500" : "text-amber-500"}`} />
								<span className="truncate" title={message}>{message}</span>
							</div>
							<div className="flex shrink-0 items-center gap-1.5">
								<Button
									size="xs"
									onClick={handleFreeUpSpace}
									className={`h-5 rounded px-1.5 text-[10px] font-semibold ${isCritical ? "bg-rose-600 hover:bg-rose-500" : "bg-amber-600 hover:bg-amber-500"} text-accent-on`}
								>
									Free up space
								</Button>
								{storageBlocked && (
									<Button
										size="xs"
										variant="ghost"
										onClick={() => flushSessionWrites()}
										className="h-5 rounded border border-rose-500/30 px-1.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/10"
									>
										Retry save
									</Button>
								)}
							</div>
						</div>
					);
				})()}

				{/* 3. Chat Messages Scrolling Panel */}
				<main
					ref={chatAreaRef}
					onScroll={(e) => {
						const threshold = 35;
						const diff = e.target.scrollHeight - e.target.clientHeight - e.target.scrollTop;
						setUserScrolledUp(diff > threshold);
					}}
					className="flex flex-1 flex-col gap-3.5 overflow-y-auto bg-background p-3"
				>
					{/* Welcome Dashboard */}
					{getMessages().length === 0 ? (
						<div className="animate-fade-in my-auto flex flex-col items-center p-4 text-center">
							<div className="relative mb-4 flex items-center justify-center">
								<img src="icons/icon128.png" className="relative z-10 h-20 w-20 rounded-lg object-contain drop-shadow-[0_4px_12px_rgba(37,99,235,0.15)] filter" alt="Deepseek Browser Agent" />
							</div>

							<h1 className="mb-0.5 text-base font-bold tracking-tight text-zinc-100">Deepseek Browser Agent</h1>
							<p className="mb-3 max-w-[85%] text-[11px] leading-relaxed text-zinc-500">Interact, extract, and automate operations on the web using standard Deepseek models.</p>

							{/* Semantic tokens, not raw zinc shades: the light theme only remaps a
						    whitelist of dark utilities, so a bare bg-zinc-950/50 stays dark. */}
							<div className="mb-5 flex w-full items-start gap-2 rounded-lg border border-border bg-card p-2.5 text-left">
								<Layers className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
								<p className="text-[11px] leading-relaxed text-muted-foreground">
									The agent works only inside its own <span className="font-semibold text-foreground">{AGENT_GROUP_TITLE}</span> tab group. Drag a tab into the group to share it; everything outside stays private and untouched.
								</p>
							</div>

							<div className="flex w-full flex-col gap-1.5">
								<span className="pl-1 text-left text-[10px] font-bold uppercase tracking-wider text-zinc-500">Preset Operations</span>
								<div className="grid grid-cols-2 gap-2">
									<Card className="group col-span-2 flex cursor-pointer flex-col items-start gap-1 rounded-lg border-border bg-card p-2.5 transition-all duration-200 hover:border-primary/30 hover:bg-secondary/40" onClick={() => triggerQuickAction("summarize")}>
										<FileText className="h-4 w-4 text-blue-500 transition-transform duration-200 group-hover:scale-110" />
										<div className="text-left">
											<h4 className="text-[10px] font-bold text-card-foreground">Summarize Page</h4>
											<p className="text-[10px] text-muted-foreground">Extract clean text</p>
										</div>
									</Card>

									<Card className="group flex cursor-pointer flex-col items-start gap-1 rounded-lg border-border bg-card p-2.5 transition-all duration-200 hover:border-primary/30 hover:bg-secondary/40" onClick={() => triggerQuickAction("links")}>
										<Compass className="h-4 w-4 text-amber-500 transition-transform duration-200 group-hover:scale-110" />
										<div className="text-left">
											<h4 className="text-[10px] font-bold text-card-foreground">Analyze Links</h4>
											<p className="text-[10px] text-muted-foreground">Grab anchors list</p>
										</div>
									</Card>

									<Card className="group flex cursor-pointer flex-col items-start gap-1 rounded-lg border-border bg-card p-2.5 transition-all duration-200 hover:border-primary/30 hover:bg-secondary/40" onClick={() => triggerQuickAction("search")}>
										<Search className="h-4 w-4 text-emerald-500 transition-transform duration-200 group-hover:scale-110" />
										<div className="text-left">
											<h4 className="text-[10px] font-bold text-card-foreground">Deep Search</h4>
											<p className="text-[10px] text-muted-foreground">Find term matches</p>
										</div>
									</Card>
								</div>
							</div>
						</div>
					) : (
						<div className="flex flex-col gap-3">
							{(() => {
								const allMsgs = getMessages();
								const rendered = [];

								if (!showToolCallsDetail) {
									let i = 0;
									while (i < allMsgs.length) {
										const msg = allMsgs[i];
										if (isToolImageMessage(msg)) {
											rendered.push(renderToolImage(msg, `img-${i}`));
											i++;
											continue;
										}
										if (msg.role === "user") {
											rendered.push(
												<div key={`user-${i}`} className="group/msg animate-fade-in flex w-full justify-end">
													<div className="flex min-w-0 max-w-[88%] flex-col overflow-hidden">
														<div className="msg-user rounded-xl rounded-tr-none border border-foreground bg-foreground p-2.5 text-xs leading-relaxed text-background">
															<div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
															{msg.userUploaded && renderAttachments(msg)}
														</div>
														<CopyButton getText={() => msg.content} align="end" label="Copy your message" />
													</div>
												</div>
											);
											i++;
											continue;
										}
										if (msg.role === "system") {
											if (msg.content.startsWith("Agent action:") || msg.content.startsWith("Completed tool:") || msg.content.startsWith("Blocked:")) {
												i++;
												continue;
											}
											rendered.push(
												<div key={`sys-${i}`} className="animate-fade-in flex justify-center max-w-full">
													<div className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-1 font-mono text-[10px] text-zinc-500 max-w-[95%] overflow-hidden">
														<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 shrink-0" />
														<div className="leading-normal">{parseSystemMessage(msg.content)}</div>
													</div>
												</div>
											);
											i++;
											continue;
										}
										if (msg.role === "tool") {
											i++;
											continue;
										}
										if (msg.role === "escalation_request") {
											rendered.push(
												<div key={`esc-${i}`} className="animate-fade-in flex w-full justify-center">
													<Card className="w-full max-w-[95%] gap-2 border-amber-500/20 bg-amber-500/5 shadow-sm">
														<CardHeader className="gap-1 pb-1">
															<CardTitle className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500">
																<ShieldAlert className="h-4 w-4 text-amber-500/80" />
																<span>Scope Elevation Requested</span>
															</CardTitle>
															<CardDescription className="mt-1 text-xs leading-relaxed text-zinc-300">Deepseek Browser Agent requests browser access.</CardDescription>
														</CardHeader>
														<CardContent className="pb-2 text-xs text-zinc-300">
															<p className="border-l border-amber-500/25 pl-1.5 text-[10px] italic text-zinc-400">Reason: &quot;{msg.reason}&quot;</p>
														</CardContent>
														<CardFooter className="border-t-0 bg-transparent pb-3 pt-0">
															<span className="text-zinc-650 text-[10px] font-bold uppercase tracking-wider">RESOLVED</span>
														</CardFooter>
													</Card>
												</div>
											);
											i++;
											continue;
										}
										if (msg.role === "assistant") {
											// Render the assistant verbal content (if any, omitting thoughts/reasoning)
											if (msg.content && msg.content.trim() !== "") {
												rendered.push(
													<div key={`asst-content-${i}`} className="group/msg animate-fade-in flex w-full justify-start">
														<div className="flex min-w-0 max-w-[88%] flex-col overflow-hidden">
															<div className="border-zinc-850 rounded-xl rounded-tl-none border bg-zinc-950/60 p-2.5 text-xs leading-relaxed text-zinc-300 shadow-sm">
																<div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
															</div>
															<CopyButton getText={() => msg.content} align="start" label="Copy reply" />
														</div>
													</div>
												);
											}

											// Aggregated tool calls block starting at this assistant message
											if (msg.toolCalls && msg.toolCalls.length > 0) {
												let toolCallCount = 0;
												// Screenshots taken during this run are hoisted out of the collapsed block —
												// an image IS the answer, so it stays visible when the step-by-step tool
												// log is hidden.
												const capturedImages = [];
												let j = i;
												while (j < allMsgs.length) {
													const m = allMsgs[j];
													if (m.role === "user" || m.role === "escalation_request") {
														break;
													}
													if (isToolImageMessage(m)) {
														capturedImages.push({ msg: m, at: j });
													}
													if (m.role === "assistant") {
														// If it's a subsequent assistant message with verbal content, break
														if (j > i && m.content && m.content.trim() !== "") {
															break;
														}
														if (m.toolCalls && m.toolCalls.length > 0) {
															toolCallCount += m.toolCalls.length;
														}
													}
													j++;
												}

												if (toolCallCount > 0) {
													rendered.push(
														<div key={`tc-sep-${i}`} className="animate-fade-in">
															<Tooltip>
																<TooltipTrigger asChild>
																	<div className="flex items-center my-3 text-[10px] text-zinc-450 dark:text-zinc-500 select-none w-full cursor-help hover:opacity-85 transition-opacity">
																		<div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-zinc-300 dark:to-zinc-800/80" />
																		<span className="px-3 font-mono font-bold tracking-wide text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5 whitespace-nowrap">
																			--- {toolCallCount} tool {toolCallCount === 1 ? "call" : "calls"} ---
																		</span>
																		<div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-zinc-300 dark:to-zinc-800/80" />
																	</div>
																</TooltipTrigger>
																<TooltipContent className="custom-tooltip flex max-w-[260px] flex-col gap-1.5 rounded-lg border border-zinc-850 bg-[#0e1118] p-2.5 text-[11px] text-zinc-300 shadow-2xl leading-normal">
																	<span className="font-semibold text-zinc-100">Tool Calls Hidden</span>
																	<span>To view details of all active tools, enable detailed tool logs in the top header by clicking the</span>
																	<span className="flex items-center gap-1 w-max rounded border border-blue-500/25 bg-blue-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-400 tracking-wide uppercase select-none">
																		<Terminal className="h-3 w-3" /> Terminal
																	</span>
																	<span>icon.</span>
																</TooltipContent>
															</Tooltip>
														</div>
													);
												}
												capturedImages.forEach(({ msg: shot, at }) => rendered.push(renderToolImage(shot, `tc-img-${at}`)));

												i = j;
												continue;
											}
										}
										i++;
									}
								} else {
									allMsgs.forEach((msg, index) => {
										if (isToolImageMessage(msg)) {
											rendered.push(renderToolImage(msg, `img-${index}`));
											return;
										}
										if (msg.role === "system") {
											if (msg.content.startsWith("Agent action:") || msg.content.startsWith("Completed tool:") || msg.content.startsWith("Blocked:")) return;
											rendered.push(
												<div key={`sys-${index}`} className="animate-fade-in flex justify-center max-w-full">
													<div className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-1 font-mono text-[10px] text-zinc-500 max-w-[95%] overflow-hidden">
														<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 shrink-0" />
														<div className="leading-normal">{parseSystemMessage(msg.content)}</div>
													</div>
												</div>
											);
											return;
										}
										if (msg.role === "tool") return;
										if (msg.role === "escalation_request") {
											rendered.push(
												<div key={`esc-${index}`} className="animate-fade-in flex w-full justify-center">
													<Card className="w-full max-w-[95%] gap-2 border-amber-500/20 bg-amber-500/5 shadow-sm">
														<CardHeader className="gap-1 pb-1">
															<CardTitle className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-500">
																<ShieldAlert className="h-4 w-4 text-amber-500/80" />
																<span>Scope Elevation Requested</span>
															</CardTitle>
															<CardDescription className="mt-1 text-xs leading-relaxed text-zinc-300">Deepseek Browser Agent requests browser access.</CardDescription>
														</CardHeader>
														<CardContent className="pb-2 text-xs text-zinc-300">
															<p className="border-l border-amber-500/25 pl-1.5 text-[10px] italic text-zinc-400">Reason: &quot;{msg.reason}&quot;</p>
														</CardContent>
														<CardFooter className="border-t-0 bg-transparent pb-3 pt-0">
															<span className="text-zinc-650 text-[10px] font-bold uppercase tracking-wider">RESOLVED</span>
														</CardFooter>
													</Card>
												</div>
											);
											return;
										}
										rendered.push(
											<div key={`msg-${index}`} className={`group/msg animate-fade-in flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
												<div className="flex min-w-0 max-w-[88%] flex-col gap-0.5 overflow-hidden">
													<div className={`rounded-xl text-xs leading-relaxed ${msg.role === "user" ? "msg-user rounded-tr-none border border-foreground bg-foreground px-4 py-2.5 text-background" : "p-2.5 border-zinc-850 rounded-tl-none border bg-zinc-950/60 text-zinc-300 shadow-sm"}`}>
														{msg.reasoning && (
															<details className="group mb-2 max-w-full rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden transition-all duration-200">
																<summary className="flex items-center justify-between px-2.5 py-1.5 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-colors select-none font-mono text-[9px] font-bold text-amber-500 uppercase tracking-widest list-none">
																	<div className="flex items-center gap-1.5">
																		<span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
																		<span>Thinking Process</span>
																	</div>
																	<span className="text-zinc-500 group-open:rotate-180 transition-transform duration-200 font-sans text-xs">▼</span>
																</summary>
																<div className="p-2.5 border-t border-amber-500/10 bg-transparent">
																	<pre className="whitespace-pre-wrap font-mono text-[10px] leading-normal text-amber-500/80 select-text overflow-x-auto">
																		{msg.reasoning}
																	</pre>
																</div>
															</details>
														)}
														{msg.content && <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />}
														{msg.userUploaded && renderAttachments(msg)}
														{msg.toolCalls && msg.toolCalls.length > 0 && (
															<div className="mt-2 flex w-full flex-col gap-2 border-t border-zinc-800/60 pt-2">
																{msg.toolCalls.map((tc) => {
																	const toolName = tc.function.name;
																	const toolArgs = tc.function.arguments || "";
																	const toolResultMsg = allMsgs.find((m) => m.role === "tool" && m.toolCallId === tc.id);
																	let success = true, errorMsg = "", resultStr = toolResultMsg ? toolResultMsg.content : "", isPending = !toolResultMsg;
																	if (toolResultMsg) {
																		try {
																			const parsed = JSON.parse(toolResultMsg.content);
																			if (parsed.success === false) { success = false; errorMsg = parsed.error || parsed.message || "Execution failed"; }
																			else if (parsed.error) { success = false; errorMsg = parsed.error; }
																		} catch { /* non-JSON content */ }
																	}
																	let parsedArgs = null, argsSummary = "";
																	try {
																		if (toolArgs) {
																			parsedArgs = JSON.parse(toolArgs);
																			if (parsedArgs.selector) argsSummary = `selector: "${parsedArgs.selector}"`;
																			else if (parsedArgs.url) argsSummary = `url: "${parsedArgs.url}"`;
																			else if (parsedArgs.text) argsSummary = `text: "${parsedArgs.text}"`;
																			else if (parsedArgs.query) argsSummary = `query: "${parsedArgs.query}"`;
																			else if (parsedArgs.direction) argsSummary = `${parsedArgs.direction} (${parsedArgs.amount || 300}px)`;
																			else if (parsedArgs.tabId) argsSummary = `tabId: ${parsedArgs.tabId}`;
																		}
																	} catch { /* non-JSON args */ }
																	return (
																		<details key={tc.id} className="border-zinc-850 group overflow-hidden rounded-lg border bg-zinc-950/70 shadow-inner transition-all">
																			<summary className="flex cursor-pointer select-none items-center justify-between bg-zinc-900/10 p-2 font-mono text-[10px] transition-colors hover:bg-zinc-900/30">
																				<div className="flex items-center gap-2 truncate pr-2">
																					{isPending ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" /> : success ? <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" /> : <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" />}
																					<span className="shrink-0 font-bold text-zinc-300">{toolName}</span>
																					{argsSummary && <span className="text-zinc-550 max-w-[130px] truncate font-sans">({argsSummary})</span>}
																				</div>
																				<div className="flex shrink-0 items-center gap-1.5">
																					<span className={`rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${isPending ? "bg-blue-500/10 text-blue-400" : success ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>{isPending ? "running" : success ? "success" : "failed"}</span>
																					<span className="text-zinc-650 text-[9px] transition-transform duration-200 group-open:rotate-180">▼</span>
																				</div>
																			</summary>
																			<div className="border-zinc-850 flex flex-col gap-2.5 border-t bg-zinc-950/90 p-2.5">
																				{parsedArgs && (
																					<div className="flex flex-col gap-0.5">
																						<span className="font-sans text-[8px] font-bold uppercase tracking-wider text-zinc-500">Parameters</span>
																						<pre className="overflow-x-auto rounded border border-zinc-900/60 bg-zinc-950 p-1.5 font-mono text-[9px] text-zinc-400">{JSON.stringify(parsedArgs, null, 2)}</pre>
																					</div>
																				)}
																				{!isPending && (
																					<div className="flex flex-col gap-0.5">
																						<span className="font-sans text-[8px] font-bold uppercase tracking-wider text-zinc-500">Result</span>
																						{errorMsg && (
																							<div className="mb-1 flex items-start gap-1 rounded border border-rose-900/30 bg-rose-950/20 px-2 py-1 font-sans text-[9px] font-medium text-rose-400">
																								<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
																								<span>Error: {errorMsg}</span>
																							</div>
																						)}
																						<pre className="max-h-28 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded border border-zinc-900/60 bg-zinc-950 p-1.5 font-mono text-[9px] leading-normal text-zinc-300">
																							{(() => { try { return JSON.stringify(JSON.parse(resultStr), null, 2); } catch { return resultStr; } })()}
																						</pre>
																					</div>
																				)}
																			</div>
																		</details>
																	);
																})}
															</div>
														)}
													</div>
												<CopyButton getText={() => msg.content || msg.reasoning || ""} align={msg.role === "user" ? "end" : "start"} label={msg.role === "user" ? "Copy your message" : "Copy reply"} />
												</div>
											</div>
										);
									});
								}
								return rendered;
							})()}

							{/* Queued Comment Bubble */}
							{queuedComment && (
								<div className="animate-fade-in flex w-full justify-end">
									<div className="flex min-w-0 max-w-[88%] flex-col gap-0.5 overflow-hidden">
										<div className="rounded-xl rounded-tr-none border border-dashed border-amber-500/40 bg-amber-500/5 p-2.5 text-xs leading-relaxed text-amber-300/80">
											<div className="mb-1 flex items-center gap-1.5">
												<MessageSquarePlus className="h-3 w-3 text-amber-500/70" />
												<span className="text-[9px] font-bold uppercase tracking-wider text-amber-500/70">Queued Comment</span>
											</div>
											<div className="text-xs text-amber-200/70">{queuedComment}</div>
											<div className="mt-1.5 text-[9px] italic text-amber-500/50">Waiting for current tool call to complete...</div>
										</div>
									</div>
								</div>
							)}

							{/* Streaming Message renderers */}
							{(streamingThinking || streamingResponse) && (
								<div className="animate-fade-in flex w-full justify-start">
									<div className="flex min-w-0 max-w-[88%] flex-col gap-0.5 overflow-hidden">
										<div className="border-zinc-850 rounded-xl rounded-tl-none border bg-zinc-950/60 p-2.5 text-zinc-300 shadow-sm">
											{streamingThinking && showToolCallsDetail && (
												<div className="mb-2 max-w-full rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
													<div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1 select-none">Thinking Process...</div>
													<div className="whitespace-pre-wrap font-mono text-[10px] leading-normal text-amber-500/80">{streamingThinking}</div>
												</div>
											)}
											{streamingResponse && <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingResponse) }} />}
										</div>
									</div>
								</div>
							)}

							{/* Transient upstream retry — the run has not failed, it is waiting */}
							{retryNotice && (
								<div className="animate-fade-in flex w-full justify-center">
									<div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 font-mono text-[10px] text-amber-500">
										<Loader2 className="h-3 w-3 animate-spin" />
										<span>{retryNotice}</span>
									</div>
								</div>
							)}

							{/* Standard pulse loading indicator */}
							{isGenerating && !streamingThinking && !streamingResponse && (
								<div className="animate-fade-in flex w-full justify-start">
									<div className="border-zinc-850 flex items-center gap-1 rounded-xl rounded-tl-none border bg-zinc-950/60 p-2 shadow-sm">
										<div className="h-1 w-1 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "0s" }} />
										<div className="h-1 w-1 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "0.2s" }} />
										<div className="h-1 w-1 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "0.4s" }} />
									</div>
								</div>
							)}
						</div>
					)}
				</main>

				{/* 5. Bottom Input Area */}
				<footer className="z-30 border-t border-border bg-background p-2.5">
					<form onSubmit={handleSubmitMessage} className="flex flex-col gap-2">
						<div className="flex w-full flex-col gap-1.5">
							<div className="flex items-center justify-between px-1">
								<div className="flex items-center gap-1 font-mono text-[9px] font-bold text-zinc-500 leading-none select-none">
									<span>CONTEXT:</span>
									<span className="text-blue-500 font-semibold">{estimateContextTokens(getMessages()).toLocaleString()}</span>
									<span className="text-[8px] opacity-75 font-normal">tokens</span>
									{supportsImages &&
										(() => {
											const attached = getMessages().filter((m) => m.images?.length || m.thumbnails?.length).length;
											if (attached === 0) return null;
											const sent = Math.min(attached, MAX_IMAGES_PER_REQUEST);
											return (
												<Tooltip>
													<TooltipTrigger asChild>
														<span className="ml-1 cursor-help text-amber-500/80">+{sent} img</span>
													</TooltipTrigger>
													<TooltipContent className="custom-tooltip max-w-[220px] rounded-lg border border-zinc-850 bg-[#0e1118] px-2.5 py-1.5 text-[11px] leading-normal text-zinc-300 shadow-2xl">
														<span>
															{attached} screenshot{attached === 1 ? "" : "s"} in this chat; the {sent} most recent {sent === 1 ? "is" : "are"} sent with each request to limit token cost.
														</span>
													</TooltipContent>
												</Tooltip>
											);
										})()}
								</div>

								{/* Workspace status. Never an error: the agent opens its own pages, so a
							    target tab without a content script is a normal resting state, not a
							    fault the user has to fix. */}
								<div className="flex items-center gap-1.5 text-[10px] font-bold leading-none select-none">
									<span className={`h-1 w-1 rounded-full ${agentGroupId ? "animate-pulse bg-blue-600" : "bg-zinc-600"}`} />
									<span className="text-muted-foreground">{agentGroupId ? `WORKSPACE ACTIVE${groupTabs.length ? ` · ${groupTabs.length} TAB${groupTabs.length === 1 ? "" : "S"}` : ""}` : "NO WORKSPACE YET"}</span>
								</div>
							</div>
						</div>

						{/* Pending attachments, above the input so they never crowd the caret */}
						{supportsImages && (attachments.length > 0 || attachError) && (
							<div className="animate-fade-in flex flex-col gap-1.5">
								{attachments.length > 0 && (
									<div className="flex flex-wrap gap-1.5">
										{attachments.map((a) => (
											<div key={a.id} className="group/att relative h-12 w-12 overflow-hidden rounded-md border border-border bg-card">
												<img src={a.thumbnail || a.dataUrl} alt={a.name} title={`${a.name} · ${a.meta.width}x${a.meta.height} · ${formatBytes(a.meta.bytes)}`} className="h-full w-full object-cover" />
												<button
													type="button"
													onClick={() => removeAttachment(a.id)}
													aria-label={`Remove ${a.name}`}
													className="absolute right-0 top-0 flex h-4 w-4 cursor-pointer items-center justify-center rounded-bl-md border-b border-l border-border bg-background/90 text-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover/att:opacity-100 focus-visible:opacity-100"
												>
													<XIcon className="h-2.5 w-2.5" />
												</button>
											</div>
										))}
									</div>
								)}
								{attachError && <span className="font-mono text-[9px] text-amber-500">{attachError}</span>}
							</div>
						)}

						<div className="flex items-end gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-inner transition-all focus-within:!border-blue-600 hover:border-zinc-700/60">
							{supportsImages && (
								<>
									<input
										ref={fileInputRef}
										type="file"
										accept="image/*"
										multiple
										className="hidden"
										onChange={(e) => {
											addFiles(e.target.files);
											e.target.value = "";
										}}
									/>
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={() => fileInputRef.current?.click()}
												disabled={storageBlocked}
												aria-label="Attach an image"
												className="mb-0.5 flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-zinc-500 transition-colors hover:border-border hover:text-foreground disabled:opacity-40"
											>
												<Paperclip className="h-3.5 w-3.5" />
											</button>
										</TooltipTrigger>
										<TooltipContent className="custom-tooltip max-w-[220px] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-normal text-popover-foreground shadow-2xl">
											<span>Attach an image (or paste one). Up to {MAX_IMAGES_PER_REQUEST} per message.</span>
										</TooltipContent>
									</Tooltip>
								</>
							)}

							<textarea
								ref={inputRef}
								rows={1}
								value={inputMessage}
								onChange={handleInputChange}
								onKeyDown={handleKeyDown}
								onPaste={handleComposerPaste}
								disabled={storageBlocked}
								placeholder={storageBlocked ? "Storage full — chats paused. Free up space to continue." : isGenerating ? "Type a comment to queue for the agent..." : "Ask a question or request page actions..."}
								className="max-h-20 flex-1 resize-none border-none bg-transparent py-1 text-xs leading-normal text-zinc-200 placeholder-zinc-600 outline-none disabled:cursor-not-allowed disabled:opacity-60"
							/>

							{isGenerating && !inputMessage.trim() ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button type="button" onClick={handleStopAgent} size="icon-xs" className="flex-shrink-0 cursor-pointer rounded-md bg-rose-600 text-accent-on shadow-md hover:bg-rose-500 animate-pulse">
											<Square className="h-3 w-3" />
										</Button>
									</TooltipTrigger>
									<TooltipContent className="custom-tooltip rounded-lg border border-zinc-850 bg-[#0e1118] px-2.5 py-1.5 text-[11px] text-zinc-300 shadow-2xl">
										<span>Stop Agent Execution</span>
									</TooltipContent>
								</Tooltip>
							) : isGenerating && inputMessage.trim() ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button type="submit" size="icon-xs" className="flex-shrink-0 cursor-pointer rounded-md bg-amber-600 text-accent-on shadow-md hover:bg-amber-500">
											<MessageSquarePlus className="h-3 w-3" />
										</Button>
									</TooltipTrigger>
									<TooltipContent className="custom-tooltip rounded-lg border border-zinc-850 bg-[#0e1118] px-2.5 py-1.5 text-[11px] text-zinc-300 shadow-2xl">
										<span>Queue Comment for Agent</span>
									</TooltipContent>
								</Tooltip>
							) : (
								<Button type="submit" disabled={(!inputMessage.trim() && attachments.length === 0) || storageBlocked} size="icon-xs" className="flex-shrink-0 cursor-pointer rounded-md bg-blue-600 text-accent-on shadow-md hover:bg-blue-500">
									<Send className="h-3 w-3" />
								</Button>
							)}
						</div>
					</form>
				</footer>

				{/* Device details privacy selection prompt overlay modal */}
				{showDevicePrivacyPrompt && (
					<div className="animate-fade-in absolute inset-0 z-40 flex items-center justify-center bg-background/60 p-4 backdrop-blur-md">
						<Card className="animate-scale-up flex w-full max-w-[290px] flex-col gap-4 border-zinc-800 bg-zinc-950/90 p-4 shadow-2xl">
							<CardHeader className="flex flex-col items-center gap-1.5 p-0 text-center">
								<div className="relative mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
									<ShieldAlert className="h-5 w-5 text-blue-400" />
									<span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 font-mono text-[11px] font-bold text-zinc-950 animate-pulse">
										{devicePrivacyTimer}
									</span>
								</div>
								<CardTitle className="text-xs font-bold tracking-tight text-zinc-200">Device Privacy Request</CardTitle>
								<CardDescription className="text-zinc-400 text-[11px] leading-normal">
									The agent requested details about this device. Choose what you want to share.
								</CardDescription>
							</CardHeader>

							<CardContent className="flex flex-col gap-3 p-0">
								<div className="flex flex-col gap-2 rounded-lg border border-zinc-850 bg-zinc-900/40 p-2.5">
									<label className="flex cursor-pointer items-start gap-2.5 select-none text-left">
										<input
											type="checkbox"
											checked={shareOsAndPlatform}
											onChange={(e) => setShareOsAndPlatform(e.target.checked)}
											className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-zinc-700 bg-zinc-950 text-blue-600 accent-blue-500 focus:ring-0 focus:ring-offset-0"
										/>
										<div className="flex flex-col">
											<span className="text-[11px] font-bold text-zinc-200">OS & Platform</span>
											<span className="text-[11px] leading-snug text-zinc-400">OS Name (e.g. Linux), CPU Arch (e.g. x64)</span>
										</div>
									</label>

									<label className="mt-1 flex cursor-pointer items-start gap-2.5 select-none text-left border-t border-zinc-850 pt-2">
										<input
											type="checkbox"
											checked={shareHardware}
											onChange={(e) => setShareHardware(e.target.checked)}
											className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-zinc-700 bg-zinc-950 text-blue-600 accent-blue-500 focus:ring-0 focus:ring-offset-0"
										/>
										<div className="flex flex-col">
											<span className="text-[11px] font-bold text-zinc-200">Hardware Info</span>
											<span className="text-[11px] leading-snug text-zinc-400">Logical CPU Cores, System Memory, Resolution</span>
										</div>
									</label>

									<label className="mt-1 flex cursor-pointer items-start gap-2.5 select-none text-left border-t border-zinc-850 pt-2">
										<input
											type="checkbox"
											checked={shareNetworkAndLocal}
											onChange={(e) => setShareNetworkAndLocal(e.target.checked)}
											className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-zinc-700 bg-zinc-950 text-blue-600 accent-blue-500 focus:ring-0 focus:ring-offset-0"
										/>
										<div className="flex flex-col">
											<span className="text-[11px] font-bold text-zinc-200">Network & Timezone</span>
											<span className="text-[11px] leading-snug text-zinc-400">Connection Speed, Timezone, Language</span>
										</div>
									</label>
								</div>
							</CardContent>

							<CardFooter className="flex flex-col gap-2 p-0">
								<Button
									onClick={() => handleResolveDeviceDetails(shareOsAndPlatform, shareHardware, shareNetworkAndLocal)}
									className="w-full cursor-pointer rounded-lg bg-blue-600 py-2 text-xs font-bold text-accent-on transition-colors hover:bg-blue-500"
								>
									Send Selected Details
								</Button>
								<Button
									variant="ghost"
									onClick={() => handleResolveDeviceDetails(false, false, false)}
									className="border-zinc-850 w-full rounded-lg border py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
								>
									Block / Send Nothing
								</Button>
								<div className="text-zinc-500 text-[11px] font-medium text-center leading-normal">
									Timeout: Automatically shares OS & Hardware in {devicePrivacyTimer}s
								</div>
							</CardFooter>
						</Card>
					</div>
				)}


				{/* Full-canvas screenshot viewer */}
				{lightbox && <ImageLightbox src={lightbox.src} alt={lightbox.alt} meta={lightbox.meta} onClose={() => setLightbox(null)} />}

				{/* 6. Settings Sidebar Drawer */}
				<SettingsDialog
					showSettings={showSettings}
					setShowSettings={setShowSettings}
					settingsTab={settingsTab}
					setSettingsTab={setSettingsTab}
					apiKey={apiKey}
					setApiKey={setApiKey}
					showKey={showKey}
					setShowKey={setShowKey}
					endpoint={endpoint}
					setEndpoint={setEndpoint}
					model={model}
					setModel={setModel}
					enableThinking={enableThinking}
					setEnableThinking={setEnableThinking}
					reasoningEffort={reasoningEffort}
					setReasoningEffort={setReasoningEffort}
					showToolCallsDetail={showToolCallsDetail}
					setShowToolCallsDetail={setShowToolCallsDetail}
					systemPrompt={systemPrompt}
					setSystemPrompt={setSystemPrompt}
					temperature={temperature}
					setTemperature={setTemperature}
					maxTokens={maxTokens}
					setMaxTokens={setMaxTokens}
					maxIterations={maxIterations}
					setMaxIterations={setMaxIterations}
					isTestingKey={isTestingKey}
					handleTestApiKey={handleTestApiKey}
					testResult={testResult}
					apiBalance={apiBalance}
					isFetchingBalance={isFetchingBalance}
					fetchApiBalance={fetchApiBalance}
					saveConfiguration={saveConfiguration}
					saveSuccess={saveSuccess}
					saveError={saveError}
					isSaving={isSaving}
					supportsImages={supportsImages}
					setSupportsImages={setSupportsImages}
					storageUsage={storageUsage}
					storageBlocked={storageBlocked}
					handleFreeUpSpace={handleFreeUpSpace}
					handleCompactSession={handleCompactSession}
					sessionSizes={sessionSizes()}
					chatMetadata={chatMetadata}
					editingSessionKey={editingSessionKey}
					setEditingSessionKey={setEditingSessionKey}
					editingTitleText={editingTitleText}
					setEditingTitleText={setEditingTitleText}
					handleSaveTitle={handleSaveTitle}
					handleStartEditTitle={handleStartEditTitle}
					handleDeleteSession={handleDeleteSession}
					handleLoadSession={handleLoadSession}
					getChatKey={getChatKey}
					enabledTools={enabledTools}
					setEnabledTools={setEnabledTools}
					fetchedModels={fetchedModels}
					isFetchingModels={isFetchingModels}
					fetchAvailableModels={fetchAvailableModels}
				/>
			</div>
		</TooltipProvider>
	);
}
