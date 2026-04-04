/**
 * Shared State demo — recipe editor with real-time streaming updates.
 */

import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { dispatchCustomEvent } from "@langchain/core/callbacks/dispatch";
import {
  Command,
  Annotation,
  MessagesAnnotation,
  StateGraph,
  END,
  START,
} from "@langchain/langgraph";

const GENERATE_RECIPE_TOOL = {
  type: "function" as const,
  function: {
    name: "generate_recipe",
    description:
      "Using the existing (if any) ingredients and instructions, proceed with the recipe to finish it. Make sure the recipe is complete. ALWAYS provide the entire recipe, not just the changes.",
    parameters: {
      type: "object",
      properties: {
        recipe: {
          type: "object",
          properties: {
            skill_level: {
              type: "string",
              enum: ["Beginner", "Intermediate", "Advanced"],
            },
            special_preferences: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "High Protein",
                  "Low Carb",
                  "Spicy",
                  "Budget-Friendly",
                  "One-Pot Meal",
                  "Vegetarian",
                  "Vegan",
                ],
              },
            },
            cooking_time: {
              type: "string",
              enum: ["5 min", "15 min", "30 min", "45 min", "60+ min"],
            },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  icon: { type: "string", description: "Emoji icon like 🥕" },
                  name: { type: "string" },
                  amount: { type: "string" },
                },
              },
            },
            instructions: {
              type: "array",
              items: { type: "string" },
            },
            changes: {
              type: "string",
              description: "A description of the changes made",
            },
          },
        },
      },
      required: ["recipe"],
    },
  },
};

export const AgentState = Annotation.Root({
  recipe: Annotation<any>({
    reducer: (_x: any, y: any) => y ?? _x,
    default: () => undefined,
  }),
  tools: Annotation<any[]>({
    reducer: (_x: any, y: any) => y ?? _x,
    default: () => [],
  }),
  ...MessagesAnnotation.spec,
});

type State = typeof AgentState.State;

async function startFlow(
  state: State,
  config?: RunnableConfig,
): Promise<Command> {
  if (!state.recipe) {
    state.recipe = {
      skill_level: "Beginner",
      special_preferences: [],
      cooking_time: "15 min",
      ingredients: [
        { icon: "🍴", name: "Sample Ingredient", amount: "1 unit" },
      ],
      instructions: ["First step instruction"],
    };
    await dispatchCustomEvent(
      "manually_emit_intermediate_state",
      state,
      config,
    );
  }

  return new Command({
    goto: "chat_node",
    update: { messages: state.messages, recipe: state.recipe },
  });
}

async function chatNode(
  state: State,
  config?: RunnableConfig,
): Promise<Command> {
  const recipeJson = state.recipe
    ? JSON.stringify(state.recipe, null, 2)
    : "No recipe yet";

  const systemPrompt = `You are a helpful assistant for creating recipes.
This is the current state of the recipe: ${recipeJson}
You can improve the recipe by calling the generate_recipe tool.

IMPORTANT:
1. Create a recipe using the existing ingredients and instructions. Make sure the recipe is complete.
2. For ingredients, append new ingredients to the existing ones.
3. For instructions, append new steps to the existing ones.
4. 'ingredients' is always an array of objects with 'icon', 'name', and 'amount' fields
5. 'instructions' is always an array of strings

If you have just created or modified the recipe, just answer in one sentence what you did. dont describe the recipe, just say what you did.`;

  const model = new ChatOpenAI({ model: "gpt-4o-mini" });

  if (!config) config = { recursionLimit: 25 };
  if (!config.metadata) config.metadata = {};
  config.metadata.predict_state = [
    {
      state_key: "recipe",
      tool: "generate_recipe",
      tool_argument: "recipe",
    },
  ];

  const bound = model.bindTools(
    [...(state.tools ?? []), GENERATE_RECIPE_TOOL],
    { parallel_tool_calls: false },
  );

  const response = await bound.invoke(
    [new SystemMessage({ content: systemPrompt }), ...state.messages],
    config,
  );

  const messages = [...state.messages, response];

  if (response.tool_calls?.length) {
    const tc = response.tool_calls[0];
    if (tc.name === "generate_recipe") {
      const recipeData = tc.args.recipe;
      const recipe = state.recipe
        ? { ...state.recipe, ...recipeData }
        : recipeData;

      state.recipe = recipe;
      await dispatchCustomEvent(
        "manually_emit_intermediate_state",
        state,
        config,
      );

      return new Command({
        goto: "start_flow",
        update: {
          messages: [
            ...messages,
            {
              role: "tool" as const,
              content: "Recipe generated.",
              tool_call_id: tc.id,
            },
          ],
          recipe,
        },
      });
    }
  }

  return new Command({
    goto: END,
    update: { messages, recipe: state.recipe },
  });
}

export const graph = new StateGraph(AgentState)
  .addNode("start_flow", startFlow, {
    ends: ["chat_node"],
  })
  .addNode("chat_node", chatNode, {
    ends: ["start_flow", "__end__"],
  })
  .addEdge(START, "start_flow")
  .compile();
