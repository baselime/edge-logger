# Baselime Edge Logger

OpenTelemetry aware logger for Cloudflare Workers and Vercel Edge Functions.

## Usage

```bash
npm i @baselime/edge-logger
```

Add the API key

```bash
npx wrangler secret put BASELIME_KEY <your Baselime api key>
```

Add the Logger to your Cloudflare worker

```typescript
import { BaselimeLogger } from '@baselime/edge-logger'

export interface Env {
	BASELIME_KEY: string
}

export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const logger = new BaselimeLogger({
			ctx,
			apiKey: env.BASELIME_KEY,
			service: 'my-worker',
			dataset: 'cloudflare',
			namespace: 'fetch',
			requestId: crypto.randomUUID(),
		})

		logger.info('Hello world', { cfRay: req.headers.get('cf-ray'), foo: 'bar' })

		ctx.waitUntil(logger.flush());
		return new Response('Hello world!');
	}
}
```

## Other examples

- [Example usage with Queues and Open Telemetry](./example/src/index.ts)
