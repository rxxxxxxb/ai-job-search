// Data source: Bundesagentur für Arbeit ("Jobbörse") public jobsuche REST API.
// This is the official German federal employment agency's job board API - the same
// backend its own public web frontend at arbeitsagentur.de/jobsuche calls.
//
// It returns JSON, so unlike the HTML-scraping portal skills there is no markup
// parsing here and nothing to break when the site is restyled. See url-reference.md
// for the endpoint documentation and the field mapping.

export const API_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
export const SEARCH_URL = `${API_BASE}/pc/v4/jobs`
export const DETAIL_URL = `${API_BASE}/pc/v4/jobdetails`
export const PUBLIC_JOB_URL = "https://www.arbeitsagentur.de/jobsuche/jobdetail"

// Public client key used by the arbeitsagentur.de web frontend itself. It is not a
// secret and not tied to a user account - the API rejects requests without it.
export const API_KEY = "jobboerse-jobsuche"

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/**
 * Fetch JSON with exponential backoff + jitter on 429/5xx. Returns null on 404
 * (and on 403, which this API returns for an unknown/expired reference number)
 * rather than throwing, so a single dead posting cannot abort a batch.
 */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "X-API-Key": API_KEY,
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })

    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }

    // 404: no such posting. 403: this API's response for an unknown reference
    // number as well as for a missing key - the key is always sent here, so at
    // this point it means "not found".
    if (response.status === 404 || response.status === 403) return null

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  profession: string | null
  externalUrl: string | null
  startDate: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  contractDuration: string | null
  salary: string | null
  fullTime: boolean | null
  branch: string | null
  isPrivateAgency: boolean | null
}

/**
 * The API sometimes emits the *string* "null" instead of a JSON null for absent
 * address parts (observed on `arbeitsort.strasse`). Treat those as missing, or
 * they leak into output as the literal text "null".
 */
function nullish(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null
  return t
}

/** Build the public arbeitsagentur.de job URL for a reference number. */
export function publicUrl(refnr: string): string {
  return `${PUBLIC_JOB_URL}/${encodeURIComponent(refnr)}`
}

/**
 * The detail endpoint keys the posting by base64 of the reference number, not by
 * the raw refnr (the raw form returns 403). Bun/Node `btoa` is ASCII-only and the
 * reference numbers are ASCII, so this is safe.
 */
export function encodeRefnr(refnr: string): string {
  return Buffer.from(refnr, "utf8").toString("base64")
}

/** Format an `arbeitsort` object into a single human-readable location string. */
function formatLocation(ort: Record<string, unknown> | null | undefined): string | null {
  if (!ort || typeof ort !== "object") return null
  const city = nullish(ort.ort)
  const region = nullish(ort.region)
  const plz = nullish(ort.plz)
  const parts: string[] = []
  if (plz && city) parts.push(`${plz} ${city}`)
  else if (city) parts.push(city)
  if (region && region !== city) parts.push(region)
  return parts.length ? parts.join(", ") : null
}

/**
 * Map one search hit to the portal-skill result contract. Every field the contract
 * requires is always present (null when unknown), never omitted.
 */
export function toJobCard(raw: Record<string, unknown>): JobCard | null {
  const id = nullish(raw.refnr)
  if (!id) return null
  return {
    id,
    title: nullish(raw.titel) ?? nullish(raw.beruf) ?? "(ohne Titel)",
    company: nullish(raw.arbeitgeber),
    location: formatLocation(raw.arbeitsort as Record<string, unknown>),
    date: nullish(raw.aktuelleVeroeffentlichungsdatum),
    url: publicUrl(id),
    profession: nullish(raw.beruf),
    externalUrl: nullish(raw.externeUrl),
    startDate: nullish(raw.eintrittsdatum),
  }
}

/**
 * Map a detail response. Note this endpoint uses an entirely different field
 * vocabulary from search (`stellenangebotsTitel` vs `titel`, `firma` vs
 * `arbeitgeber`, ...) - see url-reference.md for the full table.
 */
export function toJobDetail(raw: Record<string, unknown>, refnr: string): JobDetail {
  const locs = Array.isArray(raw.stellenlokationen) ? raw.stellenlokationen : []
  const first = (locs[0] ?? null) as Record<string, unknown> | null
  const addr = (first?.adresse ?? null) as Record<string, unknown> | null

  let location: string | null = null
  if (addr) {
    const city = nullish(addr.ort)
    const plz = nullish(addr.plz)
    const region = nullish(addr.region)
    const parts: string[] = []
    if (plz && city) parts.push(`${plz} ${city}`)
    else if (city) parts.push(city)
    if (region) parts.push(region.replace(/_/g, " "))
    location = parts.length ? parts.join(", ") : null
  }

  const period = (raw.eintrittszeitraum ?? null) as Record<string, unknown> | null
  const salaryRaw = nullish(raw.verguetungsangabe)

  return {
    id: refnr,
    title: nullish(raw.stellenangebotsTitel) ?? nullish(raw.hauptberuf) ?? "(ohne Titel)",
    company: nullish(raw.firma),
    location,
    date: nullish(raw.datumErsteVeroeffentlichung),
    url: publicUrl(refnr),
    profession: nullish(raw.hauptberuf),
    externalUrl: nullish(raw.allianzpartnerUrl),
    startDate: period ? nullish(period.von) : null,
    description: nullish(raw.stellenbeschreibung) ?? nullish(raw.stellenangebotsBeschreibung),
    employmentType: nullish(raw.stellenangebotsart),
    contractDuration: nullish(raw.vertragsdauer),
    // "KEINE_ANGABEN" is the API's explicit "not stated" sentinel - surface it as
    // null rather than passing the sentinel through as if it were a salary.
    salary: salaryRaw && salaryRaw !== "KEINE_ANGABEN" ? salaryRaw : null,
    fullTime: typeof raw.arbeitszeitVollzeit === "boolean" ? raw.arbeitszeitVollzeit : null,
    branch: nullish(raw.branche),
    isPrivateAgency:
      typeof raw.istPrivateArbeitsvermittlung === "boolean"
        ? raw.istPrivateArbeitsvermittlung
        : null,
  }
}

/**
 * Offer type (`angebotsart`). 1 = regular employment, which is what a job search
 * means here; the others exist so the flag can be widened without guessing codes.
 */
export function offerTypeCode(kind: string | undefined): string {
  switch ((kind || "").toLowerCase()) {
    case "ausbildung":
    case "training":
      return "4"
    case "praktikum":
    case "internship":
      return "34"
    case "selbstaendig":
    case "self-employed":
      return "2"
    case "arbeit":
    case "employment":
    default:
      return "1"
  }
}

/** Working-time filter (`arbeitszeit`), comma-separated codes. */
export function workTimeCode(mode: string | undefined): string | null {
  switch ((mode || "").toLowerCase()) {
    case "remote":
    case "homeoffice":
    case "home-office":
      return "ho"
    case "vollzeit":
    case "fulltime":
    case "full-time":
      return "vz"
    case "teilzeit":
    case "parttime":
    case "part-time":
      return "tz"
    case "minijob":
      return "mj"
    case "schicht":
    case "shift":
      return "snw"
    default:
      return null
  }
}
