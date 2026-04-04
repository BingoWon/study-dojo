/**
 * D1 Checkpointer for LangGraph — persists graph state to Cloudflare D1.
 * Modeled after MemorySaver from @langchain/langgraph-checkpoint.
 */

import type { RunnableConfig } from "@langchain/core/runnables";
import {
	BaseCheckpointSaver,
	type Checkpoint,
	type CheckpointListOptions,
	type CheckpointMetadata,
	type CheckpointTuple,
	copyCheckpoint,
	getCheckpointId,
	type PendingWrite,
	WRITES_IDX_MAP,
} from "@langchain/langgraph-checkpoint";

export class D1Saver extends BaseCheckpointSaver {
	private db: D1Database;

	constructor(db: D1Database) {
		super();
		this.db = db;
	}

	async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
		const threadId = config.configurable?.thread_id;
		const checkpointNs = config.configurable?.checkpoint_ns ?? "";
		let checkpointId = getCheckpointId(config);

		// biome-ignore lint/suspicious/noExplicitAny: D1 row type
		let row: any;

		if (checkpointId) {
			row = await this.db
				.prepare(
					`SELECT checkpoint_id, checkpoint, metadata, parent_checkpoint_id
				 FROM checkpoints
				 WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`,
				)
				.bind(threadId, checkpointNs, checkpointId)
				.first();
		} else {
			row = await this.db
				.prepare(
					`SELECT checkpoint_id, checkpoint, metadata, parent_checkpoint_id
				 FROM checkpoints
				 WHERE thread_id = ? AND checkpoint_ns = ?
				 ORDER BY checkpoint_id DESC LIMIT 1`,
				)
				.bind(threadId, checkpointNs)
				.first();
		}

		if (!row) return undefined;
		checkpointId = row.checkpoint_id;

		const checkpoint = (await this.serde.loadsTyped(
			"json",
			row.checkpoint,
		)) as Checkpoint;
		const metadata = (await this.serde.loadsTyped(
			"json",
			row.metadata,
		)) as CheckpointMetadata;

		// Load pending writes
		const writesResult = await this.db
			.prepare(
				`SELECT task_id, channel, value FROM checkpoint_writes
			 WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`,
			)
			.bind(threadId, checkpointNs, checkpointId)
			.all();

		const pendingWrites = await Promise.all(
			// biome-ignore lint/suspicious/noExplicitAny: D1 row
			(writesResult.results || []).map(async (w: any) => {
				return [
					w.task_id as string,
					w.channel as string,
					await this.serde.loadsTyped("json", w.value),
				] as [string, string, unknown];
			}),
		);

		const tuple: CheckpointTuple = {
			config: {
				configurable: {
					thread_id: threadId,
					checkpoint_ns: checkpointNs,
					checkpoint_id: checkpointId,
				},
			},
			checkpoint,
			metadata,
			pendingWrites,
		};

		if (row.parent_checkpoint_id) {
			tuple.parentConfig = {
				configurable: {
					thread_id: threadId,
					checkpoint_ns: checkpointNs,
					checkpoint_id: row.parent_checkpoint_id,
				},
			};
		}

		return tuple;
	}

	async *list(
		config: RunnableConfig,
		options?: CheckpointListOptions,
	): AsyncGenerator<CheckpointTuple> {
		const threadId = config.configurable?.thread_id;
		const checkpointNs = config.configurable?.checkpoint_ns ?? "";
		const { limit, before, filter } = options ?? {};

		let sql = `SELECT checkpoint_id, checkpoint, metadata, parent_checkpoint_id
			 FROM checkpoints WHERE thread_id = ? AND checkpoint_ns = ?`;
		const params: unknown[] = [threadId, checkpointNs];

		if (before?.configurable?.checkpoint_id) {
			sql += " AND checkpoint_id < ?";
			params.push(before.configurable.checkpoint_id);
		}
		sql += " ORDER BY checkpoint_id DESC";
		if (limit) {
			sql += " LIMIT ?";
			params.push(limit);
		}

		const result = await this.db
			.prepare(sql)
			.bind(...params)
			.all();

		for (const r of result.results || []) {
			// biome-ignore lint/suspicious/noExplicitAny: D1 row
			const row = r as any;
			const metadata = (await this.serde.loadsTyped(
				"json",
				row.metadata,
			)) as CheckpointMetadata;

			if (
				filter &&
				!Object.entries(filter).every(
					([k, v]) => (metadata as Record<string, unknown>)[k] === v,
				)
			)
				continue;

			const checkpoint = (await this.serde.loadsTyped(
				"json",
				row.checkpoint,
			)) as Checkpoint;

			const writesResult = await this.db
				.prepare(
					`SELECT task_id, channel, value FROM checkpoint_writes
				 WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?`,
				)
				.bind(threadId, checkpointNs, row.checkpoint_id)
				.all();

			const pendingWrites = await Promise.all(
				// biome-ignore lint/suspicious/noExplicitAny: D1 row
				(writesResult.results || []).map(async (w: any) => {
					return [
						w.task_id as string,
						w.channel as string,
						await this.serde.loadsTyped("json", w.value),
					] as [string, string, unknown];
				}),
			);

			const tuple: CheckpointTuple = {
				config: {
					configurable: {
						thread_id: threadId,
						checkpoint_ns: checkpointNs,
						checkpoint_id: row.checkpoint_id,
					},
				},
				checkpoint,
				metadata,
				pendingWrites,
			};

			if (row.parent_checkpoint_id) {
				tuple.parentConfig = {
					configurable: {
						thread_id: threadId,
						checkpoint_ns: checkpointNs,
						checkpoint_id: row.parent_checkpoint_id,
					},
				};
			}

			yield tuple;
		}
	}

	async put(
		config: RunnableConfig,
		checkpoint: Checkpoint,
		metadata: CheckpointMetadata,
	): Promise<RunnableConfig> {
		const threadId = config.configurable?.thread_id;
		const checkpointNs = config.configurable?.checkpoint_ns ?? "";
		const parentId = config.configurable?.checkpoint_id;

		if (!threadId) throw new Error("Missing thread_id in config.configurable");

		const prepared = copyCheckpoint(checkpoint);
		const [, serializedCheckpoint] = await this.serde.dumpsTyped(prepared);
		const [, serializedMetadata] = await this.serde.dumpsTyped(metadata);

		await this.db
			.prepare(
				`INSERT OR REPLACE INTO checkpoints
			 (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint, metadata)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				threadId,
				checkpointNs,
				checkpoint.id,
				parentId ?? null,
				serializedCheckpoint,
				serializedMetadata,
			)
			.run();

		return {
			configurable: {
				thread_id: threadId,
				checkpoint_ns: checkpointNs,
				checkpoint_id: checkpoint.id,
			},
		};
	}

	async putWrites(
		config: RunnableConfig,
		writes: PendingWrite[],
		taskId: string,
	): Promise<void> {
		const threadId = config.configurable?.thread_id;
		const checkpointNs = config.configurable?.checkpoint_ns ?? "";
		const checkpointId = config.configurable?.checkpoint_id;

		if (!threadId || !checkpointId)
			throw new Error(
				"Missing thread_id or checkpoint_id in config.configurable",
			);

		const stmts = await Promise.all(
			writes.map(async ([channel, value], idx) => {
				const [, serialized] = await this.serde.dumpsTyped(value);
				const writeIdx = WRITES_IDX_MAP[channel as string] ?? idx;

				return this.db
					.prepare(
						`INSERT OR REPLACE INTO checkpoint_writes
					 (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, value)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
					)
					.bind(
						threadId,
						checkpointNs,
						checkpointId,
						taskId,
						writeIdx,
						channel as string,
						serialized,
					);
			}),
		);

		if (stmts.length > 0) {
			await this.db.batch(stmts);
		}
	}

	async deleteThread(threadId: string): Promise<void> {
		await this.db.batch([
			this.db
				.prepare("DELETE FROM checkpoints WHERE thread_id = ?")
				.bind(threadId),
			this.db
				.prepare("DELETE FROM checkpoint_writes WHERE thread_id = ?")
				.bind(threadId),
		]);
	}
}
