// The agent's workspace is a native Chrome tab group in its own Chrome window.
//
// Group membership IS the permission boundary: the agent can see and act on exactly the tabs
// returned by chrome.tabs.query({ groupId }), and nothing else. The user grants access by
// dragging a tab into the group and revokes it by dragging the tab out — both native Chrome
// gestures, so there is no allowlist of ours to keep in sync.

export const AGENT_GROUP_TITLE = "Deepseek Agent";
export const AGENT_GROUP_COLOR = "blue";

// chrome.tabGroups.TAB_GROUP_ID_NONE, hardcoded because tabGroups is undefined on older builds
export const TAB_GROUP_ID_NONE = -1;

// The group's placeholder page. Our own extension page rather than about:blank, so the tab can
// explain what it is and warn against closing it.
export const WORKSPACE_URL = chrome.runtime.getURL("workspace.html");

// True for a tab that is only holding the group open, i.e. one with no real page on it yet.
export function isWorkspacePlaceholder(url) {
	if (!url) return true;
	return url === "about:blank" || url.startsWith(WORKSPACE_URL);
}

export async function getGroupInfo(groupId) {
	if (!groupId || groupId === TAB_GROUP_ID_NONE) return null;
	try {
		return await chrome.tabGroups.get(groupId);
	} catch {
		// The user closed or ungrouped it; the caller treats a stale id as "no group"
		return null;
	}
}

export async function getGroupTabs(groupId) {
	if (!groupId || groupId === TAB_GROUP_ID_NONE) return [];
	try {
		return await chrome.tabs.query({ groupId });
	} catch {
		return [];
	}
}

export async function isInGroup(groupId, tabId) {
	if (!groupId || !tabId) return false;
	try {
		const tab = await chrome.tabs.get(tabId);
		return tab.groupId === groupId;
	} catch {
		return false;
	}
}

// Creates the group in its OWN Chrome window.
//
// A separate window is what makes the agent visible without being intrusive: it can activate
// its own tabs freely (so switch_to_tab actually shows something, and screenshots stop
// flickering the user's view) while never touching what the user is looking at.
export async function createAgentGroup() {
	const win = await chrome.windows.create({ url: WORKSPACE_URL, focused: false });
	const tab = win.tabs[0];

	const groupId = await chrome.tabs.group({ tabIds: [tab.id], createProperties: { windowId: win.id } });
	await chrome.tabGroups.update(groupId, { title: AGENT_GROUP_TITLE, color: AGENT_GROUP_COLOR });

	return { groupId, tabId: tab.id, windowId: win.id };
}

// Returns a live group id, recreating the group if the stored one is stale.
export async function ensureGroup(existingGroupId) {
	const info = await getGroupInfo(existingGroupId);
	if (info) {
		const tabs = await getGroupTabs(existingGroupId);
		if (tabs.length > 0) {
			return { groupId: existingGroupId, tabId: tabs[0].id, created: false };
		}
	}

	const created = await createAgentGroup();
	return { groupId: created.groupId, tabId: created.tabId, created: true };
}

// Opens a URL inside the group, inactive.
//
// If the group is still holding an idle placeholder, that tab is navigated instead of a second
// one being created — otherwise the very first open_tab leaves the workspace page stranded
// beside the real page, and the agent has two tabs where it asked for one.
export async function openInGroup(groupId, url) {
	const info = await getGroupInfo(groupId);
	const tabs = await getGroupTabs(groupId);
	const idle = tabs.find((t) => isWorkspacePlaceholder(t.url));

	if (idle) {
		await chrome.tabs.update(idle.id, { url });
		return chrome.tabs.get(idle.id);
	}

	const tab = await chrome.tabs.create({
		url,
		active: false,
		...(info?.windowId ? { windowId: info.windowId } : {}),
	});
	await chrome.tabs.group({ tabIds: [tab.id], groupId });
	return tab;
}

// Explicit "share this tab with the agent" — the programmatic twin of dragging it in.
export async function adoptTab(groupId, tabId) {
	await chrome.tabs.group({ tabIds: [tabId], groupId });
	return chrome.tabs.get(tabId);
}

// Shares a specific tab, creating the group around that tab when there is none. Used by the
// header button and the quick actions, where the user is pointing at a page they already have
// open — creating a blank tab first and adopting second would leave a stray tab behind.
export async function ensureGroupWithTab(existingGroupId, tabId) {
	const info = await getGroupInfo(existingGroupId);

	if (info) {
		const tab = await chrome.tabs.get(tabId);
		if (tab.groupId !== existingGroupId) {
			await adoptTab(existingGroupId, tabId);
		}
		return existingGroupId;
	}

	const groupId = await chrome.tabs.group({ tabIds: [tabId] });
	await chrome.tabGroups.update(groupId, {
		title: AGENT_GROUP_TITLE,
		color: AGENT_GROUP_COLOR,
	});
	return groupId;
}

// Closes the placeholder tabs the extension opened, once the group has a real page. Only ever
// touches our own placeholder, never anything the user navigated.
export async function pruneBlankTabs(groupId, keepTabId) {
	const tabs = await getGroupTabs(groupId);
	const blanks = tabs.filter((t) => t.id !== keepTabId && (isWorkspacePlaceholder(t.url) || isWorkspacePlaceholder(t.pendingUrl)));

	// Never empty the group out from under the agent
	if (blanks.length === 0 || blanks.length === tabs.length) return;

	try {
		await chrome.tabs.remove(blanks.map((t) => t.id));
	} catch {
		// Already gone
	}
}

// Hands the group's tabs back to the user.
//
// Real pages stay open as ordinary ungrouped tabs — nothing the user opened is ever closed on
// their behalf. Our own placeholder is a different matter: it exists only to hold the group
// open, so it is closed rather than left behind as a loose "Agent Workspace" tab. Ungrouping
// or closing the last tab deletes the group.
export async function releaseGroup(groupId) {
	const tabs = await getGroupTabs(groupId);
	if (tabs.length === 0) return;

	const placeholders = tabs.filter((t) => isWorkspacePlaceholder(t.url));
	const userPages = tabs.filter((t) => !isWorkspacePlaceholder(t.url));

	if (userPages.length > 0) {
		try {
			await chrome.tabs.ungroup(userPages.map((t) => t.id));
		} catch {
			// The group is already gone
		}
	}

	if (placeholders.length > 0) {
		try {
			await chrome.tabs.remove(placeholders.map((t) => t.id));
		} catch {
			// Already closed
		}
	}
}

// True when a group holds nothing but our own placeholder — i.e. it has never been used, so a
// new chat can simply adopt it instead of tearing it down and building an identical one.
export async function isGroupPristine(groupId) {
	const info = await getGroupInfo(groupId);
	if (!info) return false;

	const tabs = await getGroupTabs(groupId);
	return tabs.length > 0 && tabs.every((t) => isWorkspacePlaceholder(t.url));
}

// Tidies up workspaces left behind by earlier sessions: extra "Deepseek Agent" groups that hold
// nothing but a placeholder, and loose placeholder tabs that were ungrouped rather than closed.
// Only ever touches tabs this extension opened itself, and never the active group.
export async function reconcileStaleWorkspaces(activeGroupId) {
	let closed = 0;

	try {
		const groups = (await chrome.tabGroups?.query({ title: AGENT_GROUP_TITLE })) || [];
		for (const group of groups) {
			if (group.id === activeGroupId) continue;
			if (!(await isGroupPristine(group.id))) continue;

			const tabs = await getGroupTabs(group.id);
			await chrome.tabs.remove(tabs.map((t) => t.id));
			closed += tabs.length;
		}
	} catch {
		// tabGroups unavailable, or a group vanished mid-sweep
	}

	try {
		const loose = await chrome.tabs.query({ url: `${WORKSPACE_URL}*` });
		const orphans = loose.filter((t) => t.groupId === TAB_GROUP_ID_NONE);
		if (orphans.length > 0) {
			await chrome.tabs.remove(orphans.map((t) => t.id));
			closed += orphans.length;
		}
	} catch {
		// Nothing to sweep
	}

	return closed;
}

// Standard refusal handed back to the model when it names a tab it was not given.
export function outOfScopeError(tabId) {
	return {
		success: false,
		error: `Tab ${tabId} is not shared with you. You can only act on tabs inside the "${AGENT_GROUP_TITLE}" group. Ask the user to drag that tab into the group, or use list_open_tabs to see what you do have.`,
	};
}
