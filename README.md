# Baselime Edge Logger

OpenTelemetry aware logger for Cloudflare Workers and Vercel Edge Functions.

## Usage

```bash
npm i @baselime/edge-logger
```

### Usage

> `ctx.waitUntil(logger.flush());` You must flush at the end of your invocation.

```typescript
import { BaselimeLogger } from '@baselime/edge-logger'

export interface Env {
	BASELIME_KEY: string
	IS_LOCAL_DEV?: string
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
			isLocalDev: env.IS_LOCAL_DEV
		})

		logger.info('Hello world', { cfRay: req.headers.get('cf-ray'), foo: 'bar' })

		ctx.waitUntil(logger.flush());
		return new Response('Hello world!');
	}
}
```

## Configuration

The BaselimeLogger class takes the following configuration options

| Property        | Type                | Optional | Description                    |
|-----------------|---------------------|----------|--------------------------------|
| `ctx`           | `ExecutionContext`  |          | Execution context              |
| `apiKey`        | `string`            |          | API key for authentication      |
| `dataset`       | `string`            | ✓        | Optional dataset name          |
| `service`       | `string`            | ✓        | Optional service name          |
| `namespace`     | `string`            | ✓        | Optional namespace             |
| `baselimeUrl`   | `string`            | ✓        | Optional base URL              |
| `flushAfterMs`  | `number`            | ✓        | Flush after milliseconds       |
| `flushAfterLogs`| `number`            | ✓        | Flush after a number of logs   |
| `requestId`     | `string`            | ✓        | Request ID   |
| `isLocalDev`    | `boolean`           | ✓        | Indicates if it's for local development |

## Local Dev

For pretty formatted logs in wrangler add a .dev.var file to your wrangler project

```.env
IS_LOCAL_MODE=1
```

and add the isLocalDev property when configuring the logger

```javascript
export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const logger = new BaselimeLogger({
			ctx,
			apiKey: env.BASELIME_KEY,
			isLocalDev: env.IS_LOCAL_DEV
		})

```

## Supported methods

```javascript
logger.info("This is an informational message", { payload: { foo: "bar" } });
logger.warn("This is a warning message", { payload: { foo: "bar" } });
logger.error("This is an error message", { payload: { foo: "bar" } });
```

### Contributing

If you would like to contribute to the development of this library, please
submit a pull request on GitHub.

### License

This library is licensed under the MIT License. See the [LICENSE](LICENSE) file
for details.

<!-- Badges -->

[docs]: https://baselime.io/docs/
[docs_badge]: https://img.shields.io/badge/docs-reference-blue.svg?style=flat-square
[license]: https://opensource.org/licenses/MIT
[license_badge]: https://img.shields.io/github/license/baselime/lambda-logger.svg?color=blue&style=flat-square&ghcache=unused