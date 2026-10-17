import { afterEach, describe, expect, test } from "bun:test"
import { jsonFetch } from "../src/helpers.js"
import { extractCards } from "../src/commands/search.js"

// Failure handling. Until 2026 the CLI read a 403 as "no results", so when the
// Bundesagentur switched off /pc/v4/jobs every search quietly came back empty.
// These pin the rule that only a genuine empty search may produce no results.

const realFetch = globalThis.fetch

function stubFetch(status: number, statusText: string, body = ""): void {
  globalThis.fetch = (async () => new Response(body, { status, statusText })) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("jsonFetch", () => {
  test("throws on 403 instead of reporting nothing found", async () => {
    stubFetch(403, "No match found for request")
    await expect(jsonFetch("https://example.invalid/x")).rejects.toThrow(
      "403 No match found for request",
    )
  })

  test("returns null on 404, the API's answer for an unknown posting", async () => {
    stubFetch(404, "Not Found")
    expect(await jsonFetch("https://example.invalid/x")).toBeNull()
  })

  test("parses a 200 body", async () => {
    stubFetch(200, "OK", JSON.stringify({ maxErgebnisse: 0 }))
    expect(await jsonFetch<{ maxErgebnisse: number }>("https://example.invalid/x")).toEqual({
      maxErgebnisse: 0,
    })
  })
})

describe("extractCards", () => {
  const HIT = { referenznummer: "A-1", stellenangebotsTitel: "Data Scientist", firma: "ACME" }

  test("returns no cards for a genuine empty search", () => {
    // What v6 sends when nothing matches: a zero total and no list at all.
    expect(extractCards({ maxErgebnisse: 0 }, 1)).toEqual([])
  })

  test("returns the readable hits", () => {
    const cards = extractCards({ maxErgebnisse: 1, ergebnisliste: [HIT] }, 1)
    expect(cards.map((c) => c.id)).toEqual(["A-1"])
  })

  test("skips a single unreadable hit among readable ones", () => {
    const cards = extractCards({ maxErgebnisse: 2, ergebnisliste: [HIT, { titel: "no id" }] }, 1)
    expect(cards).toHaveLength(1)
  })

  test("throws when the search endpoint is missing (404)", () => {
    expect(() => extractCards(null, 1)).toThrow("404")
  })

  test("throws when matches are reported but no list is sent", () => {
    expect(() => extractCards({ maxErgebnisse: 12 }, 1)).toThrow("sent no result list")
  })

  test("throws when the response has neither a total nor a list", () => {
    expect(() => extractCards({}, 1)).toThrow("sent no result list")
  })

  test("throws when no hit can be read, e.g. after a field rename", () => {
    // A v4-shaped hit: `refnr` instead of `referenznummer`.
    const v4Hit = { refnr: "A-1", titel: "Data Scientist" }
    expect(() => extractCards({ maxErgebnisse: 1, ergebnisliste: [v4Hit] }, 1)).toThrow(
      "none could be read",
    )
  })

  test("accepts an empty page past the last one", () => {
    expect(extractCards({ maxErgebnisse: 12 }, 3)).toEqual([])
  })
})
