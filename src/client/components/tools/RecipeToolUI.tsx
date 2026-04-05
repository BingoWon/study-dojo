import { makeAssistantToolUI } from "@assistant-ui/react";
import { Check, Loader2 } from "lucide-react";
import { useContext, useEffect, useRef } from "react";
import { RecipeUpdateCtx } from "../../Chat";
import type { Recipe } from "../RecipePanel";

export const RecipeToolUI = makeAssistantToolUI<Partial<Recipe>, Partial<Recipe>>({
	toolName: "update_recipe",
	render: ({ result, status }) => {
		const onRecipeUpdate = useContext(RecipeUpdateCtx);
		const appliedRef = useRef(false);

		useEffect(() => {
			if (result && status.type === "complete" && !appliedRef.current) {
				appliedRef.current = true;
				onRecipeUpdate?.(result);
			}
		}, [result, status, onRecipeUpdate]);

		if (status.type === "running") {
			return (
				<div className="mb-2 flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400">
					<Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在更新食谱...
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
