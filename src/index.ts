import { ExecutionContext } from "@cloudflare/workers-types";
import { trace } from "@opentelemetry/api";
export type BaselimeLog = {
	message: string;
	error?: string;
	requestId: string;
	level: string;
	traceId: string | undefined;
	[key: string]: unknown;
};

export type BaselimeLoggerArgs = {
	ctx: ExecutionContext;
	apiKey: string;
	dataset?: string;
	service?: string;
	namespace?: string;
	baselimeUrl?: string;
	flushAfterMs?: number;
	flushAfterLogs?: number;
	requestId?: string | null;
	isLocalDev?: boolean;
};

class MonotonicTimestamp {
	private monotonicTimestamp: number;
	constructor() {
		this.monotonicTimestamp = Date.now();
	}

	now() {
		let timestamp = Date.now();
		if (timestamp > this.monotonicTimestamp) {
			this.monotonicTimestamp = timestamp + 1;
		} else {
			timestamp = this.monotonicTimestamp;
			this.monotonicTimestamp += 1;
		}
		return timestamp;
	}
}

export class BaselimeLogger {
	private readonly ctx: ExecutionContext;
	private readonly apiKey: string;
	private readonly dataset: string;
	private readonly service: string;
	private readonly namespace: string;
	private readonly logs: BaselimeLog[] = [];
	private readonly requestId: string;
	// flushTimeout is a timeout set by setTimeout() to flush the logs after a certain amount of time
	private flushTimeout: NodeJS.Timeout | null = null;
	private flushPromise: Promise<void> | null = null;
	private flushAfterMs: number;
	private flushAfterLogs: number;
	private baselimeUrl: string;
	private isLocalDev: boolean;
	private timestamp: MonotonicTimestamp;

	constructor(args: BaselimeLoggerArgs) {
		this.ctx = args.ctx;
		this.apiKey = args.apiKey;
		this.dataset = args.dataset ?? "edge-logger";
		this.service = args.service;
		this.namespace = args.namespace;
		this.flushAfterMs = args.flushAfterMs ?? 10000;
		this.flushAfterLogs = args.flushAfterLogs ?? 100;
		this.baselimeUrl = args.baselimeUrl ?? "https://events.baselime.io/v1";
		if (args.requestId) {
			this.requestId = args.requestId;
		} else {
			this.requestId = crypto.randomUUID();
		}
		this.isLocalDev = args.isLocalDev;
		this.timestamp = new MonotonicTimestamp();
	}

	private async _log(
		message: string,
		level: string,
		data?: Record<string, unknown>,
	) {
		const span = trace.getActiveSpan();
		const traceId = span?.spanContext().traceId;

		if (this.isLocalDev) {
			const colors = {
				info: "\x1b[32m",
				warning: "\x1b[33m",
				error: "\x1b[31m",
				debug: "\x1b[35m",
			};

			const grey = "\x1b[90m";
			const white = "\x1b[0m";
			console.log(
				`${colors[level]}${level}${grey} - ${this.requestId} - ${white}${message}`,
			);
			if (data) {
				console.log(`${grey} ${JSON.stringify(data, null, 2)}`);
			}
			return;
		}

		const log: BaselimeLog = {
			message,
			level: (data?.level as string) || level,
			traceId,
			timestamp: this.timestamp.now(),
			requestId: this.requestId,
			...data,
		};
		/**
		 * If no API key or context, we can't send logs so log them to sdtout
		 */
		if (!this.apiKey || !this.ctx) {
			console.log(JSON.stringify(log));
		}

		this.logs.push(log);

		if (this.logs.length >= this.flushAfterLogs) {
			// Reset scheduled if there is one
			if (this.flushTimeout) {
				this.scheduleFlush(this.flushAfterMs, true);
			}
			this.ctx.waitUntil(this.flush({ skipIfInProgress: true }));
		} else {
			// Always schedule a flush (if there isn't one already)
			this.scheduleFlush(this.flushAfterMs);
		}
	}

	/** Flush after X ms if there's not already
	 * a flush scheduled
	 * @param reset If true, cancel the current flush timeout
	 */
	scheduleFlush(timeout: number, reset = false) {
		if (reset && this.flushTimeout) {
			clearTimeout(this.flushTimeout);
			this.flushTimeout = null;
		}

		if (!this.flushTimeout && !this.flushPromise) {
			this.flushTimeout = setTimeout(() => {
				const doFlush = async () => {
					this.flush({ skipIfInProgress: true });
					this.flushTimeout = null;
				};
				this.ctx.waitUntil(doFlush());
			}, timeout);
		}
	}

	async flush({
		skipIfInProgress = false,
	}: { skipIfInProgress?: boolean } = {}) {
		if (skipIfInProgress && this.flushPromise) return;

		const doFlush = async () => {
			if (this.logs.length === 0) return; // Nothing to do

			const logsCount = this.logs.length;
			const logsBody = JSON.stringify(this.logs);

			try {
				const res = await fetch(`${this.baselimeUrl}/${this.dataset}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": this.apiKey,
						"x-service": this.service,
						"x-namespace": this.namespace,
					},
					body: logsBody,
				});
				if (res.ok) {
					// Remove the logs we sent
					this.logs.splice(0, logsCount);
					await res.arrayBuffer(); // Read the body to completion
				} else {
					console.log(
						`Baselime failed to ingest logs: ${res.status} ${
							res.statusText
						} ${await res.text()}`,
					);
				}
			} catch (err) {
				console.error(`Baselime failed to ingest logs: ${err}`);
			}
		};

		// Make sure the last one is done before starting a flush
		await this.flushPromise;

		this.flushPromise = doFlush();
		await this.flushPromise;
		this.flushPromise = null;
	}

	log(msg: string, data?: Record<string, unknown>) {
		this._log(msg, "info", data);
	}

	info(msg: string, data?: Record<string, unknown>) {
		this._log(msg, "info", data);
	}

	warn(msg: string, data?: Record<string, unknown>) {
		this._log(msg, "warning", data);
	}

	error(msg: string | Error | unknown, data?: Record<string, unknown>) {
		let m = "";
		if (msg instanceof Error) {
			m = msg.message + (msg.stack ? `: ${msg.stack}` : "");
		} else if (typeof msg === "string") {
			m = msg;
		} else {
			m = JSON.stringify(msg);
		}
		this._log(m, "error", data);
	}

	debug(msg: string, data?: Record<string, unknown>) {
		this._log(msg, "debug", data);
	}
}
