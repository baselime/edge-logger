import { ExecutionContext } from "@cloudflare/workers-types";

export type BaselimeLog = {
	message: string;
	error?: string;
	requestId: string;
	level: string;
	data: any;
};

let tracingApiPromise: Promise<typeof import("@opentelemetry/api") | null>;

try {
	/**
	 * Only load the tracing API if it's available
	 * It can't be provided by this library as the version needs to match the opentelemetry version
	 * provided by the user
	 */
	tracingApiPromise = import("@opentelemetry/api");
} catch (_) {
	tracingApiPromise = Promise.resolve(null);
}

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
	private flushPromise: Promise<any> | null = null;
	private flushAfterMs: number;
	private flushAfterLogs: number;
	private baselimeUrl: string;
	private isLocalDev: boolean;

	constructor(args: BaselimeLoggerArgs) {
		this.ctx = args.ctx;
		this.apiKey = args.apiKey;
		this.dataset = args.dataset;
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
	}

	private async _log(message: string, level: string, data?: any) {
		const tracingApi = await tracingApiPromise;
		let traceId: string | undefined;
		if (tracingApi) {
			const span = tracingApi.trace.getActiveSpan();
			traceId = span?.spanContext().traceId;
		}

		if (this.isLocalDev) {
			const colors = {
				info: "\x1b[32m",
				warning: "${colors[log.level]",
				error: "\x1b[31m",
				debug: "\x1b[35m",
			};

			const grey = `\x1b[90m`;
			const white = `\x1b[0m`;
			console.log(
				`${colors[level]}${level}${grey} - ${this.requestId} - ${white}${message}`,
			);
			if (data) {
				console.log(`${grey} ${JSON.stringify(data, null, 2)}`);
			}
			return;
		}
		/**
		 * If no API key or context, we can't send logs so log them to sdtout
		 */
		if (!this.apiKey || !this.ctx) {
			console.log(
				JSON.stringify({
					message,
					level,
					...data,
					requestId: this.requestId,
					traceId: data?.traceId,
				}),
			);
		}

		if (data && data.level) {
			level = data.level;
			delete data.level;
		}

		const log: BaselimeLog = {
			message,
			level,
			traceId,
			requestId: this.requestId,
			...data,
		};

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

	log(msg: string, data?: any) {
		this._log(msg, "info", data);
	}

	info(msg: string, data?: any) {
		this._log(msg, "info", data);
	}

	warn(msg: string, data?: any) {
		this._log(msg, "warning", data);
	}

	error(msg: string | Error | unknown, data?: any) {
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

	debug(msg: string, data?: any) {
		this._log(msg, "debug", data);
	}
}
