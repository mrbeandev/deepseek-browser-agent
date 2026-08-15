import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * Per-message copy control.
 *
 * Sits in its own reserved row under the bubble rather than floating over it, so
 * it can never land on top of the text. The row keeps its height at all times —
 * only opacity changes on hover — so revealing it never shifts the transcript.
 */
export const CopyButton = ({ getText, align = "start", label = "Copy message" }) => {
	const [copied, setCopied] = useState(false);
	const timerRef = useRef(null);

	useEffect(() => () => clearTimeout(timerRef.current), []);

	const handleCopy = async () => {
		const text = typeof getText === "function" ? getText() : getText;
		if (!text) return;

		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setCopied(false), 1400);
		} catch (err) {
			console.error("Copy failed:", err);
		}
	};

	return (
		<div className={`flex h-4 w-full items-center ${align === "end" ? "justify-end pr-0.5" : "justify-start pl-0.5"}`}>
			<button
				type="button"
				onClick={handleCopy}
				title={copied ? "Copied" : label}
				aria-label={copied ? "Copied" : label}
				className={`flex items-center gap-1 rounded border border-transparent px-1 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-all duration-150 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/msg:opacity-100 ${
					copied ? "text-foreground opacity-100" : "text-foreground/45 opacity-0 hover:border-border hover:text-foreground"
				}`}
			>
				{copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
				<span>{copied ? "Copied" : "Copy"}</span>
			</button>
		</div>
	);
};
