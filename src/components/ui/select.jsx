import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react";

function Select({ ...props }) {
	return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({ className, ...props }) {
	return <SelectPrimitive.Group data-slot="select-group" className={cn("scroll-my-1 p-1", className)} {...props} />;
}

function SelectValue({ ...props }) {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({ className, size = "default", children, ...props }) {
	return (
		<SelectPrimitive.Trigger data-slot="select-trigger" data-size={size} className={cn("focus-visible:ring-3 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex w-fit select-none items-center justify-between gap-1.5 whitespace-nowrap rounded-lg border border-input bg-transparent py-2 pl-2.5 pr-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} {...props}>
			{children}
			<SelectPrimitive.Icon asChild>
				<ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

function SelectContent({ className, children, position = "item-aligned", align = "center", ...props }) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content data-slot="select-content" data-align-trigger={position === "item-aligned"} className={cn("max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin) data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 relative z-50 min-w-36 overflow-y-auto overflow-x-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none", position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1", className)} position={position} align={align} {...props}>
				<SelectScrollUpButton />
				<SelectPrimitive.Viewport data-position={position} className={cn("data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:min-w-(--radix-select-trigger-width) data-[position=popper]:w-full", position === "popper" && "")}>
					{children}
				</SelectPrimitive.Viewport>
				<SelectScrollDownButton />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({ className, ...props }) {
	return <SelectPrimitive.Label data-slot="select-label" className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)} {...props} />;
}

function SelectItem({ className, children, ...props }) {
	return (
		<SelectPrimitive.Item data-slot="select-item" className={cn("outline-hidden not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 relative flex w-full cursor-default select-none items-center gap-1.5 rounded-md py-1 pl-1.5 pr-8 text-sm focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} {...props}>
			<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="pointer-events-none" />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({ className, ...props }) {
	return <SelectPrimitive.Separator data-slot="select-separator" className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)} {...props} />;
}

function SelectScrollUpButton({ className, ...props }) {
	return (
		<SelectPrimitive.ScrollUpButton data-slot="select-scroll-up-button" className={cn("z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4", className)} {...props}>
			<ChevronUpIcon />
		</SelectPrimitive.ScrollUpButton>
	);
}

function SelectScrollDownButton({ className, ...props }) {
	return (
		<SelectPrimitive.ScrollDownButton data-slot="select-scroll-down-button" className={cn("z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4", className)} {...props}>
			<ChevronDownIcon />
		</SelectPrimitive.ScrollDownButton>
	);
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue };
