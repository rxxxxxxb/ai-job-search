import { afterEach, describe, expect, test } from "bun:test"
import { jsonFetch, USER_AGENT } from "../src/helpers.js"

// The portal-skill contract asks for an honest User-Agent that names the tool,
// never a browser impersonation. This CLI used to send a Chrome string; the API
// returns the same data either way.
const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("jsonFetch user agent", () => {
  test("names the tool instead of impersonating a browser", () => {
    expect(USER_AGENT).toBe("Mozilla/5.0 (compatible; arbeitsagentur-cli/1.0)")
    expect(USER_AGENT).not.toContain("Chrome")
  })

  test("sends it, with the API key, on every request", async () => {
    let headers: Record<string, string> | undefined
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>
      return new Response("{}", { status: 200 })
    }) as unknown as typeof fetch

    await jsonFetch("https://example.invalid/x")
    expect(headers?.["User-Agent"]).toBe(USER_AGENT)
    expect(headers?.["X-API-Key"]).toBe("jobboerse-jobsuche")
  })
})
