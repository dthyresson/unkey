import { createLogger } from "@redwoodjs/api/logger";
import { MiddlewareRequest, MiddlewareResponse } from "@redwoodjs/vite/middleware";
import type { RatelimitConfig, RatelimitResponse } from "@unkey/ratelimit";
import { describe, expect, it, vi } from "vitest";
import createRatelimitMiddleware from "../createRatelimitMiddleware";
import type { RatelimitMiddlewareConfig } from "../types";

/**
 * Mock the Ratelimit class
 *
 * Use namespace to store the ratelimit identifier that determines if the rate limit is exceeded
 *
 * If namespace matches the identifier generated by withUnkey middleware, the rate limit is exceeded
 * and the response status is 429 because success is false
 *
 * Important: This behavior is for *this test mock only*. The actual Ratelimit class will *not* behave this way.
 */
vi.mock("@unkey/ratelimit", () => {
  let rateLimitIdentifier = "";

  return {
    Ratelimit: class {
      constructor(config: RatelimitConfig) {
        rateLimitIdentifier = config.namespace;
      }
      limit(identifier: string): Promise<RatelimitResponse> {
        return Promise.resolve({
          success: identifier === rateLimitIdentifier,
          limit: 0,
          remaining: 0,
          reset: 0,
        });
      }
    },
  };
});

const MOCK_ROOT_KEY = "unkey_mocked_root_key";

const defaultRateLimitConfig: Pick<RatelimitConfig, "rootKey" | "limit" | "duration" | "async"> = {
  rootKey: MOCK_ROOT_KEY,
  limit: 1,
  duration: "30s",
  async: true,
};

describe("createRatelimitMiddleware", () => {
  it("should create middleware", async () => {
    const config: RatelimitMiddlewareConfig = {
      config: {
        namespace: "app",
        ...defaultRateLimitConfig,
      },
    };
    const middleware = createRatelimitMiddleware(config);
    expect(middleware).toBeDefined();
  });

  it("should not rate limit", async () => {
    const config: RatelimitMiddlewareConfig = {
      config: {
        namespace: "192.168.1.1",
        ...defaultRateLimitConfig,
      },
    };
    const middleware = createRatelimitMiddleware(config);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = (await middleware(req, res)) as MiddlewareResponse;
    expect(result?.status).toBe(200);
  });

  it("should rate limit", async () => {
    // here the namespace will cause the rate limit
    // to be exceeded (status 429) because
    // it does not match the identifier generated by the withUnkey middleware
    // which is a defaulted value
    const config: RatelimitMiddlewareConfig = {
      config: {
        namespace: "my-app",
        ...defaultRateLimitConfig,
      },
    };
    const middleware = createRatelimitMiddleware(config);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = await middleware(req, res);
    expect(result?.status).toBe(429);
  });

  it("should be not rate limited with a custom default identifier function", async () => {
    // here the namespace will cause the rate limit
    // not to be exceeded (status 200) because it
    // matches the identifies generated by the withUnkey middleware
    const config: RatelimitMiddlewareConfig = {
      config: {
        namespace: "abcdefg",
        ...defaultRateLimitConfig,
      },

      getIdentifier: (_req: MiddlewareRequest) => {
        return "abcdefg"; // matches namespace so no rate limit for this test
      },
    };
    const middleware = createRatelimitMiddleware(config);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = await middleware(req, res);
    expect(result?.status).toBe(200);
  });

  it("should be limited with a custom default identifier function", async () => {
    // here the namespace will cause the rate limit to be exceeded (status 429)
    // because it does not match the identifier generated by the withUnkey middleware
    const config: RatelimitMiddlewareConfig = {
      config: {
        namespace: "12345",
        ...defaultRateLimitConfig,
      },

      getIdentifier: (_req: MiddlewareRequest) => {
        return "abcdefg";
      },
    };
    const middleware = createRatelimitMiddleware(config);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = await middleware(req, res);
    expect(result?.status).toBe(429);
  });

  it("should be limited with a custom rate limit exceeded message function", async () => {
    // here the namespace will cause the rate limit to be exceeded (status 429)
    // because it does not match the identifier generated by the withUnkey middleware
    const options: RatelimitMiddlewareConfig = {
      config: {
        namespace: "exceeded",
        ...defaultRateLimitConfig,
      },

      onExceeded: (_req: MiddlewareRequest) => {
        return new MiddlewareResponse("Custom Rate limit exceeded message", {
          status: 429,
        });
      },
    };
    const middleware = createRatelimitMiddleware(options);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = await middleware(req, res);
    expect(result?.status).toBe(429);
    expect(result?.body).toBe("Custom Rate limit exceeded message");
  });

  it("should error", async () => {
    // here the the identifier function will throw an error
    // which will cause a teh default error response to be returned
    const options: RatelimitMiddlewareConfig = {
      config: {
        namespace: "exceeded",
        ...defaultRateLimitConfig,
      },

      getIdentifier: (_req: MiddlewareRequest) => {
        throw new Error("Error simulated by test");
      },
    };
    const middleware = createRatelimitMiddleware(options);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = await middleware(req, res);

    expect(result?.body).toBe("Internal server error");
    expect(result?.status).toBe(500);
  });

  it("should error with custom message", async () => {
    // here the the identifier function will throw an error
    // which will cause the default error response to be returned
    const options: RatelimitMiddlewareConfig = {
      config: {
        namespace: "exceeded",
        ...defaultRateLimitConfig,
      },

      getIdentifier: (_req: MiddlewareRequest) => {
        throw new Error("Error simulated by test");
      },
      onError: (_req: MiddlewareRequest) => {
        return new MiddlewareResponse("Custom Error message when rate limiting", {
          status: 500,
        });
      },
    };
    const middleware = createRatelimitMiddleware(options);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = await middleware(req, res);

    expect(result?.body).toBe("Custom Error message when rate limiting");
    expect(result?.status).toBe(500);
  });

  it("should error with custom message and status", async () => {
    // here the the identifier function will throw an error
    // which will cause a custom error response to be returned
    const options: RatelimitMiddlewareConfig = {
      config: {
        namespace: "exceeded",
        ...defaultRateLimitConfig,
      },

      getIdentifier: (_req: MiddlewareRequest) => {
        throw new Error("Error simulated by test");
      },
      onError: (_req: MiddlewareRequest) => {
        return new MiddlewareResponse("Not implemented", {
          status: 501,
        });
      },
    };
    const middleware = createRatelimitMiddleware(options);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = await middleware(req, res);

    expect(result?.body).toBe("Not implemented");
    expect(result?.status).toBe(501);
  });

  it("should use a RedwoodJS-compatible logger", async () => {
    const options: RatelimitMiddlewareConfig = {
      config: {
        namespace: "exceeded",
        ...defaultRateLimitConfig,
      },

      getIdentifier: (_req: MiddlewareRequest) => {
        throw new Error("Error simulated by test");
      },
      onError: (_req: MiddlewareRequest) => {
        return new MiddlewareResponse("Not implemented", {
          status: 501,
        });
      },
      logger: createLogger({
        options: { level: "error", enabled: true },
      }),
    };
    const middleware = createRatelimitMiddleware(options);
    const request = new Request("http://localhost:8910/api/user");
    const req = new MiddlewareRequest(request);
    const res = new MiddlewareResponse();
    const result = await middleware(req, res);

    expect(result?.body).toBe("Not implemented");
    expect(result?.status).toBe(501);
  });
});
