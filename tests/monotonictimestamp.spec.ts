import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
// import { MonotonicTimestamp } from "../src";

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

describe("MonotonicTimestamp", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("Increments each call", () => {
		vi.setSystemTime(0);
		const timestamp = new MonotonicTimestamp();

		expect(timestamp.now()).toBe(0);
		expect(timestamp.now()).toBe(1);
		expect(timestamp.now()).toBe(2);

		vi.setSystemTime(1000);

		expect(timestamp.now()).toBe(1000);
		expect(timestamp.now()).toBe(1001);
	});
});
