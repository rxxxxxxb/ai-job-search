// Data source: Bundesagentur für Arbeit ("Jobbörse") public jobsuche REST API.
// This is the official German federal employment agency's job board API - the same
// backend its own public web frontend at arbeitsagentur.de/jobsuche calls.
//
// It returns JSON, so unlike the HTML-scraping portal skills there is no markup
// parsing here and nothing to break when the site is restyled. See url-reference.md
// for the endpoint documentation and the field mapping.

export const API_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service"
// Search moved from pc/v4 to pc/v6 in 2026; the v4 path now returns "403 No match
// found for request". Detail is still served on pc/v4.
export const SEARCH_URL = `${API_BASE}/pc/v6/jobs`
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

// The API sends the federal state as SCREAMING_SNAKE (`NORDRHEIN_WESTFALEN`). Map
// the 16 states back to their written names so locations read and match the way
// people type them; anything else just loses its underscores.
const REGION_NAMES: Record<string, string> = {
  BADEN_WUERTTEMBERG: "Baden-Württemberg",
  BAYERN: "Bayern",
  BERLIN: "Berlin",
  BRANDENBURG: "Brandenburg",
  BREMEN: "Bremen",
  HAMBURG: "Hamburg",
  HESSEN: "Hessen",
  MECKLENBURG_VORPOMMERN: "Mecklenburg-Vorpommern",
  NIEDERSACHSEN: "Niedersachsen",
  NORDRHEIN_WESTFALEN: "Nordrhein-Westfalen",
  RHEINLAND_PFALZ: "Rheinland-Pfalz",
  SAARLAND: "Saarland",
  SACHSEN: "Sachsen",
  SACHSEN_ANHALT: "Sachsen-Anhalt",
  SCHLESWIG_HOLSTEIN: "Schleswig-Holstein",
  THUERINGEN: "Thüringen",
}

function regionName(region: string): string {
  return REGION_NAMES[region.toUpperCase()] ?? region.replace(/_/g, " ")
}

/**
 * Format the first entry of `stellenlokationen` (`[{ adresse: {plz, ort, region} }]`)
 * as one location string. Search and detail use the same shape.
 */
function formatLocation(locations: unknown): string | null {
  const first = (Array.isArray(locations) ? locations[0] : null) as Record<string, unknown> | null
  const addr = (first?.adresse ?? null) as Record<string, unknown> | null
  if (!addr || typeof addr !== "object") return null
  const city = nullish(addr.ort)
  const plz = nullish(addr.plz)
  const rawRegion = nullish(addr.region)
  const region = rawRegion ? regionName(rawRegion) : null
  const parts: string[] = []
  if (plz && city) parts.push(`${plz} ${city}`)
  else if (city) parts.push(city)
  if (region && region.toLowerCase() !== city?.toLowerCase()) parts.push(region)
  return parts.length ? parts.join(", ") : null
}

/** Read `von` from a `{von, bis}` period object such as `eintrittszeitraum`. */
function periodStart(period: unknown): string | null {
  if (!period || typeof period !== "object") return null
  return nullish((period as Record<string, unknown>).von)
}

/**
 * Map one search hit to the portal-skill result contract. Every field the contract
 * requires is always present (null when unknown), never omitted.
 */
export function toJobCard(raw: Record<string, unknown>): JobCard | null {
  const id = nullish(raw.referenznummer)
  if (!id) return null
  return {
    id,
    title: nullish(raw.stellenangebotsTitel) ?? nullish(raw.hauptberuf) ?? "(ohne Titel)",
    company: nullish(raw.firma),
    location: formatLocation(raw.stellenlokationen),
    // The start of the current publication period - v6's counterpart of v4's
    // `aktuelleVeroeffentlichungsdatum`. Long-running ads are re-published, so
    // `datumErsteVeroeffentlichung` can be months older. Note `veroeffentlichtseit`
    // does not filter strictly on any date the API returns (see url-reference.md).
    date: periodStart(raw.veroeffentlichungszeitraum) ?? nullish(raw.datumErsteVeroeffentlichung),
    url: publicUrl(id),
    profession: nullish(raw.hauptberuf),
    externalUrl: nullish(raw.externeURL),
    startDate: periodStart(raw.eintrittszeitraum),
  }
}

/**
 * Map a detail response. Since v6, search uses the same field vocabulary as detail
 * (`stellenangebotsTitel`, `firma`, `stellenlokationen`, ...); detail adds the
 * description and contract fields - see url-reference.md for the full table.
 */
export function toJobDetail(raw: Record<string, unknown>, refnr: string): JobDetail {
  const salaryRaw = nullish(raw.verguetungsangabe)

  return {
    id: refnr,
    title: nullish(raw.stellenangebotsTitel) ?? nullish(raw.hauptberuf) ?? "(ohne Titel)",
    company: nullish(raw.firma),
    location: formatLocation(raw.stellenlokationen),
    date: nullish(raw.datumErsteVeroeffentlichung),
    url: publicUrl(refnr),
    profession: nullish(raw.hauptberuf),
    externalUrl: nullish(raw.allianzpartnerUrl),
    startDate: periodStart(raw.eintrittszeitraum),
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

/**
 * Home-office filter value, as the arbeitsagentur.de frontend sends it: postings
 * that state a home-office percentage (`prozentual_0` = any share) plus postings
 * offering home office by arrangement (`nv_true`). Semicolon-separated.
 */
export const HOMEOFFICE_ANY = "prozentual_0;nv_true"

/**
 * Map `--worktime` to its query parameter. Since v6, home office is its own
 * `homeoffice` parameter - the old `arbeitszeit=ho` code silently matches nothing.
 */
export function workTimeFilter(mode: string | undefined): [name: string, value: string] | null {
  switch ((mode || "").toLowerCase()) {
    case "remote":
    case "homeoffice":
    case "home-office":
      return ["homeoffice", HOMEOFFICE_ANY]
  }
  const code = workTimeCode(mode)
  return code ? ["arbeitszeit", code] : null
}

/** Working-time code (`arbeitszeit`); several codes would be semicolon-separated. */
export function workTimeCode(mode: string | undefined): string | null {
  switch ((mode || "").toLowerCase()) {
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
