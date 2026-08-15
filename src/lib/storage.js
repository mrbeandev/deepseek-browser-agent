// Checked wrappers around chrome.storage.local.
//
// chrome.storage.local silently reports success unless the caller inspects
// chrome.runtime.lastError inside the callback: an over-quota write "fails immediately and sets
// runtime.lastError". Every write in this extension goes through setStorage so a failed write
// can never be mistaken for a successful one.

// 10 MB on Chrome 114+, 5 MB before that. Ignored only with the "unlimitedStorage" permission,
// which this extension deliberately does not request.
export const QUOTA_BYTES = chrome.storage?.local?.QUOTA_BYTES || 10485760;

// Advisory thresholds for the storage meter.
export const WARN_RATIO = 0.75;
export const CRITICAL_RATIO = 0.9;

// Prefix for per-session chat keys. Splitting sessions apart means a write costs one session
// instead of the whole archive, and a single heavy session can be deleted on its own.
export const CHAT_KEY_PREFIX = "chat_";

export class StorageWriteError extends Error {
	constructor(message) {
		super(message || "Unknown storage error");
		this.name = "StorageWriteError";
		this.isQuota = /quota|exceed/i.test(message || "");
	}
}

export function setStorage(items) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.set(items, () => {
			const err = chrome.runtime.lastError;
			if (err) reject(new StorageWriteError(err.message));
			else resolve();
		});
	});
}

export function getStorage(keys) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(keys, (result) => {
			const err = chrome.runtime.lastError;
			if (err) reject(new StorageWriteError(err.message));
			else resolve(result || {});
		});
	});
}

export function removeStorage(keys) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.remove(keys, () => {
			const err = chrome.runtime.lastError;
			if (err) reject(new StorageWriteError(err.message));
			else resolve();
		});
	});
}

export function getStorageUsage() {
	return new Promise((resolve) => {
		chrome.storage.local.getBytesInUse(null, (bytes) => {
			if (chrome.runtime.lastError) {
				resolve({ bytes: 0, quota: QUOTA_BYTES, ratio: 0, unknown: true });
				return;
			}
			resolve({
				bytes,
				quota: QUOTA_BYTES,
				ratio: QUOTA_BYTES ? bytes / QUOTA_BYTES : 0,
			});
		});
	});
}

export function formatBytes(bytes) {
	if (!bytes || bytes < 0) return "0 KB";
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function sessionStorageKey(sessionKey) {
	return `${CHAT_KEY_PREFIX}${sessionKey}`;
}

// Approximate on-disk cost of one session, used to show the user which sessions are heavy.
export function estimateSessionBytes(messages) {
	if (!messages || messages.length === 0) return 0;
	try {
		return JSON.stringify(messages).length;
	} catch {
		return 0;
	}
}

// Reads every per-session chat key back into the single { sessionKey: messages } shape the UI
// works with. Transparently migrates the legacy monolithic "chats" key on first run.
export async function loadAllChats() {
	const all = await getStorage(null);
	const chats = {};

	Object.keys(all).forEach((storageKey) => {
		if (storageKey.startsWith(CHAT_KEY_PREFIX)) {
			chats[storageKey.slice(CHAT_KEY_PREFIX.length)] = all[storageKey] || [];
		}
	});

	// Legacy layout: one "chats" object holding every session.
	//
	// Migrated one session at a time, shrinking the legacy object after each success, so peak
	// usage only ever exceeds the original by a single session. A bulk copy would momentarily
	// double usage and fail outright on exactly the full-storage account that needs this most.
	// If a write fails we stop and leave the legacy data intact — the caller still gets every
	// message, and the storage banner tells the user to free space.
	if (all.chats && typeof all.chats === "object") {
		const legacy = all.chats;
		const pending = Object.keys(legacy);

		for (const sessionKey of pending) {
			const messages = legacy[sessionKey];

			// Per-session keys win if both exist, so a partial migration resumes safely
			if (!chats[sessionKey] && messages && messages.length > 0) {
				chats[sessionKey] = messages;
			}
		}

		let migratedAll = true;
		for (const sessionKey of pending) {
			const messages = legacy[sessionKey];
			try {
				if (messages && messages.length > 0) {
					await setStorage({ [sessionStorageKey(sessionKey)]: messages });
				}
				delete legacy[sessionKey];
				await setStorage({ chats: legacy });
			} catch {
				migratedAll = false;
				break;
			}
		}

		if (migratedAll) {
			try {
				await removeStorage("chats");
			} catch {
				// Leaving an empty legacy key behind is harmless
			}
		}
	}

	return chats;
}
