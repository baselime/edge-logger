/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Queue consumer: a Worker that can consume from a
 * Queue: https://developers.cloudflare.com/queues/get-started/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { instrument, ResolveConfigFn } from '@microlabs/otel-cf-workers'
import { context, trace } from '@opentelemetry/api'
import { BaselimeLogger } from '../../dist/index'
export interface Env {
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	MY_QUEUE: Queue
	BASELIME_KEY: string
}

const handler = {
	// Our fetch handler is invoked on a HTTP request: we can send a message to a queue
	// during (or after) a request.
	// https://developers.cloudflare.com/queues/platform/javascript-apis/#producer
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const logger = new BaselimeLogger({
			ctx,
			apiKey: env.BASELIME_KEY,
			service: 'my-worker',
			dataset: 'cloudflare',
			namespace: 'fetch',
			requestId: req.headers.get('cf-ray'),
		})

		logger.info('Hello world', { cfRay: req.headers.get('cf-ray'), foo: 'bar' })
		// To send a message on a queue, we need to create the queue first
		// https://developers.cloudflare.com/queues/get-started/#3-create-a-queue
		await env.MY_QUEUE.send({
			url: req.url,
			method: req.method,
			headers: Object.fromEntries(req.headers),
		})

		ctx.waitUntil(logger.flush())
		return new Response('Sent message to the queue')
	},
	// The queue handler is invoked when a batch of messages is ready to be delivered
	// https://developers.cloudflare.com/queues/platform/javascript-apis/#messagebatch
	async queue(batch: MessageBatch<Error>, env: Env, ctx: ExecutionContext): Promise<void> {
		const logger = new BaselimeLogger({
			ctx,
			apiKey: env.BASELIME_KEY,
			service: 'my-worker',
			dataset: 'cloudflare',
			namespace: 'queue',
		})
		// A queue consumer can make requests to other endpoints on the Internet,
		// write to R2 object storage, query a D1 Database, and much more.
		for (let message of batch.messages) {
			// Process each message (we'll just log these)
			logger.info('message processed', { queueInput: message })
			logger.info('Done')
		}
		ctx.waitUntil(logger.flush())
	},
}

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://otel.baselime.io/v1',
			headers: { 'x-api-key': env.BASELIME_KEY },
		},
		service: { name: 'my-worker' },
	}
}

export default instrument(handler, config)
