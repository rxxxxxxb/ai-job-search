import {
  DETAIL_URL,
  jsonFetch,
  toJobDetail,
  encodeRefnr,
  writeError,
  type JobDetail,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept either a bare reference number or a full arbeitsagentur.de job URL, so
 * the id can be pasted straight from a browser.
 */
export function extractRefnr(input: string): string {
  const trimmed = input.trim()
  const m = trimmed.match(/jobdetail\/([^/?#]+)/i)
  if (m) return decodeURIComponent(m[1])
  return trimmed
}

function renderPlain(d: JobDetail): string {
  const lines: string[] = [
    d.title,
    `${d.company || "—"} · ${d.location || "—"}`,
    `id: ${d.id}`,
    `published: ${d.date || "—"}   start: ${d.startDate || "—"}`,
  ]
  if (d.contractDuration) lines.push(`contract: ${d.contractDuration}`)
  if (d.fullTime !== null) lines.push(`full time: ${d.fullTime ? "yes" : "no"}`)
  if (d.salary) lines.push(`salary: ${d.salary}`)
  if (d.isPrivateAgency) lines.push("note: listed via a private recruitment agency")
  lines.push(d.url, "")
  lines.push(d.description || "(no description provided)")
  return lines.join("\n")
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  try {
    const refnr = extractRefnr(opts.id)
    const data = await jsonFetch<Record<string, unknown>>(
      `${DETAIL_URL}/${encodeURIComponent(encodeRefnr(refnr))}`,
    )

    if (data === null) {
      writeError(
        `no posting found for reference number "${refnr}" (it may have expired or been withdrawn)`,
        "NOT_FOUND",
      )
      return 1
    }

    const detail = toJobDetail(data, refnr)

    if (opts.format === "plain") {
      process.stdout.write(renderPlain(detail) + "\n")
    } else {
      process.stdout.write(JSON.stringify(detail, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
