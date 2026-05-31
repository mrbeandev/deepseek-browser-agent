import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Settings, Trash2, ShieldAlert, Eye, EyeOff, AlertTriangle, X, Loader2, Check, Copy, History, Globe, Building, FileText, Search, Compass, Plus, Pencil, Sun, Moon, Terminal, Square, MessageSquarePlus } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
	// App state
	const [apiKey, setApiKey] = useState("");
	const [endpoint, setEndpoint] = useState("https://api.deepseek.com");
	const [model, setModel] = useState("deepseek-v4-flash");
	const [systemPrompt, setSystemPrompt] = useState("You are DeepSeek Agent, a highly capable AI assistant embedded in a web browser sidebar. You are conversing with the user, and you have access to tools that let you read, search, click, scroll, and navigate the active browser tab. Always be helpful, concise, and professional. Explain what you are doing when you use a tool. ALWAYS RESPOND IN ENGLISH.");
	const [temperature, setTemperature] = useState(0.2);
	const [maxTokens, setMaxTokens] = useState(2048);

	// V4 Thinking states
	const [enableThinking, setEnableThinking] = useState(false);
	const [reasoningEffort, setReasoningEffort] = useState("high");
	const [showToolCallsDetail, setShowToolCallsDetail] = useState(true);

	// Tab states
	const [activeTabId, setActiveTabId] = useState(null);
	const [activeDomain, setActiveDomain] = useState("loading...");
	const [activeFavicon, setActiveFavicon] = useState("icons/icon16.png");
	const [isConnected, setIsConnected] = useState(false);
	const [offlineReason, setOfflineReason] = useState("");
	const [activeUrl, setActiveUrl] = useState("");

	// Chat states
	const [chats, setChats] = useState({}); // { scope_key: [messages] }
	const [currentScope, setCurrentScope] = useState("global"); // 'website', 'domain', 'global'
	const currentScopeRef = useRef(currentScope);
	useEffect(() => {
		currentScopeRef.current = currentScope;
	}, [currentScope]);
	const [inputMessage, setInputMessage] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [userScrolledUp, setUserScrolledUp] = useState(false);

	// UI states
	const [showSettings, setShowSettings] = useState(false);
	const [settingsTab, setSettingsTab] = useState("preferences"); // 'preferences', 'sessions'
	const [chatMetadata, setChatMetadata] = useState({}); // registry of session metadata
	const [activeTabTitle, setActiveTabTitle] = useState("");
	const [editingSessionKey, setEditingSessionKey] = useState(null);
	const [editingTitleText, setEditingTitleText] = useState("");
	const [showKey, setShowKey] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [apiKeyMissing, setApiKeyMissing] = useState(false);
	const [isTestingKey, setIsTestingKey] = useState(false);
	const [testResult, setTestResult] = useState(null);
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

	// Iterations limit setting state
	const [maxIterations, setMaxIterations] = useState(15);

	// Active session key for persistent global-only conversations
	const [activeSessionKey, setActiveSessionKey] = useState("global_chat_history");

	// URL Warning states and refs
	const [showUrlChangeWarning, setShowUrlChangeWarning] = useState(false);
	const lastVerifiedUrlRef = useRef("");
	const approvedChatUrlRef = useRef("");
	const aiIsChangingUrlRef = useRef(false);

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
	const apiKeyRef = useRef(apiKey);
	const chatsRef = useRef(chats);
	const activeSessionKeyRef = useRef(activeSessionKey);
	const lockedChatKeyRef = useRef(lockedChatKey);
	const isGeneratingRef = useRef(isGenerating);

	// Sync references inside an effect to satisfy React lints (no ref updates during render)
	useEffect(() => {
		activeTabIdRef.current = activeTabId;
		activeUrlRef.current = activeUrl;
		activeTabTitleRef.current = activeTabTitle;
		apiKeyRef.current = apiKey;
		chatsRef.current = chats;
		activeSessionKeyRef.current = activeSessionKey;
		lockedChatKeyRef.current = lockedChatKey;
		isGeneratingRef.current = isGenerating;
	}, [activeTabId, activeUrl, activeTabTitle, apiKey, chats, activeSessionKey, lockedChatKey, isGenerating]);

	// Test API Key validity
	async function handleTestApiKey() {
		if (!apiKey) {
			setTestResult({ success: false, message: "Enter API key first." });
			return;
		}

		setIsTestingKey(true);
		setTestResult(null);

		try {
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
					return;
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

	// Fetch current user balance from DeepSeek API
	async function fetchApiBalance() {
		if (!apiKey) return;
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
	function loadSettings() {
		chrome.storage.local.get(["apiKey", "endpoint", "model", "systemPrompt", "temperature", "maxTokens", "chats", "chatMetadata", "enableThinking", "reasoningEffort", "maxIterations", "activeSessionKey", "theme", "showToolCallsDetail"], (result) => {
			setApiKey(result.apiKey || "");
			setEndpoint(result.endpoint || "https://api.deepseek.com");
			setModel(result.model || "deepseek-v4-flash");
			setSystemPrompt(result.systemPrompt || "You are DeepSeek Agent, a highly capable AI assistant embedded in a web browser sidebar. You are conversing with the user, and you have access to tools that let you read, search, click, scroll, and navigate the active browser tab. Always be helpful, concise, and professional. Explain what you are doing when you use a tool. ALWAYS RESPOND IN ENGLISH.");
			if (result.activeSessionKey) {
				setActiveSessionKey(result.activeSessionKey);
			}
			if (result.theme) {
				setTheme(result.theme);
			}
			setTemperature(result.temperature !== undefined ? parseFloat(result.temperature) : 0.2);
			setMaxTokens(result.maxTokens !== undefined ? parseInt(result.maxTokens) : 2048);
			setEnableThinking(result.enableThinking !== undefined ? result.enableThinking : false);
			setReasoningEffort(result.reasoningEffort || "high");
			setShowToolCallsDetail(result.showToolCallsDetail !== undefined ? result.showToolCallsDetail : true);

			const loadedChats = result.chats || {};
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
				chrome.storage.local.set({ chatMetadata: loadedMeta });
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
			setMaxIterations(result.maxIterations !== undefined ? parseInt(result.maxIterations) : 15);
		});
	}

	// Check active tab properties
	function trackActiveTab() {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs && tabs[0]) {
				const tab = tabs[0];
				setActiveTabId(tab.id);

				// URL change detection logic
				const newUrl = tab.url || "";
				const cleanNewUrl = newUrl.split("#")[0];

				// Initialize approved URL ref on first active tab tracking
				if (!approvedChatUrlRef.current) {
					approvedChatUrlRef.current = cleanNewUrl;
				}

				const cleanApprovedUrl = approvedChatUrlRef.current.split("#")[0];

				if (cleanApprovedUrl && cleanNewUrl && cleanNewUrl !== cleanApprovedUrl) {
					const isChromeSystemPage = cleanNewUrl.startsWith("chrome://") || cleanNewUrl.startsWith("chrome-extension://") || cleanNewUrl.startsWith("about:") || cleanNewUrl.startsWith("devtools://") || cleanNewUrl.includes("chromewebstore.google.com");

					if (!isChromeSystemPage) {
						if (aiIsChangingUrlRef.current) {
							// AI changed it, so approve the new URL and reset active warnings
							aiIsChangingUrlRef.current = false;
							approvedChatUrlRef.current = cleanNewUrl;
							setShowUrlChangeWarning(false);
						} else {
							// Human changed it! Show the warning popup
							setShowUrlChangeWarning(true);
						}
					} else {
						setShowUrlChangeWarning(false);
					}
				} else {
					// URL matches approved URL (e.g. human switched back to original tab), dismiss warning
					setShowUrlChangeWarning(false);
				}

				// Update verified URL ref
				lastVerifiedUrlRef.current = newUrl;

				setActiveUrl(newUrl);
				setActiveFavicon(tab.favIconUrl || "icons/icon16.png");
				setActiveTabTitle(tab.title || "");

				let domain = "none";
				try {
					if (tab.url) {
						const urlObj = new URL(tab.url);
						domain = urlObj.hostname;
					}
				} catch {
					domain = "restricted";
				}
				setActiveDomain(domain);

				const url = tab.url || "";
				const isChromeSystemPage = url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:") || url.startsWith("devtools://") || url.includes("chromewebstore.google.com");

				if (isChromeSystemPage) {
					setIsConnected(false);
					setOfflineReason("Chrome restricts content scripts on chrome://, chrome-extension://, developer tools, and Chrome Web Store pages for security. Try a standard website (e.g. speechmatics.com).");
					return;
				}

				chrome.tabs.sendMessage(tab.id, { action: "PING" }, (response) => {
					if (chrome.runtime.lastError || !response || !response.success) {
						setIsConnected(false);
						const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : "No response";
						if (err.includes("Could not establish connection") || err.includes("Receiving end does not exist")) {
							setOfflineReason("Script not loaded yet. If you just installed/reloaded the extension or opened a new tab, please refresh this browser tab to activate automation.");
						} else {
							setOfflineReason(`Connection failed: ${err}. Please refresh the tab or navigate to another page.`);
						}
					} else {
						setIsConnected(true);
						setOfflineReason("");
					}
				});
			} else {
				setIsConnected(false);
				setOfflineReason("No active browser tab detected.");
			}
		});
	}

	// Sync scroll on new messages
	useEffect(() => {
		if (!userScrolledUp) {
			scrollToBottom();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [chats, streamingResponse, streamingThinking, isGenerating]);

	// (loadSettings and trackActiveTab are hoisted above the useEffect)

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


	// Save changes to storage
	const saveConfiguration = () => {
		const trimmedKey = apiKey.trim();
		chrome.storage.local.set(
			{
				apiKey: trimmedKey,
				endpoint: endpoint.trim(),
				model: model,
				systemPrompt: systemPrompt.trim(),
				temperature: parseFloat(temperature) || 0.2,
				maxTokens: parseInt(maxTokens) || 2048,
				enableThinking: enableThinking,
				reasoningEffort: reasoningEffort,
				maxIterations: parseInt(maxIterations) || 15,
				showToolCallsDetail: showToolCallsDetail,
			},
			() => {
				setApiKeyMissing(!trimmedKey);
				setSaveSuccess(true);
				setTimeout(() => {
					setSaveSuccess(false);
					setShowSettings(false);
				}, 1200);
			},
		);
	};

	// Helper to safely truncate messages without separating tool call responses from their assistant calls
	function truncateMessages(messages, limit = 50) {
		if (messages.length <= limit) return messages;

		// Start with the last `limit` messages
		let adjustedStartIndex = messages.length - limit;

		// Scan backwards from the end of the candidate slice
		for (let i = messages.length - 1; i >= adjustedStartIndex; i--) {
			const msg = messages[i];
			if (msg.role === "tool") {
				const toolCallId = msg.toolCallId;
				// Find the corresponding assistant message in the entire `messages` array
				let assistantIndex = -1;
				for (let j = i - 1; j >= 0; j--) {
					if (messages[j].role === "assistant" && messages[j].toolCalls) {
						const hasCall = messages[j].toolCalls.some((tc) => tc.id === toolCallId);
						if (hasCall) {
							assistantIndex = j;
							break;
						}
					}
				}

				// If found and it is outside our current slice boundary, extend the boundary backwards
				if (assistantIndex !== -1 && assistantIndex < adjustedStartIndex) {
					adjustedStartIndex = assistantIndex;
				}
			}
		}

		// Slice from the adjusted start index
		let result = messages.slice(adjustedStartIndex);

		// Just in case there are still any orphaned tool messages, filter them out
		result = result.filter((msg, idx) => {
			if (msg.role === "tool") {
				const toolCallId = msg.toolCallId;
				const hasAssistant = result.slice(0, idx).some((m) => m.role === "assistant" && m.toolCalls && m.toolCalls.some((tc) => tc.id === toolCallId));
				return hasAssistant;
			}
			return true;
		});

		return result;
	}

	// Save new messages to log in local storage
	function saveMessageLog(newMessages) {
		const key = getChatKey(currentScopeRef.current);

		// Determine a title for the session based on first user message, or activeTabTitle, or key
		let firstUserMsg = newMessages.find((m) => m.role === "user")?.content || "";
		if (firstUserMsg.length > 50) {
			firstUserMsg = firstUserMsg.substring(0, 47) + "...";
		}

		const scope = currentScopeRef.current;
		let fallbackTitle;
		if (scope === "global") fallbackTitle = "Global Chat";
		else if (scope === "domain") fallbackTitle = `Domain: ${activeDomain}`;
		else fallbackTitle = activeTabTitle || activeUrl || "Website Chat";

		const title = firstUserMsg || fallbackTitle;

		setChats((prevChats) => {
			const updatedChats = {
				...prevChats,
				[key]: truncateMessages(newMessages, 50),
			};
			chrome.storage.local.set({ chats: updatedChats });
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
					domain: activeDomain,
					url: activeUrl,
					title: finalTitle,
					timestamp: Date.now(),
					hasAiTitle: existing?.hasAiTitle || false,
				},
			};
			chrome.storage.local.set({ chatMetadata: updatedMeta });

			// Auto generate AI title after 2 user messages (deepseek-v4-flash only)
			const userMsgs = newMessages.filter((m) => m.role === "user");
			if (userMsgs.length === 2 && !updatedMeta[key]?.hasAiTitle && apiKey) {
				generateAiTitle(newMessages, key);
			}

			return updatedMeta;
		});
	}

	// Starts a fresh conversation / session for the current scope (global-only persistent chats)
	const handleNewChat = () => {
		const newKey = generateSessionKey();
		setActiveSessionKey(newKey);
		chrome.storage.local.set({ activeSessionKey: newKey });

		// Prevent logging tab change when switching/creating a new chat
		lastLoggedUrlRef.current = activeUrl;
		lastLoggedTabIdRef.current = activeTabId;
		lastVerifiedUrlRef.current = activeUrl;
		approvedChatUrlRef.current = activeUrl;

		setChats((prevChats) => {
			const updatedChats = {
				...prevChats,
				[newKey]: [],
			};
			chrome.storage.local.set({ chats: updatedChats });
			return updatedChats;
		});

		setChatMetadata((prevMeta) => {
			const updatedMeta = {
				...prevMeta,
				[newKey]: {
					key: newKey,
					scope: "global",
					domain: activeDomain,
					url: activeUrl,
					title: "New Global Chat",
					timestamp: Date.now(),
					hasAiTitle: false,
				},
			};
			chrome.storage.local.set({ chatMetadata: updatedMeta });
			return updatedMeta;
		});
	};

	// Theme toggle action
	const handleToggleTheme = () => {
		const nextTheme = theme === "dark" ? "light" : "dark";
		setTheme(nextTheme);
		chrome.storage.local.set({ theme: nextTheme });
	};

	// Handles loading a saved session
	const handleLoadSession = (session) => {
		setActiveSessionKey(session.key);
		chrome.storage.local.set({ activeSessionKey: session.key });
		setShowSettings(false);

		setCurrentScope("global");

		// Prevent logging tab change when switching/creating a new chat
		lastLoggedUrlRef.current = activeUrl;
		lastLoggedTabIdRef.current = activeTabId;
		lastVerifiedUrlRef.current = session.url || activeUrl;
		approvedChatUrlRef.current = session.url || activeUrl;

		if (session.url && session.url !== "none" && session.url !== "") {
			const cleanSessionUrl = session.url.split("#")[0];
			const cleanActiveUrl = activeUrl.split("#")[0];
			if (cleanSessionUrl !== cleanActiveUrl) {
				chrome.tabs.query({}, (tabs) => {
					const existingTab = tabs.find((t) => t.url && t.url.split("#")[0] === cleanSessionUrl);
					if (existingTab) {
						chrome.tabs.update(existingTab.id, { active: true });
						if (existingTab.windowId) {
							chrome.windows.update(existingTab.windowId, { focused: true });
						}
					} else {
						chrome.tabs.create({ url: session.url });
					}
				});
			}
		}
	};

	// Handles deleting a saved session
	const handleDeleteSession = (sessionKey, e) => {
		e.stopPropagation();
		if (window.confirm("Are you sure you want to delete this saved session?")) {
			setChats((prevChats) => {
				const updatedChats = { ...prevChats };
				delete updatedChats[sessionKey];
				chrome.storage.local.set({ chats: updatedChats });
				return updatedChats;
			});
			setChatMetadata((prevMeta) => {
				const updatedMeta = { ...prevMeta };
				delete updatedMeta[sessionKey];
				chrome.storage.local.set({ chatMetadata: updatedMeta });
				return updatedMeta;
			});
		}
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
						chrome.storage.local.set({ chatMetadata: updated });
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
			chrome.storage.local.set({ chatMetadata: updated });
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
# DEEPSEEK WEB AGENT DEBUG COMPILATION
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
		const currentMsgs = getMessages();
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
		if (!text) return;

		// Approve the current URL since the user is continuing the chat on this page
		approvedChatUrlRef.current = activeUrl;

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

		const updated = addLocalMessage("user", text);

		if (!apiKey) {
			addLocalMessage("assistant", "⚠️ **DeepSeek API Key is missing!** Open configurations (gear icon) to save your credentials.");
			return;
		}

		await executeDeepSeekCall(null, null, updated);
	};

	// Executes DeepSeek V4 agent loop
	async function executeDeepSeekCall(extraSystemContext = null, overrideUserPrompt = null, currentMessagesState = null) {
		// Lock the chat key so navigation mid-flight doesn't switch or vanish the chat history
		setLockedChatKey(getChatKey());

		// Race condition safeguard: resolve active API key directly from storage if state is not updated yet
		let activeApiKey = apiKeyRef.current;
		if (!activeApiKey) {
			const storageResult = await new Promise((resolve) => chrome.storage.local.get("apiKey", resolve));
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
					description: "List all currently open tabs in the browser, including their IDs, URLs, and titles.",
					parameters: { type: "object", properties: {} },
				},
			},
			{
				type: "function",
				function: {
					name: "switch_to_tab",
					description: "Switch the active browser tab to the tab with the specified Tab ID.",
					parameters: {
						type: "object",
						properties: {
							tabId: {
								type: "number",
								description: "The numeric ID of the tab to activate.",
							},
						},
						required: ["tabId"],
					},
				},
			},
			{
				type: "function",
				function: {
					name: "url_changing",
					description: "Notify the system that you are about to trigger a URL change or tab switch (via navigation, link clicking, or tab switching) so the user is not warned about an unexpected human-initiated navigation.",
					parameters: { type: "object", properties: {} },
				},
			},
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

				// Compile messages payload mapped exactly to OpenAI/DeepSeek specifications
				let payloadMessages = [{ role: "system", content: systemPrompt }];

				// Inject active tab context (current Tab ID, URL, and Title) so the AI always knows its active page
				const tabContextStr = `[CURRENT TAB ID: ${activeTabIdRef.current}]\n[CURRENT TAB URL: ${activeUrlRef.current}]\n[CURRENT TAB TITLE: ${activeTabTitleRef.current}]`;
				payloadMessages.push({ role: "system", content: tabContextStr });

				if (extraSystemContext) {
					payloadMessages.push({ role: "system", content: extraSystemContext });
				}

				// Add history mapping reasoning_content and tool_calls context seamlessly
				activeMessages.forEach((m) => {
					if (m.role === "user") {
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

				// V4 supports both thinking and tools at the same time
				const attachTools = isConnected;

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
					requestPayload.tools = agentTools;
					requestPayload.tool_choice = "auto";
				}

				const response = await fetch(`${endpoint}/chat/completions`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${activeApiKey}`,
					},
					body: JSON.stringify(requestPayload),
				});

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

							nextMessages.push({
								role: "tool",
								toolCallId: callId,
								toolName: toolName,
								content: JSON.stringify(actionResult),
							});

							nextMessages.push({
								role: "system",
								content: `Completed tool: ${toolName}`,
							});
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
				addLocalMessage("assistant", "⚠️ **Agent Iteration limit:** Executed too many recursive actions without summary.");
			}
		} catch (err) {
			console.error(err);
			addLocalMessage("assistant", `❌ **API Connection Error:** ${err.message}`);
		} finally {
			setIsGenerating(false);
			setLockedChatKey(null);
			approvedChatUrlRef.current = activeUrl;
		}
	}

	// Trigger quick action pills
	async function triggerQuickAction(action, text = "", overrideTabId = null, overrideUrl = null) {
		if (isGeneratingRef.current) return;

		// Resolve target tab and URL (safeguard against stale/uninitialized activeTabId/activeUrl)
		let targetTabId = overrideTabId || activeTabIdRef.current;
		let targetUrl = overrideUrl || activeUrlRef.current;

		if (!targetTabId) {
			const tabs = await new Promise((resolve) => {
				chrome.tabs.query({ active: true, currentWindow: true }, resolve);
			});
			if (tabs && tabs[0]) {
				targetTabId = tabs[0].id;
				targetUrl = tabs[0].url || targetUrl;
				setActiveTabId(targetTabId);
				setActiveUrl(targetUrl);

				// Update refs immediately to avoid state delay
				activeTabIdRef.current = targetTabId;
				activeUrlRef.current = targetUrl;
				activeTabTitleRef.current = tabs[0].title || "";
			}
		} else {
			activeTabIdRef.current = targetTabId;
			activeUrlRef.current = targetUrl;
		}

		// Race condition safeguard: if apiKey state is empty, fetch it directly from storage first
		let currentApiKey = apiKeyRef.current;
		if (!currentApiKey) {
			const result = await new Promise((resolve) => chrome.storage.local.get("apiKey", resolve));
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
		loadSettings();
		trackActiveTab();

		const tabActiveHandler = () => trackActiveTab();
		const tabUpdateHandler = (_tabId, changeInfo) => {
			if (changeInfo.status === "complete") {
				trackActiveTab();
			}
		};

		chrome.tabs.onActivated.addListener(tabActiveHandler);
		chrome.tabs.onUpdated.addListener(tabUpdateHandler);

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
			chrome.tabs.onActivated.removeListener(tabActiveHandler);
			chrome.tabs.onUpdated.removeListener(tabUpdateHandler);
			chrome.runtime.onMessage.removeListener(messageHandler);
		};
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

	// Refs to track last logged URL and Tab ID to avoid duplicate system log writes
	const lastLoggedUrlRef = useRef("");
	const lastLoggedTabIdRef = useRef(null);

	// Monitor active webpage/tab changes and log system messages in the chat history
	useEffect(() => {
		if (!activeUrl || activeUrl === "loading...") return;

		const previousUrl = lastLoggedUrlRef.current;

		// Update refs immediately
		lastLoggedUrlRef.current = activeUrl;
		lastLoggedTabIdRef.current = activeTabId;

		// Do not log on the very first render / startup
		if (!previousUrl) return;

		const key = getChatKey();
		setChats((prevChats) => {
			const currentMessages = prevChats[key] || [];
			if (currentMessages.length === 0) {
				return prevChats;
			}

			// Prevent writing duplicate consecutive system change logs for the same URL
			const lastMsg = currentMessages[currentMessages.length - 1];
			if (lastMsg?.role === "system" && lastMsg.content.includes(activeUrl)) {
				return prevChats;
			}

			const newSystemMsg = {
				role: "system",
				content: `Active tab changed to: ${activeTabTitle || activeUrl} (URL: ${activeUrl}, Tab ID: ${activeTabId})`,
				timestamp: Date.now(),
			};

			const updatedMessages = [...currentMessages, newSystemMsg];
			const updatedChats = {
				...prevChats,
				[key]: truncateMessages(updatedMessages, 50),
			};
			chrome.storage.local.set({ chats: updatedChats });
			return updatedChats;
		});
	}, [activeUrl, activeTabTitle, activeTabId, getChatKey]);

	const executeContentScriptAction = async (toolName, args) => {
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
					aiIsChangingUrlRef.current = true;
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
					aiIsChangingUrlRef.current = true;
					chrome.tabs.update(activeTabIdRef.current, { url: args.url }, () => {
						setTimeout(
							() =>
								resolve({
									success: true,
									message: `Navigated browser tab to ${args.url}`,
								}),
							2000,
						);
					});
					return;
				case "highlight_text":
					payload = { action: "HIGHLIGHT_TEXT", query: args.query };
					break;
				case "list_open_tabs":
					chrome.tabs.query({}, (tabs) => {
						const tabDetails = tabs.map((t) => ({
							id: t.id,
							url: t.url,
							title: t.title,
							active: t.active,
						}));
						resolve({ success: true, tabs: tabDetails });
					});
					return;
				case "switch_to_tab": {
					aiIsChangingUrlRef.current = true;
					const numericTabId = parseInt(args.tabId);
					if (isNaN(numericTabId)) {
						resolve({ success: false, error: "tabId must be a valid number." });
						return;
					}
					chrome.tabs.update(numericTabId, { active: true }, (tab) => {
						if (chrome.runtime.lastError) {
							resolve({
								success: false,
								error: chrome.runtime.lastError.message,
							});
						} else if (tab) {
							if (tab.windowId) {
								chrome.windows.update(tab.windowId, { focused: true });
							}
							resolve({
								success: true,
								message: `Successfully switched to tab ID ${numericTabId} (${tab.title})`,
							});
						} else {
							resolve({
								success: false,
								error: `Tab with ID ${numericTabId} not found.`,
							});
						}
					});
					return;
				}
				case "url_changing":
					aiIsChangingUrlRef.current = true;
					resolve({
						success: true,
						message: "System notified of upcoming URL change.",
					});
					return;
				default:
					reject(new Error(`Unknown tool action: ${toolName}`));
					return;
			}

			chrome.tabs.sendMessage(activeTabIdRef.current, payload, (response) => {
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
						const key = getLetterID(lineReplacements.length);
						const placeholder = `%%BASHREP${key}%%`;
						lineReplacements.push(`<span class="text-zinc-500 font-mono italic">${line}</span>`);
						return placeholder;
					}
					// Output lines (like "Output: ...")
					if (line.startsWith("Output:")) {
						const key = getLetterID(lineReplacements.length);
						const placeholder = `%%BASHREP${key}%%`;
						lineReplacements.push(`<span class="text-blue-600 dark:text-blue-400 font-bold font-mono">${line}</span>`);
						return placeholder;
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
    <button class="copy-code-btn hover:text-zinc-850 dark:hover:text-white transition-colors" data-copy-target="${id}">Copy</button>
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

	return (
		<TooltipProvider delayDuration={10}>
			<div className={`relative flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground ${theme}`}>
				{/* 1. Header Bar */}
				<header className="z-30 flex items-center justify-between border-b border-border bg-card p-2.5 shadow-sm">
					<div className="flex min-w-0 max-w-[60%] items-center gap-2">
						<img
							src={activeFavicon}
							className="h-5 w-5 flex-shrink-0 rounded-md border border-zinc-800 bg-zinc-900 object-contain p-0.5"
							alt="favicon"
							onError={(e) => {
								e.target.src = "icons/icon16.png";
							}}
						/>
						<div className="flex min-w-0 flex-col">
							<span className="text-zinc-550 mb-0.5 text-sm font-bold uppercase leading-none tracking-wider">Active Host</span>
							<span className="truncate text-xs font-semibold leading-tight text-zinc-200">{activeDomain}</span>
						</div>
					</div>

					<div className="flex flex-shrink-0 items-center gap-1.5">
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
										chrome.storage.local.set({ showToolCallsDetail: next });
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
								<img src="icons/icon128.png" className="relative z-10 h-20 w-20 rounded-lg object-contain drop-shadow-[0_4px_12px_rgba(37,99,235,0.15)] filter" alt="DeepSeek" />
							</div>

							<h1 className="mb-0.5 text-base font-bold tracking-tight text-zinc-100">DeepSeek Web Agent</h1>
							<p className="mb-5 max-w-[85%] text-[11px] leading-relaxed text-zinc-500">Interact, extract, and automate operations on this website using standard DeepSeek models.</p>

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
										if (msg.role === "user") {
											rendered.push(
												<div key={`user-${i}`} className="animate-fade-in flex w-full justify-end">
													<div className="flex max-w-[88%] flex-col gap-0.5">
														<div className="rounded-xl rounded-tr-none border border-zinc-800 bg-zinc-900 p-2.5 text-xs leading-relaxed text-zinc-100">
															<div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
														</div>
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
												<div key={`sys-${i}`} className="animate-fade-in flex justify-center">
													<div className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-1 font-mono text-[10px] text-zinc-500">
														<div className="h-1 w-1 animate-pulse rounded-full bg-blue-500" />
														<span>{msg.content}</span>
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
															<CardDescription className="mt-1 text-xs leading-relaxed text-zinc-300">DeepSeek requests browser access.</CardDescription>
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
											let toolCallCount = 0;
											let j = i;
											let lastAssistantWithContent = null;
											while (j < allMsgs.length && allMsgs[j].role !== "user") {
												const m = allMsgs[j];
												if (m.role === "assistant") {
													if (m.toolCalls && m.toolCalls.length > 0) toolCallCount += m.toolCalls.length;
													if (m.content && m.content.trim() !== "") lastAssistantWithContent = m;
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
											if (lastAssistantWithContent) {
												rendered.push(
													<div key={`asst-final-${i}`} className="animate-fade-in flex w-full justify-start">
														<div className="flex max-w-[88%] flex-col gap-0.5">
															<div className="border-zinc-850 rounded-xl rounded-tl-none border bg-zinc-950/60 p-2.5 text-xs leading-relaxed text-zinc-300 shadow-sm">
																<div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(lastAssistantWithContent.content) }} />
															</div>
														</div>
													</div>
												);
											}
											i = j;
											continue;
										}
										i++;
									}
								} else {
									allMsgs.forEach((msg, index) => {
										if (msg.role === "system") {
											if (msg.content.startsWith("Agent action:") || msg.content.startsWith("Completed tool:") || msg.content.startsWith("Blocked:")) return;
											rendered.push(
												<div key={`sys-${index}`} className="animate-fade-in flex justify-center">
													<div className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-1 font-mono text-[10px] text-zinc-500">
														<div className="h-1 w-1 animate-pulse rounded-full bg-blue-500" />
														<span>{msg.content}</span>
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
															<CardDescription className="mt-1 text-xs leading-relaxed text-zinc-300">DeepSeek requests browser access.</CardDescription>
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
											<div key={`msg-${index}`} className={`animate-fade-in flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
												<div className="flex max-w-[88%] flex-col gap-0.5">
													<div className={`rounded-xl p-2.5 text-xs leading-relaxed ${msg.role === "user" ? "rounded-tr-none border border-zinc-800 bg-zinc-900 text-zinc-100" : "border-zinc-850 rounded-tl-none border bg-zinc-950/60 text-zinc-300 shadow-sm"}`}>
														{msg.reasoning && (
															<div className="mb-2 max-w-full rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
																<div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1 select-none">Thinking Process</div>
																<div className="whitespace-pre-wrap font-mono text-[10px] leading-normal text-amber-500/80">{msg.reasoning}</div>
															</div>
														)}
														{msg.content && <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />}
														{msg.toolCalls && msg.toolCalls.length > 0 && (
															<div className="mt-2 flex w-full flex-col gap-2 border-t border-zinc-800/60 pt-2">
																<span className="text-[9px] font-bold uppercase tracking-wide text-zinc-400">Actions Executed</span>
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
									<div className="flex max-w-[88%] flex-col gap-0.5">
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
									<div className="flex max-w-[88%] flex-col gap-0.5">
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
								<div className="flex items-center gap-1.5 text-[10px] font-bold leading-none">
									<span className={`h-1 w-1 rounded-full ${isConnected ? "animate-pulse bg-blue-600" : "bg-rose-500"}`} />
									<span className={isConnected ? "text-zinc-500" : "text-rose-400"}>{isConnected ? "AUTOMATION ONLINE" : "AUTOMATION LINK OFFLINE"}</span>
								</div>
							</div>

							{!isConnected && offlineReason && (
								<div className="animate-fade-in mt-1 flex items-start gap-1.5 rounded border border-rose-950/40 bg-rose-950/20 px-2.5 py-2 text-[10px] font-medium leading-normal text-rose-300">
									<AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-400" />
									<div className="flex-1">
										<span>{offlineReason}</span>
									</div>
								</div>
							)}
						</div>

						<div className="flex items-end gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-inner transition-all focus-within:!border-blue-600 hover:border-zinc-700/60">
							<textarea ref={inputRef} rows={1} value={inputMessage} onChange={handleInputChange} onKeyDown={handleKeyDown} placeholder={isGenerating ? "Type a comment to queue for the agent..." : "Ask a question or request page actions..."} className="max-h-20 flex-1 resize-none border-none bg-transparent py-1 text-xs leading-normal text-zinc-200 placeholder-zinc-600 outline-none" />

							{isGenerating && !inputMessage.trim() ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button type="button" onClick={handleStopAgent} size="icon-xs" className="flex-shrink-0 cursor-pointer rounded-md bg-rose-600 text-white shadow-md hover:bg-rose-500 animate-pulse">
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
										<Button type="submit" size="icon-xs" className="flex-shrink-0 cursor-pointer rounded-md bg-amber-600 text-white shadow-md hover:bg-amber-500">
											<MessageSquarePlus className="h-3 w-3" />
										</Button>
									</TooltipTrigger>
									<TooltipContent className="custom-tooltip rounded-lg border border-zinc-850 bg-[#0e1118] px-2.5 py-1.5 text-[11px] text-zinc-300 shadow-2xl">
										<span>Queue Comment for Agent</span>
									</TooltipContent>
								</Tooltip>
							) : (
								<Button type="submit" disabled={!inputMessage.trim()} size="icon-xs" className="flex-shrink-0 cursor-pointer rounded-md bg-blue-600 text-white shadow-md hover:bg-blue-500">
									<Send className="h-3 w-3" />
								</Button>
							)}
						</div>
					</form>
				</footer>

				{/* Dynamic Human URL Change Warning Backdrop Overlay Modal */}
				{showUrlChangeWarning && (
					<div className="animate-fade-in absolute inset-0 z-40 flex items-center justify-center bg-background/60 p-4 backdrop-blur-md">
						<Card className="animate-scale-up flex w-full max-w-[280px] flex-col gap-4 border-zinc-800 bg-zinc-950/90 p-4 shadow-2xl">
							<CardHeader className="flex flex-col items-center gap-1.5 p-0 text-center">
								<div className="mb-1 flex h-10 w-10 animate-pulse items-center justify-center rounded-full bg-amber-500/10">
									<AlertTriangle className="h-5 w-5 text-amber-500" />
								</div>
								<CardTitle className="text-xs font-bold tracking-tight text-zinc-200">URL Change Detected</CardTitle>
								<CardDescription className="text-zinc-450 text-[10px] leading-normal">We noticed you navigated to a new webpage or switched tabs.</CardDescription>
							</CardHeader>

							<CardContent className="p-0 text-center">
								<p className="border-zinc-850 rounded-lg border bg-zinc-900/50 p-2.5 text-[10px] leading-normal text-zinc-300">Do you wish to continue in the same chat or start a fresh global session?</p>
							</CardContent>

							<CardFooter className="flex flex-col gap-2 p-0">
								<Button
									onClick={() => {
										setShowUrlChangeWarning(false);
										handleNewChat();
									}}
									className="w-full cursor-pointer rounded-lg bg-blue-600 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-500"
								>
									Start New Chat
								</Button>
								<Button
									variant="ghost"
									onClick={() => {
										approvedChatUrlRef.current = activeUrl;
										setShowUrlChangeWarning(false);
									}}
									className="border-zinc-850 w-full rounded-lg border py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
								>
									Continue in Current Chat
								</Button>
								<div className="text-zinc-550 mt-1 text-center text-[9px] font-medium italic leading-snug">Note: Starting a new chat is highly recommended to keep context clean and get more accurate answers!</div>
							</CardFooter>
						</Card>
					</div>
				)}

				{/* 6. Settings Sidebar Drawer */}
				<div className={`absolute right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-[#07090e] shadow-2xl transition-transform duration-300 ease-out ${showSettings ? "translate-x-0" : "translate-x-full"}`}>
					<div className="flex items-center justify-between border-b border-border bg-[#0e1118]/80 p-3">
						<h2 className="text-xs font-bold tracking-tight text-zinc-200">Configuration Settings</h2>
						<Button variant="ghost" size="icon-xs" onClick={() => setShowSettings(false)} className="border border-zinc-800/40 text-zinc-400 hover:text-white">
							<X className="h-3.5 w-3.5" />
						</Button>
					</div>

					{/* Tab selection for Settings Preferences vs Saved Sessions */}
					<div className="border-zinc-850 flex shrink-0 border-b bg-zinc-950/20 px-2 py-1">
						<button onClick={() => setSettingsTab("preferences")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${settingsTab === "preferences" ? "border border-zinc-800/60 bg-zinc-900/60 text-blue-400" : "border border-transparent bg-transparent text-zinc-500 hover:text-zinc-300"}`}>
							<Settings className="h-3.5 w-3.5" />
							<span>Preferences</span>
						</button>
						<button onClick={() => setSettingsTab("sessions")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${settingsTab === "sessions" ? "border border-zinc-800/60 bg-zinc-900/60 text-blue-400" : "text-zinc-555 border border-transparent bg-transparent hover:text-zinc-300"}`}>
							<History className="h-3.5 w-3.5" />
							<span>Saved Sessions</span>
						</button>
					</div>

					<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
						{settingsTab === "preferences" ? (
							<>
								<div className="flex flex-col gap-1.5">
									<label className="text-[10px] font-bold text-zinc-400">DeepSeek API Key</label>
									<div className="relative flex items-center">
										<Input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="placeholder-zinc-750 border-zinc-800 bg-zinc-950/40 pr-10 font-mono text-xs text-white focus-visible:ring-blue-600/35" />
										<Button type="button" variant="ghost" size="icon-xs" onClick={() => setShowKey(!showKey)} className="text-zinc-550 absolute right-1 hover:bg-transparent hover:text-zinc-200">
											{showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
										</Button>
									</div>

									{/* Test API Key Connection Button & Status */}
									<div className="mt-1 flex items-center justify-between">
										<Button type="button" variant="outline" size="xs" onClick={handleTestApiKey} disabled={isTestingKey} className="hover:bg-zinc-850 h-6 rounded border-zinc-800 bg-zinc-900/60 px-2.5 text-[10px] font-bold text-zinc-300 transition-all hover:text-white">
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
											<div className={`animate-fade-in flex items-center gap-1 text-[10px] font-medium ${testResult.success ? "text-emerald-400" : "text-rose-400"}`}>
												{testResult.success ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-500" />}
												<span className="max-w-[130px] truncate" title={testResult.message}>
													{testResult.message}
												</span>
											</div>
										)}
									</div>
								</div>

								{/* DeepSeek API Balance Card */}
								{apiBalance ? (
									<div className="animate-fade-in mt-0.5 flex flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2.5">
										<div className="flex items-center justify-between">
											<span className="text-[10px] font-bold text-zinc-400">DeepSeek Balance</span>
											<button type="button" onClick={fetchApiBalance} disabled={isFetchingBalance} className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-mono text-[10px] text-blue-400 transition-colors hover:text-blue-300 disabled:opacity-50">
												<span>{isFetchingBalance ? "Refreshing..." : "Refresh"}</span>
											</button>
										</div>
										<div className="mt-0.5 flex items-baseline gap-1">
											<span className="text-zinc-150 font-mono text-sm font-extrabold">{apiBalance.total}</span>
											<span className="font-mono text-[10px] font-bold text-zinc-500">{apiBalance.currency}</span>
											{!apiBalance.available && <span className="ml-2 rounded-sm border border-rose-500/20 bg-rose-500/10 px-1 text-[10px] font-bold text-rose-400">UNAVAILABLE</span>}
										</div>
									</div>
								) : (
									apiKey && (
										<div className="mt-0.5 flex justify-end">
											<button type="button" onClick={fetchApiBalance} disabled={isFetchingBalance} className="cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50">
												{isFetchingBalance ? "Loading balance..." : "Show current balance"}
											</button>
										</div>
									)
								)}

								<div className="flex flex-col gap-1.5">
									<label className="text-[10px] font-bold text-zinc-400">API Endpoint</label>
									<Input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="border-zinc-800 bg-zinc-950/40 text-xs text-white placeholder-zinc-700 focus-visible:ring-blue-600/35" />
								</div>

								<div className="flex flex-col gap-1.5">
									<label className="text-[10px] font-bold text-zinc-400">Preferred AI Model</label>
									<Select value={model} onValueChange={(val) => setModel(val)}>
										<SelectTrigger className="h-8 w-full border-zinc-800 bg-zinc-950/40 text-xs text-zinc-300 focus-visible:ring-blue-600/35">
											<SelectValue placeholder="Select model" />
										</SelectTrigger>
										<SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-300">
											<SelectItem value="deepseek-v4-flash" className="text-xs focus:bg-blue-600/10 focus:text-blue-400">
												deepseek-v4-flash (Fast)
											</SelectItem>
											<SelectItem value="deepseek-v4-pro" className="text-xs focus:bg-blue-600/10 focus:text-blue-400">
												deepseek-v4-pro (Pro)
											</SelectItem>
										</SelectContent>
									</Select>
								</div>

								{/* V4 Thinking Settings */}
								<div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
									<div className="flex items-center justify-between">
										<div className="flex flex-col gap-0.5">
											<label className="text-[10px] font-bold text-zinc-400">Enable Deep Thinking</label>
											<span className="text-[10px] text-zinc-500">Stream reasoning CoT block</span>
										</div>
										<Switch checked={enableThinking} onCheckedChange={(checked) => setEnableThinking(checked)} />
									</div>

									{enableThinking && (
										<div className="animate-fade-in mt-2 flex flex-col gap-1.5">
											<label className="text-[10px] font-bold text-zinc-400">Reasoning Effort</label>
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
											<span className="flex items-start gap-1 text-[10px] leading-normal text-amber-500/70">
												<AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
												<span>Thinking Mode supports dynamic concurrent active DOM tool calling under V4 API specifications.</span>
											</span>
										</div>
									)}
								</div>

								{/* Tool Calls Settings */}
								<div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
									<div className="flex items-center justify-between">
										<div className="flex flex-col gap-0.5">
											<label className="text-[10px] font-bold text-zinc-400">Detailed Tool Calls</label>
											<span className="text-[10px] text-zinc-500">Show step-by-step action details</span>
										</div>
										<Switch checked={showToolCallsDetail} onCheckedChange={(checked) => setShowToolCallsDetail(checked)} />
									</div>
								</div>

								<div className="flex flex-col gap-1.5">
									<label className="text-[10px] font-bold text-zinc-400">Agent System Instructions</label>
									<Textarea rows={4} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="h-[15vh] resize-none border border-zinc-800 bg-zinc-950/40 font-sans text-xs leading-relaxed text-zinc-300 focus-visible:ring-blue-600/35" />
								</div>

								<div className="flex gap-2">
									<div className="flex w-[30%] flex-col gap-1.5">
										<label className="text-[10px] font-bold text-zinc-400">Temp</label>
										<Input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="border-zinc-800 bg-zinc-950/40 pr-1 text-xs text-white focus-visible:ring-blue-600/35" />
									</div>
									<div className="flex w-[35%] flex-col gap-1.5">
										<label className="text-[10px] font-bold text-zinc-400">Max Tokens</label>
										<Input type="number" min="1" max="8192" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="border-zinc-800 bg-zinc-950/40 pr-1 text-xs text-white focus-visible:ring-blue-600/35" />
									</div>
									<div className="flex w-[35%] flex-col gap-1.5">
										<label className="text-[10px] font-bold text-zinc-400">Max Steps</label>
										<Input type="number" min="1" max="100" value={maxIterations} onChange={(e) => setMaxIterations(e.target.value)} className="border-zinc-800 bg-zinc-950/40 pr-1 text-xs text-white focus-visible:ring-blue-600/35" />
									</div>
								</div>

								<Button onClick={saveConfiguration} className="mt-4 w-full cursor-pointer rounded-lg bg-blue-600 py-2 text-center text-xs font-bold text-white hover:bg-blue-500">
									Save Configuration
								</Button>

								{saveSuccess && <div className="animate-fade-in text-center text-xs text-emerald-400">✓ Configuration updated!</div>}
							</>
						) : (
							<div className="flex flex-col gap-2 p-1">
								{Object.values(chatMetadata).length === 0 ? (
									<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
										<History className="text-zinc-650 h-8 w-8 animate-pulse" />
										<p className="text-[10px] font-medium text-zinc-500">No saved sessions yet.</p>
										<p className="text-zinc-650 max-w-[180px] text-center text-[9px]">Start a conversation in any scope to automatically save history logs.</p>
									</div>
								) : (
									Object.values(chatMetadata)
										.sort((a, b) => b.timestamp - a.timestamp)
										.map((session) => {
											const dateStr = new Date(session.timestamp).toLocaleString();
											const isActive = getChatKey() === session.key;

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
																	className="h-6 rounded border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-200 focus-visible:ring-1 focus-visible:ring-blue-500"
																/>
															</div>
														) : (
															<div className="flex flex-1 items-center gap-2 truncate">
																<span className="shrink-0">{session.scope === "global" ? <Globe className="h-3.5 w-3.5 text-purple-400" /> : session.scope === "domain" ? <Building className="h-3.5 w-3.5 text-amber-400" /> : <FileText className="h-3.5 w-3.5 text-blue-400" />}</span>
																<h3 className={`truncate text-[10px] font-bold ${isActive ? "text-blue-400" : "text-zinc-200 group-hover:text-white"}`} title={session.title}>
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
														<div className="flex flex-col gap-1 font-mono text-[9px]">
															{session.domain && session.domain !== "none" && session.domain !== "" && (
																<div className="flex max-w-full items-center gap-1.5 rounded-md border border-zinc-900 bg-zinc-950/70 px-2 py-1 text-[9px] text-zinc-500">
																	<Building className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />
																	<span className="flex-1 truncate text-zinc-400">{session.domain}</span>
																</div>
															)}
															{session.url && session.url !== "none" && session.url !== "" && (
																<div className="flex max-w-full items-center gap-1.5 overflow-hidden rounded-md border border-zinc-900 bg-zinc-950/70 px-2 py-1 text-[9px] text-zinc-500 transition-colors hover:text-zinc-300">
																	<Compass className="h-3.5 w-3.5 shrink-0 text-blue-500/70" />
																	<span className="flex-1 truncate text-zinc-400" title={session.url}>
																		{session.url}
																	</span>
																</div>
															)}
														</div>
													) : null}

													<div className="mt-1 flex items-center justify-between text-[9px] text-zinc-600">
														<span className={`rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${session.scope === "global" ? "bg-purple-500/10 text-purple-400" : session.scope === "domain" ? "bg-amber-500/10 text-amber-400" : "bg-blue-500/10 text-blue-400"}`}>{session.scope}</span>
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
				</div>
			</div>
		</TooltipProvider>
	);
}
