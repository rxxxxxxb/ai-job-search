import {
  SEARCH_URL,
  jsonFetch,
  toJobCard,
  offerTypeCode,
  workTimeFilter,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  radius?: number
  jobage: number
  worktime?: string
  offerType?: string
  page: number
  size: number
  limit?: number
  format: "json" | "table" | "plain"
}

interface SearchResponse {
  ergebnisliste?: Record<string, unknown>[]
  maxErgebnisse?: number
  page?: number
  size?: number
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("was", opts.query)
  if (opts.location) params.set("wo", opts.location)
  if (opts.radius !== undefined) params.set("umkreis", String(opts.radius))
  // `veroeffentlichtseit` is in days. Omit it entirely for "any age" so the API
  // does not apply an implicit window.
  if (opts.jobage > 0 && opts.jobage < 9999) {
    params.set("veroeffentlichtseit", String(opts.jobage))
  }
  const wt = workTimeFilter(opts.worktime)
  if (wt) params.set(wt[0], wt[1])
  params.set("angebotsart", offerTypeCode(opts.offerType))
  params.set("page", String(opts.page))
  params.set("size", String(opts.size))
  return `${SEARCH_URL}?${params.toString()}`
}

/**
 * Turn a search response into result cards, refusing to report "no results" when
 * the response does not look like a result list. A genuine empty search returns
 * `maxErgebnisse: 0` and no `ergebnisliste`; anything else that yields no cards
 * means the endpoint or its response format has changed.
 */
export function extractCards(data: SearchResponse | null, page: number): JobCard[] {
  if (data === null) {
    throw new Error("search endpoint returned 404 - the API path may have moved (see url-reference.md)")
  }
  const raw = Array.isArray(data.ergebnisliste) ? data.ergebnisliste : []
  const total = typeof data.maxErgebnisse === "number" ? data.maxErgebnisse : null

  // Past the last page a missing list is expected, so only page 1 can tell.
  if (raw.length === 0 && (total === null || (page === 1 && total > 0))) {
    throw new Error(
      `the API reported ${total ?? "an unknown number of"} matches but sent no result list - ` +
        "its response format may have changed (see url-reference.md)",
    )
  }

  const cards = raw.map((r) => toJobCard(r)).filter((c): c is JobCard => c !== null)
  if (raw.length > 0 && cards.length === 0) {
    throw new Error(
      `the API returned ${raw.length} listings but none could be read - its field names may ` +
        "have changed (see url-reference.md)",
    )
  }
  return cards
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const id = (c.id || "").slice(0, 26).padEnd(26)
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    return `${id} ${title} ${company} ${loc} ${c.date || "—"}`
  })
  const header =
    "ID".padEnd(26) +
    " " +
    "TITLE".padEnd(44) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(26) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const data = await jsonFetch<SearchResponse>(buildUrl(opts))
    let cards = extractCards(data, opts.page)

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length === 0
          ? "No results."
          : cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              total: data?.maxErgebnisse ?? null,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
