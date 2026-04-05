import { Moon, Sun } from "lucide-react";
import type { FC } from "react";
import { useTheme } from "./ThemeProvider";

export const ThemeToggle: FC = () => {
	const { theme, setTheme } = useTheme();

	return (
		<button
			type="button"
			onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
			className="relative flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200/50 hover:bg-zinc-200 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
			aria-label="切换主题"
		>
			<Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-zinc-800" />
			<Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-zinc-100" />
		</button>
	);
};
