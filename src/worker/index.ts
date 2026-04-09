import { Hono } from "hono";
import { runMonitor } from "./monitor";
import chat from "./routes/chat";
import dialogue from "./routes/dialogue";
import docs from "./routes/documents";
import media from "./routes/media";
import memories from "./routes/memories";
import threads from "./routes/threads";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/threads", threads);
app.route("/api/documents", docs);
app.route("/api", media);
app.route("/api/memories", memories);
app.route("/api/chat", chat);
app.route("/api/dialogue", dialogue);

app.get("/api/health", (c) => c.json({ status: "ok" }));

export default {
	fetch: app.fetch,
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(runMonitor(env));
	},
};
