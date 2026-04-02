import { useRef, useState } from "react";
import "./RecipePanel.css";

export enum SkillLevel {
	BEGINNER = "初级",
	INTERMEDIATE = "中级",
	ADVANCED = "高级",
}

export enum CookingTime {
	FiveMin = "5分钟",
	FifteenMin = "15分钟",
	ThirtyMin = "30分钟",
	FortyFiveMin = "45分钟",
	SixtyPlusMin = "60+分钟",
}

const cookingTimeValues = [
	{ label: CookingTime.FiveMin, value: 0 },
	{ label: CookingTime.FifteenMin, value: 1 },
	{ label: CookingTime.ThirtyMin, value: 2 },
	{ label: CookingTime.FortyFiveMin, value: 3 },
	{ label: CookingTime.SixtyPlusMin, value: 4 },
];

export const SPECIAL_PREFERENCES = [
	"高蛋白",
	"低碳水",
	"辣味",
	"经济实惠",
	"一锅搞定",
	"素食",
	"纯素",
] as const;

export interface Ingredient {
	icon: string;
	name: string;
	amount: string;
}

export interface Recipe {
	title: string;
	skill_level: string;
	cooking_time: string;
	special_preferences: string[];
	ingredients: Ingredient[];
	instructions: string[];
}

export const INITIAL_RECIPE: Recipe = {
	title: "创建你的食谱",
	skill_level: SkillLevel.INTERMEDIATE,
	cooking_time: CookingTime.FortyFiveMin,
	special_preferences: [],
	ingredients: [
		{ icon: "🥕", name: "胡萝卜", amount: "3 根，切丝" },
		{ icon: "🌾", name: "中筋面粉", amount: "2 杯" },
	],
	instructions: ["将烤箱预热至 175°C"],
};

function Ping() {
	return (
		<span className="ping-animation">
			<span className="ping-circle" />
			<span className="ping-dot" />
		</span>
	);
}

export function RecipePanel({
	recipe,
	onUpdate,
	isLoading,
	changedKeys,
	onImprove,
}: {
	recipe: Recipe;
	onUpdate: (partial: Partial<Recipe>) => void;
	isLoading: boolean;
	changedKeys: string[];
	onImprove?: () => void;
}) {
	const [editingIdx, setEditingIdx] = useState<number | null>(null);
	const newInstructionRef = useRef<HTMLTextAreaElement>(null);

	const addIngredient = () => {
		onUpdate({
			ingredients: [
				...recipe.ingredients,
				{ icon: "🍴", name: "", amount: "" },
			],
		});
	};

	const updateIngredient = (
		index: number,
		field: keyof Ingredient,
		value: string,
	) => {
		const updated = [...recipe.ingredients];
		updated[index] = { ...updated[index], [field]: value };
		onUpdate({ ingredients: updated });
	};

	const removeIngredient = (index: number) => {
		const updated = [...recipe.ingredients];
		updated.splice(index, 1);
		onUpdate({ ingredients: updated });
	};

	const addInstruction = () => {
		const newIdx = recipe.instructions.length;
		onUpdate({ instructions: [...recipe.instructions, ""] });
		setEditingIdx(newIdx);
		setTimeout(() => {
			const areas = document.querySelectorAll(
				".instructions-container textarea",
			);
			(areas[areas.length - 1] as HTMLTextAreaElement)?.focus();
		}, 50);
	};

	const updateInstruction = (index: number, value: string) => {
		const updated = [...recipe.instructions];
		updated[index] = value;
		onUpdate({ instructions: updated });
	};

	const removeInstruction = (index: number) => {
		const updated = [...recipe.instructions];
		updated.splice(index, 1);
		onUpdate({ instructions: updated });
	};

	const selectStyle = {
		backgroundImage:
			"url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23555' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
		backgroundRepeat: "no-repeat" as const,
		backgroundPosition: "right 0px center",
		backgroundSize: "12px",
		appearance: "none" as const,
		WebkitAppearance: "none" as const,
	};

	return (
		<form className="recipe-card">
			<div className="recipe-header">
				<input
					type="text"
					value={recipe.title || ""}
					onChange={(e) => onUpdate({ title: e.target.value })}
					className="recipe-title-input"
				/>
				<div className="recipe-meta">
					<div className="meta-item">
						<span className="meta-icon">🕒</span>
						<select
							className="meta-select"
							value={
								cookingTimeValues.find((t) => t.label === recipe.cooking_time)
									?.value ?? 3
							}
							onChange={(e) =>
								onUpdate({
									cooking_time: cookingTimeValues[Number(e.target.value)].label,
								})
							}
							style={selectStyle}
						>
							{cookingTimeValues.map((t) => (
								<option key={t.value} value={t.value}>
									{t.label}
								</option>
							))}
						</select>
					</div>
					<div className="meta-item">
						<span className="meta-icon">🏆</span>
						<select
							className="meta-select"
							value={recipe.skill_level}
							onChange={(e) =>
								onUpdate({ skill_level: e.target.value as SkillLevel })
							}
							style={selectStyle}
						>
							{Object.values(SkillLevel).map((l) => (
								<option key={l} value={l}>
									{l}
								</option>
							))}
						</select>
					</div>
				</div>
			</div>

			{/* 饮食偏好 */}
			<div className="section-container relative">
				{changedKeys.includes("special_preferences") && <Ping />}
				<h2 className="section-title">饮食偏好</h2>
				<div className="dietary-options">
					{SPECIAL_PREFERENCES.map((opt) => (
						<label key={opt} className="dietary-option">
							<input
								type="checkbox"
								checked={recipe.special_preferences.includes(opt)}
								onChange={(e) => {
									const prefs = e.target.checked
										? [...recipe.special_preferences, opt]
										: recipe.special_preferences.filter((p) => p !== opt);
									onUpdate({ special_preferences: prefs });
								}}
							/>
							<span>{opt}</span>
						</label>
					))}
				</div>
			</div>

			{/* 食材 */}
			<div className="section-container relative">
				{changedKeys.includes("ingredients") && <Ping />}
				<div className="section-header">
					<h2 className="section-title">食材</h2>
					<button type="button" className="add-button" onClick={addIngredient}>
						+ 添加食材
					</button>
				</div>
				<div className="ingredients-container">
					{recipe.ingredients.map((ing, i) => (
						<div key={`${ing.name}-${ing.amount}`} className="ingredient-card">
							<div className="ingredient-icon">{ing.icon || "🍴"}</div>
							<div className="ingredient-content">
								<input
									type="text"
									value={ing.name || ""}
									onChange={(e) => updateIngredient(i, "name", e.target.value)}
									placeholder="食材名称"
									className="ingredient-name-input"
								/>
								<input
									type="text"
									value={ing.amount || ""}
									onChange={(e) =>
										updateIngredient(i, "amount", e.target.value)
									}
									placeholder="用量"
									className="ingredient-amount-input"
								/>
							</div>
							<button
								type="button"
								className="remove-button"
								onClick={() => removeIngredient(i)}
								aria-label="删除食材"
							>
								x
							</button>
						</div>
					))}
				</div>
			</div>

			{/* 步骤 */}
			<div className="section-container relative">
				{changedKeys.includes("instructions") && <Ping />}
				<div className="section-header">
					<h2 className="section-title">步骤</h2>
					<button
						type="button"
						className="add-step-button"
						onClick={addInstruction}
					>
						+ 添加步骤
					</button>
				</div>
				<div className="instructions-container">
					{recipe.instructions.map((inst, i) => (
						<div key={`${inst.slice(0, 30)}`} className="instruction-item">
							<div className="instruction-number">{i + 1}</div>
							{i < recipe.instructions.length - 1 && (
								<div className="instruction-line" />
							)}
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: textarea inside handles keyboard */}
							{/* biome-ignore lint/a11y/noStaticElementInteractions: interactive click area */}
							<div
								className={`instruction-content ${editingIdx === i ? "instruction-content-editing" : "instruction-content-default"}`}
								onClick={() => setEditingIdx(i)}
							>
								<textarea
									ref={
										i === recipe.instructions.length - 1
											? newInstructionRef
											: undefined
									}
									className="instruction-textarea"
									value={inst || ""}
									onChange={(e) => updateInstruction(i, e.target.value)}
									placeholder={!inst ? "输入烹饪步骤..." : ""}
									onFocus={() => setEditingIdx(i)}
									onBlur={(e) => {
										if (
											!e.relatedTarget ||
											!e.currentTarget.contains(e.relatedTarget as Node)
										) {
											setEditingIdx(null);
										}
									}}
								/>
								<button
									type="button"
									className={`instruction-delete-btn ${editingIdx === i ? "instruction-delete-btn-editing" : "instruction-delete-btn-default"} remove-button`}
									onClick={(e) => {
										e.stopPropagation();
										removeInstruction(i);
									}}
									aria-label="删除步骤"
								>
									x
								</button>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* AI 优化按钮 */}
			<div className="action-container">
				<button
					className={isLoading ? "improve-button loading" : "improve-button"}
					type="button"
					onClick={() => {
						if (!isLoading && onImprove) onImprove();
					}}
					disabled={isLoading}
				>
					{isLoading ? "请稍候..." : "AI 优化食谱"}
				</button>
			</div>
		</form>
	);
}
