import {
	CopilotRuntime,
	copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import type { NextRequest } from "next/server";

async function createRuntime() {
	const { LangGraphAgent } = await import("@copilotkit/runtime/langgraph");
	return new CopilotRuntime({
		agents: {
			roast_prof: new LangGraphAgent({
				deploymentUrl:
					process.env.LANGGRAPH_URL || "http://127.0.0.1:8123",
				graphId: "roast_prof",
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
