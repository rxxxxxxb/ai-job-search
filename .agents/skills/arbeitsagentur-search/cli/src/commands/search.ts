import {
  SEARCH_URL,
  jsonFetch,
  toJobCard,
  offerTypeCode,
  workTimeCode,
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
  stellenangebote?: Record<string, unknown>[]
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
  const wt = workTimeCode(opts.worktime)
  if (wt) params.set("arbeitszeit", wt)
  params.set("angebotsart", offerTypeCode(opts.offerType))
  params.set("page", String(opts.page))
  params.set("size", String(opts.size))
  return `${SEARCH_URL}?${params.toString()}`
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
    const raw = data?.stellenangebote ?? []

    let cards = raw
      .map((r) => toJobCard(r))
      .filter((c): c is JobCard => c !== null)

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
