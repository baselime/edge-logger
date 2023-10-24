# Baselime Edge Logger

OpenTelemetry aware logger for Cloudflare Workers and Vercel Edge Functions.

## Usage

```
npm i @baselime/edge-logger
```

Add the Logger to your Cloudflare worker

```javascript
export default {
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
		});

		ctx.waitUntil(logger.flush());
		return new Response('Sent message to the queue');
	}
}
