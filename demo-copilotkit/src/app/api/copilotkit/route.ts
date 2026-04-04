import {
  CopilotRuntime,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";

// Dynamic import to handle langgraph export path
async function createRuntime() {
  const { LangGraphAgent } = await import("@copilotkit/runtime/langgraph");
  return new CopilotRuntime({
    agents: {
      shared_state: new LangGraphAgent({
        deploymentUrl: "http://127.0.0.1:8123",
        graphId: "shared_state",
      }),
    },
  });
}

let runtimePromise: ReturnType<typeof createRuntime> | null = null;

export const POST = async (req: NextRequest) => {
  if (!runtimePromise) runtimePromise = createRuntime();
  const runtime = await runtimePromise;

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
