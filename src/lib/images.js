// Screenshot post-processing for the side panel (a normal document context, so plain
// <canvas> is available).
//
// Full-size captures are kept in memory for the current run only. What gets written to
// chrome.storage.local is a downscaled thumbnail plus a placeholder — storing the originals
// would exhaust the 10 MB quota in a few dozen screenshots.

// Vision APIs bill by image RESOLUTION, not file size, so a heavier JPEG costs essentially
// nothing in tokens — it only widens the HTTP payload. Compressing hard was the wrong trade:
// it cost legibility (which the model reads) to save bytes (which it does not pay for).
export const CAPTURE_QUALITY = 92; // captureVisibleTab, 0-100
export const CROP_QUALITY = 0.92; // single re-encode after cropping

// Kept in the saved transcript. Big enough to stay sharp inline and usable in the lightbox
// after a reload, small enough that a few hundred captures still fit the 10 MB quota.
export const THUMB_MAX_PX = 640;
export const THUMB_QUALITY = 0.62;

// Longest edge sent to the model. Hi-DPI captures come back near 2900px; vision models
// downscale to roughly this before tokenising, so anything larger costs request size and
// resolution-priced tokens while adding no detail the model can actually see.
export const MAX_IMAGE_EDGE = 1568;

export function loadImage(dataUrl) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Could not decode the captured image"));
		img.src = dataUrl;
	});
}

// Rough decoded size of a base64 data URL.
export function dataUrlBytes(dataUrl) {
	if (!dataUrl) return 0;
	const base64 = dataUrl.split(",")[1] || "";
	return Math.floor((base64.length * 3) / 4);
}

export async function getImageSize(dataUrl) {
	const img = await loadImage(dataUrl);
	return { width: img.naturalWidth, height: img.naturalHeight };
}

// Crops to a CSS-pixel rect from the page, scaling by the device pixel ratio because
// captureVisibleTab returns physical pixels. The source must be a LOSSLESS capture — cropping a
// JPEG and re-encoding it stacks two rounds of compression on the same pixels, which is what
// turned small on-page text to mush.
export async function cropImage(dataUrl, rect, dpr = 1) {
	const img = await loadImage(dataUrl);

	const sx = Math.max(0, Math.round(rect.x * dpr));
	const sy = Math.max(0, Math.round(rect.y * dpr));
	const sw = Math.min(img.naturalWidth - sx, Math.round(rect.width * dpr));
	const sh = Math.min(img.naturalHeight - sy, Math.round(rect.height * dpr));

	if (sw <= 0 || sh <= 0) {
		throw new Error("The element is outside the visible area of the page — scroll it into view first");
	}

	const canvas = document.createElement("canvas");
	canvas.width = sw;
	canvas.height = sh;
	canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

	return { dataUrl: canvas.toDataURL("image/jpeg", CROP_QUALITY), width: sw, height: sh };
}

// Caps the longest edge, re-encoding once. Returns the input untouched when it already fits,
// so a small capture never takes an extra lossy pass.
export async function downscaleToMaxEdge(dataUrl, maxEdge = MAX_IMAGE_EDGE, quality = CROP_QUALITY) {
	try {
		const img = await loadImage(dataUrl);
		const longest = Math.max(img.naturalWidth, img.naturalHeight);
		if (longest <= maxEdge) return dataUrl;

		const scale = maxEdge / longest;
		const w = Math.round(img.naturalWidth * scale);
		const h = Math.round(img.naturalHeight * scale);

		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(img, 0, 0, w, h);

		return canvas.toDataURL("image/jpeg", quality);
	} catch {
		return dataUrl;
	}
}

// Reads a user-picked or pasted File into a data URL, then puts it through the same size cap
// as a capture so an 8 MB phone photo never lands in a request body verbatim.
export async function fileToAttachment(file) {
	if (!file || !file.type?.startsWith("image/")) {
		throw new Error(`"${file?.name || "file"}" is not an image.`);
	}

	const raw = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
		reader.readAsDataURL(file);
	});

	const dataUrl = await downscaleToMaxEdge(raw);
	const { width, height } = await getImageSize(dataUrl);

	return {
		name: file.name || "pasted image",
		dataUrl,
		thumbnail: await makeThumbnail(dataUrl),
		meta: { width, height, bytes: dataUrlBytes(dataUrl) },
	};
}

// Small, cheap preview kept in the saved transcript so an old session is still readable.
export async function makeThumbnail(dataUrl, maxPx = THUMB_MAX_PX, quality = THUMB_QUALITY) {
	try {
		const img = await loadImage(dataUrl);
		const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
		const w = Math.max(1, Math.round(img.naturalWidth * scale));
		const h = Math.max(1, Math.round(img.naturalHeight * scale));

		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		canvas.getContext("2d").drawImage(img, 0, 0, w, h);

		return canvas.toDataURL("image/jpeg", quality);
	} catch {
		return null;
	}
}

// Drops full-size image payloads before anything is written to storage, keeping the thumbnail.
export function stripImagesForStorage(messages) {
	let touched = false;

	const out = messages.map((m) => {
		if (!m || !m.images || m.images.length === 0) return m;
		touched = true;
		const { images, ...rest } = m;
		return { ...rest, imagesStripped: images.length };
	});

	return touched ? out : messages;
}
