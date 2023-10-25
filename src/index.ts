import { ExecutionContext } from "@cloudflare/workers-types"

export type BaselimeLog = {
	message: string
	error?: string
	requestId: string
    level: string
	data: any
}

let tracingApi: typeof import('@opentelemetry/api') | null = null;

try {
	/**
	 * Only load the tracing API if it's available
	 * It can't be provided by this library as the version needs to match the opentelemetry version
	 * provided by the user
	 */
	const api = require('@opentelemetry/api');
	tracingApi = api
} catch(_) {
}

export class BaselimeLogger {
	private readonly ctx: ExecutionContext
	private readonly apiKey
	private readonly dataset
	private readonly service
	private readonly namespace
	private readonly logs: BaselimeLog[] = []
	private readonly requestId

	// flushTimeout is a timeout set by setTimeout() to flush the logs after a certain amount of time
	private flushTimeout: any | null = null
	private flushPromise: Promise<any> | null = null
	private flushAfterMs
	private flushAfterLogs
    private baselimeUrl
	constructor({
		ctx,
		apiKey,
		dataset,
		service,
		namespace,
		flushAfterMs,
		flushAfterLogs,
		requestId,
        baselimeUrl
	}: {
		ctx: ExecutionContext
		apiKey: string
		dataset: string
		service: string
		namespace: string
        baselimeUrl?: string
		flushAfterMs?: number
		flushAfterLogs?: number
		requestId?: string | null
	}) {
		this.ctx = ctx
		this.apiKey = apiKey
		this.dataset = dataset
		this.service = service
		this.namespace = namespace
		this.flushAfterMs = flushAfterMs ?? 10000
		this.flushAfterLogs = flushAfterLogs ?? 100
        this.baselimeUrl = baselimeUrl ?? 'https://events.baselime.io/v1'
		if (requestId) {
			this.requestId = requestId
		} else {
			this.requestId = crypto.randomUUID()
		}
	}

	private async _log(message: string, level: string, data?: any) {
		if(tracingApi) {
			const span = tracingApi.trace.getActiveSpan();
			data['traceId'] = span?.spanContext().traceId;
		} 
		if (data && data.level) {
			level = data.level
			delete data.level
		}

		const log: BaselimeLog = {
			message,
			level,
			...data,
		}

		if (this.requestId) {
			log.requestId = this.requestId
		}

		this.logs.push(log)

		if (this.logs.length >= this.flushAfterLogs) {
			// Reset scheduled if there is one
			if (this.flushTimeout) {
				this.scheduleFlush(this.flushAfterMs, true)
			}
			this.ctx.waitUntil(this.flush({ skipIfInProgress: true }))
		} else {
			// Always schedule a flush (if there isn't one already)
			this.scheduleFlush(this.flushAfterMs)
		}
	}

	/** Flush after X ms if there's not already
	 * a flush scheduled
	 * @param reset If true, cancel the current flush timeout
	 */
	scheduleFlush(timeout: number, reset = false) {
		if (reset && this.flushTimeout) {
			clearTimeout(this.flushTimeout)
			this.flushTimeout = null
		}

		if (!this.flushTimeout && !this.flushPromise) {
			this.flushTimeout = setTimeout(() => {
				const doFlush = async () => {
					this.flush({ skipIfInProgress: true })
					this.flushTimeout = null
				}
				this.ctx.waitUntil(doFlush())
			}, timeout)
		}
	}

	async flush({ skipIfInProgress = false }: { skipIfInProgress?: boolean } = {}) {
		if (skipIfInProgress && this.flushPromise) return

		const doFlush = async () => {
			if (this.logs.length === 0) return // Nothing to do

			// Make sure the last one is done before starting a flush
			await this.flushPromise

			const logsCount = this.logs.length
			const logsBody = JSON.stringify(this.logs)

			try {

                if(!this.apiKey) {

                    const colors = {
                        info: '\x1b[32m',
                        warning: '${colors[log.level]',
                        error: '\x1b[31m',
                        debug: '\x1b[35m',
                    }

                    const grey = `\x1b[90m`
                    const white = `\x1b[0m`
                    for(let log of this.logs) {
                        console.log(`${colors[log.level]}${log.level }${grey} - ${this.requestId} - ${white}${log.message}`)
                        delete log.level
                        delete log.message;
                        delete log.requestId;
                        if(Object.values(log).length > 0) {
                            console.log(`${grey} ${JSON.stringify(log, null, 2)}`)
                        }
                    }
                    return
                }
				console.log(`${this.baselimeUrl}/${this.dataset}/${this.service}/${this.namespace}`)
				const res = await fetch(
					`${this.baselimeUrl}/${this.dataset}/${this.service}/${this.namespace}`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'x-api-key': this.apiKey,
						},
						body: logsBody,
					}
				)
				if (res.ok) {
					// Remove the logs we sent
					this.logs.splice(0, logsCount)
					await res.arrayBuffer() // Read the body to completion
				} else {
					console.log(`Baselime failed to ingest logs: ${res.status} ${res.statusText} ${await res.text()}`)
				}
			} catch (err) {
				console.error(`Baselime failed to ingest logs: ${err}`)
			}
		}

		this.flushPromise = doFlush()
		await this.flushPromise
		this.flushPromise = null
	}

	log(msg: string, data?: any) {
		this._log(msg, 'info', data)
	}

	info(msg: string, data?: any) {
		this._log(msg, 'info', data)
	}

	warn(msg: string, data?: any) {
		this._log(msg, 'warning', data)
	}

	error(msg: string | Error | unknown, data?: any) {
		const m: string =
			msg instanceof Error
				? msg.message + (msg.stack ? `: ${msg.stack}` : '')
				: typeof msg === 'string'
				? msg
				: JSON.stringify(msg)
		this._log(m, 'error', data)
	}

	debug(msg: string, data?: any) {
		this._log(msg, 'debug', data)
	}
}