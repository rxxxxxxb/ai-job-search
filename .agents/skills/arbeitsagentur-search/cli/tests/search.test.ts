import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.js"

// Live smoke tests. These hit the real public API, so they are deliberately few
// and small — a handful of requests, never a crawl.

interface SearchResult {
  meta: { count: number; page: number; total: number | null }
  results: Array<{
    id: string
    title: string
    company: string | null
    location: string | null
    date: string | null
    url: string
  }>
}

describe("live search", () => {
  test("returns real, complete results for a realistic query", async () => {
    const r = await runCLI([
      "search",
      "-q",
      "Machine Learning",
      "-l",
      "Deutschland",
      "--limit",
      "5",
    ])
    const data = parseJSON<SearchResult>(r)

    expect(data.results.length).toBeGreaterThan(0)
    expect(data.meta.count).toBe(data.results.length)

    for (const job of data.results) {
      // Contract: id, title and url must always be usable.
      expect(job.id).toBeTruthy()
      expect(job.title).toBeTruthy()
      expect(job.url).toContain("arbeitsagentur.de")
      // Guard against the parser silently degrading into HTML/entity soup.
      expect(job.title).not.toContain("<")
      expect(job.title).not.toContain("&amp;")
      expect(job.title).not.toBe("null")
      expect(job.company).not.toBe("null")
      expect(job.location).not.toBe("null")
    }
  })

  test("honours --limit", async () => {
    const r = await runCLI(["search", "-q", "Entwickler", "-l", "Deutschland", "--limit", "2"])
    const data = parseJSON<SearchResult>(r)
    expect(data.results.length).toBeLessThanOrEqual(2)
  })

  test("--jobage narrows the result set", async () => {
    const wide = parseJSON<SearchResult>(
      await runCLI(["search", "-q", "Machine Learning", "-l", "Deutschland", "--limit", "1"]),
    )
    const narrow = parseJSON<SearchResult>(
      await runCLI([
        "search",
        "-q",
        "Machine Learning",
        "-l",
        "Deutschland",
        "--jobage",
        "14",
        "--limit",
        "1",
      ]),
    )
    // Both report the server-side total; the 14-day window must not exceed all-time.
    if (wide.meta.total !== null && narrow.meta.total !== null) {
      expect(narrow.meta.total).toBeLessThanOrEqual(wide.meta.total)
    }
  })

  test("detail on a live search hit returns readable text", async () => {
    const search = parseJSON<SearchResult>(
      await runCLI(["search", "-q", "Machine Learning", "-l", "Deutschland", "--limit", "1"]),
    )
    const id = search.results[0]?.id
    expect(id).toBeTruthy()

    const r = await runCLI(["detail", id!, "--format", "plain"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout.length).toBeGreaterThan(50)
    expect(r.stdout).not.toContain("&amp;")
    expect(r.stdout).not.toContain("<p>")
  })

  test("detail on a bogus reference number fails cleanly, not with a crash", async () => {
    const r = await runCLI(["detail", "definitely-not-a-real-refnr-000"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("NOT_FOUND")
  })
})
