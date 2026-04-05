import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type Variant = "default" | "outline" | "ghost";
type Size = "default" | "icon";

const variantStyles: Record<Variant, string> = {
	default:
		"bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90",
	outline:
		"border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-700",
	ghost:
		"hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
};

const sizeStyles: Record<Size, string> = {
	default: "h-8 px-3",
	icon: "h-8 w-8",
};

export const TooltipIconButton = forwardRef<
	HTMLButtonElement,
	ButtonHTMLAttributes<HTMLButtonElement> & {
		tooltip: string;
		variant?: Variant;
		size?: Size;
		children: ReactNode;
	}
>(({ tooltip, variant = "ghost", size = "icon", className, children, ...props }, ref) => (
	<button
		ref={ref}
		type="button"
		title={tooltip}
		className={cn(
			"inline-flex items-center justify-center rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
			variantStyles[variant],
			sizeStyles[size],
			className,
		)}
		{...props}
	>
		{children}
	</button>
));

TooltipIconButton.displayName = "TooltipIconButton";
