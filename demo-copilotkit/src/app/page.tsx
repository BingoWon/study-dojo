"use client";

import {
  useAgent,
  UseAgentUpdate,
  useCopilotKit,
  useConfigureSuggestions,
  CopilotChat,
  CopilotSidebar,
} from "@copilotkit/react-core/v2";
import React, { useState, useEffect, useRef } from "react";
import "@copilotkit/react-core/v2/styles.css";
import "./style.css";
import { CopilotKit } from "@copilotkit/react-core";

// ── Types ────────────────────────────────────────────────────────────────────

enum SkillLevel { BEGINNER = "Beginner", INTERMEDIATE = "Intermediate", ADVANCED = "Advanced" }
enum CookingTime { FiveMin = "5 min", FifteenMin = "15 min", ThirtyMin = "30 min", FortyFiveMin = "45 min", SixtyPlusMin = "60+ min" }
const cookingTimeValues = [
  { label: CookingTime.FiveMin, value: 0 }, { label: CookingTime.FifteenMin, value: 1 },
  { label: CookingTime.ThirtyMin, value: 2 }, { label: CookingTime.FortyFiveMin, value: 3 },
  { label: CookingTime.SixtyPlusMin, value: 4 },
];
enum SpecialPreferences { HighProtein="High Protein", LowCarb="Low Carb", Spicy="Spicy", BudgetFriendly="Budget-Friendly", OnePotMeal="One-Pot Meal", Vegetarian="Vegetarian", Vegan="Vegan" }

interface Ingredient { icon: string; name: string; amount: string }
interface Recipe { title: string; skill_level: SkillLevel; cooking_time: CookingTime; special_preferences: string[]; ingredients: Ingredient[]; instructions: string[] }
interface RecipeAgentState { recipe: Recipe }

const INITIAL_STATE: RecipeAgentState = {
  recipe: {
    title: "Make Your Recipe", skill_level: SkillLevel.INTERMEDIATE, cooking_time: CookingTime.FortyFiveMin,
    special_preferences: [],
    ingredients: [{ icon: "🥕", name: "Carrots", amount: "3 large, grated" }, { icon: "🌾", name: "All-Purpose Flour", amount: "2 cups" }],
    instructions: ["Preheat oven to 350°F (175°C)"],
  },
};

// ── Recipe Card ──────────────────────────────────────────────────────────────

function RecipeCard() {
  const { agent } = useAgent({ agentId: "shared_state", updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged] });
  const { copilotkit } = useCopilotKit();

  useConfigureSuggestions({
    suggestions: [
      { title: "Create Italian recipe", message: "Create a delicious Italian pasta recipe." },
      { title: "Make it healthier", message: "Make the recipe healthier with more vegetables." },
      { title: "Suggest variations", message: "Suggest some creative variations of this recipe." },
    ],
    available: "always",
  });

  const agentState = agent.state as RecipeAgentState | undefined;
  const setAgentState = (s: RecipeAgentState) => agent.setState(s);
  const isLoading = agent.isRunning;

  useEffect(() => { if (!agentState?.recipe) setAgentState(INITIAL_STATE); }, []);

  const [recipe, setRecipe] = useState(INITIAL_STATE.recipe);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const changedKeysRef = useRef<string[]>([]);

  const updateRecipe = (partial: Partial<Recipe>) => {
    setAgentState({ ...(agentState || INITIAL_STATE), recipe: { ...recipe, ...partial } });
    setRecipe({ ...recipe, ...partial });
  };

  // Sync agent state → local recipe
  const newRecipe = { ...recipe };
  const newChanged: string[] = [];
  for (const key in recipe) {
    if (agentState?.recipe && (agentState.recipe as any)[key] != null) {
      let av = (agentState.recipe as any)[key];
      if (typeof av === "string") av = av.replace(/\\n/g, "\n");
      if (JSON.stringify(av) !== JSON.stringify((recipe as any)[key])) {
        (newRecipe as any)[key] = av;
        newChanged.push(key);
      }
    }
  }
  if (newChanged.length > 0) changedKeysRef.current = newChanged;
  else if (!isLoading) changedKeysRef.current = [];
  useEffect(() => { setRecipe(newRecipe); }, [JSON.stringify(newRecipe)]);

  return (
    <form className="recipe-card">
      <div className="recipe-header">
        <input type="text" value={recipe.title || ""} onChange={e => updateRecipe({ title: e.target.value })} className="recipe-title-input" />
        <div className="recipe-meta">
          <div className="meta-item">
            <span className="meta-icon">🕒</span>
            <select className="meta-select" value={cookingTimeValues.find(t => t.label === recipe.cooking_time)?.value || 3} onChange={e => updateRecipe({ cooking_time: cookingTimeValues[Number(e.target.value)].label })}>
              {cookingTimeValues.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="meta-item">
            <span className="meta-icon">🏆</span>
            <select className="meta-select" value={recipe.skill_level} onChange={e => updateRecipe({ skill_level: e.target.value as SkillLevel })}>
              {Object.values(SkillLevel).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Dietary */}
      <div className="section-container relative">
        {changedKeysRef.current.includes("special_preferences") && <Ping />}
        <h2 className="section-title">Dietary Preferences</h2>
        <div className="dietary-options">
          {Object.values(SpecialPreferences).map(opt => (
            <label key={opt} className="dietary-option">
              <input type="checkbox" checked={recipe.special_preferences.includes(opt)} onChange={e => updateRecipe({ special_preferences: e.target.checked ? [...recipe.special_preferences, opt] : recipe.special_preferences.filter(p => p !== opt) })} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Ingredients */}
      <div className="section-container relative">
        {changedKeysRef.current.includes("ingredients") && <Ping />}
        <div className="section-header">
          <h2 className="section-title">Ingredients</h2>
          <button type="button" className="add-button" onClick={() => updateRecipe({ ingredients: [...recipe.ingredients, { icon: "🍴", name: "", amount: "" }] })}>+ Add Ingredient</button>
        </div>
        <div className="ingredients-container">
          {recipe.ingredients.map((ing, i) => (
            <div key={i} className="ingredient-card">
              <div className="ingredient-icon">{ing.icon || "🍴"}</div>
              <div className="ingredient-content">
                <input type="text" value={ing.name || ""} onChange={e => { const u = [...recipe.ingredients]; u[i] = { ...u[i], name: e.target.value }; updateRecipe({ ingredients: u }); }} placeholder="Ingredient name" className="ingredient-name-input" />
                <input type="text" value={ing.amount || ""} onChange={e => { const u = [...recipe.ingredients]; u[i] = { ...u[i], amount: e.target.value }; updateRecipe({ ingredients: u }); }} placeholder="Amount" className="ingredient-amount-input" />
              </div>
              <button type="button" className="remove-button" onClick={() => updateRecipe({ ingredients: recipe.ingredients.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="section-container relative">
        {changedKeysRef.current.includes("instructions") && <Ping />}
        <div className="section-header">
          <h2 className="section-title">Instructions</h2>
          <button type="button" className="add-step-button" onClick={() => { updateRecipe({ instructions: [...recipe.instructions, ""] }); setEditingIdx(recipe.instructions.length); }}>+ Add Step</button>
        </div>
        <div className="instructions-container">
          {recipe.instructions.map((inst, i) => (
            <div key={i} className="instruction-item">
              <div className="instruction-number">{i + 1}</div>
              {i < recipe.instructions.length - 1 && <div className="instruction-line" />}
              <div className={`instruction-content ${editingIdx === i ? "instruction-content-editing" : ""}`} onClick={() => setEditingIdx(i)}>
                <textarea className="instruction-textarea" value={inst || ""} onChange={e => { const u = [...recipe.instructions]; u[i] = e.target.value; updateRecipe({ instructions: u }); }} placeholder="Enter cooking instruction..." onFocus={() => setEditingIdx(i)} onBlur={() => setEditingIdx(null)} />
                <button type="button" className="instruction-delete-btn remove-button" onClick={e => { e.stopPropagation(); updateRecipe({ instructions: recipe.instructions.filter((_, j) => j !== i) }); }}>×</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="action-container">
        <button className={isLoading ? "improve-button loading" : "improve-button"} type="button" disabled={isLoading}
          onClick={() => { if (!isLoading) { agent.addMessage({ id: crypto.randomUUID(), role: "user", content: "Improve the recipe" }); copilotkit.runAgent({ agent }); } }}>
          {isLoading ? "Please Wait..." : "Improve with AI"}
        </button>
      </div>
    </form>
  );
}

function Ping() {
  return <span className="ping-animation"><span className="ping-circle" /><span className="ping-dot" /></span>;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent="shared_state">
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: "#f5f5f5" }}>
        <RecipeCard />
        <CopilotSidebar agentId="shared_state" defaultOpen={true} labels={{ modalHeaderTitle: "AI Recipe Assistant" }} />
      </div>
    </CopilotKit>
  );
}
