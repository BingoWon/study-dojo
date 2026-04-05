import { makeAssistantToolUI, useToolArgsStatus } from "@assistant-ui/react";
import { Check, ChefHat, Loader2 } from "lucide-react";
import { useContext, useEffect, useRef } from "react";
import { RecipeUpdateCtx } from "../../Chat";
import type { Recipe } from "../RecipePanel";

type RecipeArgs = Partial<Recipe>;

export const RecipeToolUI = makeAssistantToolUI<RecipeArgs, RecipeArgs>({
	toolName: "update_recipe",
	render: ({ args, result, status }) => {
		const onRecipeUpdate = useContext(RecipeUpdateCtx);
		const { propStatus } = useToolArgsStatus<RecipeArgs>();

		// Stream partial args to RecipePanel in real-time
		const prevArgsRef = useRef<string>("");
		useEffect(() => {
			if (!args || !onRecipeUpdate) return;
			const key = JSON.stringify(args);
			if (key !== prevArgsRef.current && Object.keys(args).length > 0) {
				prevArgsRef.current = key;
				onRecipeUpdate(args);
			}
		}, [args, onRecipeUpdate]);

		if (status.type === "running") {
			const steps: string[] = [];
			if (propStatus.title === "complete") steps.push("标题");
			if (propStatus.skill_level === "complete") steps.push("难度");
			if (propStatus.cooking_time === "complete") steps.push("时间");
			if (propStatus.ingredients) steps.push(
				propStatus.ingredients === "complete" ? "食材" : "食材...",
			);
			if (propStatus.instructions) steps.push(
				propStatus.instructions === "complete" ? "步骤" : "步骤...",
			);

			return (
				<div className="mb-2 flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
					<ChefHat className="w-3.5 h-3.5 animate-pulse" />
					正在生成食谱
					{steps.length > 0 && (
						<span className="text-zinc-400 dark:text-zinc-500">
							{steps.join(" → ")}
						</span>
					)}
				</div>
			);
		}

		if (status.type === "incomplete") {
			return <div className="mb-2 text-xs text-red-500">食谱更新失败</div>;
		}

		return (
			<div className="mb-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
				<Check className="w-3.5 h-3.5" /> 食谱已更新
			</div>
		);
	},
});
