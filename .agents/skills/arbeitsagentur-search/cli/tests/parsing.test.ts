import { describe, expect, test } from "bun:test"
import {
  toJobCard,
  toJobDetail,
  encodeRefnr,
  publicUrl,
  workTimeCode,
  offerTypeCode,
} from "../src/helpers.js"
import { buildUrl } from "../src/commands/search.js"
import { extractRefnr } from "../src/commands/detail.js"

// A real search hit, trimmed. Note `strasse: "null"` — the API emits the literal
// string "null" for a missing street, which must not leak into output.
const SEARCH_HIT = {
  beruf: "Machine Learning Engineer",
  titel: "Software-Entwickler Machine Learning (m/w/d)",
  refnr: "12117-YF-44420-YF-S",
  arbeitsort: {
    plz: "87600",
    ort: "Kaufbeuren",
    strasse: "null",
    region: "Bayern",
    land: "Deutschland",
  },
  arbeitgeber: "ATCSIM GmbH",
  aktuelleVeroeffentlichungsdatum: "2026-07-20",
  eintrittsdatum: "2026-07-20",
  externeUrl: "https://www.yourfirm.de/job/detail/YF-44420/",
}

describe("toJobCard", () => {
  test("maps every contract field from a real hit", () => {
    const c = toJobCard(SEARCH_HIT)!
    expect(c.id).toBe("12117-YF-44420-YF-S")
    expect(c.title).toBe("Software-Entwickler Machine Learning (m/w/d)")
    expect(c.company).toBe("ATCSIM GmbH")
    expect(c.location).toBe("87600 Kaufbeuren, Bayern")
    expect(c.date).toBe("2026-07-20")
    expect(c.url).toContain("arbeitsagentur.de/jobsuche/jobdetail/")
  })

  test("returns null when the reference number is missing", () => {
    expect(toJobCard({ titel: "x" })).toBeNull()
  })

  test("falls back to beruf when titel is absent", () => {
    const c = toJobCard({ refnr: "A-1", beruf: "Data Scientist" })!
    expect(c.title).toBe("Data Scientist")
  })

  test('treats the literal string "null" as a missing value', () => {
    const c = toJobCard({
      refnr: "A-1",
      titel: "T",
      arbeitgeber: "null",
      arbeitsort: { ort: "null", region: "null" },
    })!
    expect(c.company).toBeNull()
    expect(c.location).toBeNull()
  })

  test("emits required keys even when values are unknown", () => {
    const c = toJobCard({ refnr: "A-1" })!
    for (const k of ["id", "title", "company", "location", "date", "url"]) {
      expect(Object.keys(c)).toContain(k)
    }
  })

  test("does not repeat the region when it equals the city", () => {
    const c = toJobCard({
      refnr: "A-1",
      titel: "T",
      arbeitsort: { ort: "Hamburg", region: "Hamburg", plz: "20095" },
    })!
    expect(c.location).toBe("20095 Hamburg")
  })
})

describe("toJobDetail", () => {
  const DETAIL = {
    stellenangebotsTitel: "Machine Learning Engineer (m/w/d)",
    stellenangebotsBeschreibung: "Wir suchen einen erfahrenen Machine Learning Engineer.",
    firma: "OPTUM GmbH",
    hauptberuf: "Machine Learning Engineer",
    verguetungsangabe: "KEINE_ANGABEN",
    vertragsdauer: "UNBEFRISTET",
    arbeitszeitVollzeit: true,
    istPrivateArbeitsvermittlung: true,
    datumErsteVeroeffentlichung: "2025-01-22",
    eintrittszeitraum: { von: "2026-05-26" },
    stellenlokationen: [
      { adresse: { plz: "74074", ort: "Heilbronn, Neckar", region: "BADEN_WUERTTEMBERG" } },
    ],
    referenznummer: "10000-1195268326-S",
  }

  test("maps the detail vocabulary, which differs from search", () => {
    const d = toJobDetail(DETAIL, "10000-1195268326-S")
    expect(d.title).toBe("Machine Learning Engineer (m/w/d)")
    expect(d.company).toBe("OPTUM GmbH")
    expect(d.description).toContain("Machine Learning Engineer")
    expect(d.contractDuration).toBe("UNBEFRISTET")
    expect(d.fullTime).toBe(true)
    expect(d.isPrivateAgency).toBe(true)
  })

  test('maps the KEINE_ANGABEN salary sentinel to null, not through', () => {
    const d = toJobDetail(DETAIL, "x")
    expect(d.salary).toBeNull()
  })

  test("passes a real salary string through", () => {
    const d = toJobDetail({ ...DETAIL, verguetungsangabe: "60.000 - 70.000 EUR" }, "x")
    expect(d.salary).toBe("60.000 - 70.000 EUR")
  })

  test("humanises the SCREAMING_SNAKE region", () => {
    const d = toJobDetail(DETAIL, "x")
    expect(d.location).toBe("74074 Heilbronn, Neckar, BADEN WUERTTEMBERG")
  })

  test("survives a posting with no location block", () => {
    const d = toJobDetail({ stellenangebotsTitel: "T" }, "x")
    expect(d.location).toBeNull()
    expect(d.title).toBe("T")
  })
})

describe("encodeRefnr / extractRefnr", () => {
  test("base64-encodes the reference number as the detail endpoint expects", () => {
    expect(encodeRefnr("10000-1195268326-S")).toBe("MTAwMDAtMTE5NTI2ODMyNi1T")
  })

  test("pulls the reference number out of a pasted job URL", () => {
    expect(extractRefnr("https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1195268326-S")).toBe(
      "10000-1195268326-S",
    )
  })

  test("passes a bare reference number through unchanged", () => {
    expect(extractRefnr("  10000-1195268326-S  ")).toBe("10000-1195268326-S")
  })

  test("round-trips a refnr through publicUrl and back", () => {
    const ref = "12634-BB-643701-7878-9180-S"
    expect(extractRefnr(publicUrl(ref))).toBe(ref)
  })
})

describe("buildUrl", () => {
  const base = { jobage: 9999, page: 1, size: 25, format: "json" as const }

  test("maps query and location to was/wo", () => {
    const u = new URL(buildUrl({ ...base, query: "Machine Learning", location: "Kiel" }))
    expect(u.searchParams.get("was")).toBe("Machine Learning")
    expect(u.searchParams.get("wo")).toBe("Kiel")
  })

  test("omits veroeffentlichtseit when jobage is unset", () => {
    const u = new URL(buildUrl({ ...base, query: "x" }))
    expect(u.searchParams.has("veroeffentlichtseit")).toBe(false)
  })

  test("sets veroeffentlichtseit from jobage", () => {
    const u = new URL(buildUrl({ ...base, query: "x", jobage: 14 }))
    expect(u.searchParams.get("veroeffentlichtseit")).toBe("14")
  })

  test("defaults angebotsart to regular employment", () => {
    const u = new URL(buildUrl({ ...base, query: "x" }))
    expect(u.searchParams.get("angebotsart")).toBe("1")
  })

  test("passes the radius through as umkreis", () => {
    const u = new URL(buildUrl({ ...base, query: "x", location: "Kiel", radius: 50 }))
    expect(u.searchParams.get("umkreis")).toBe("50")
  })
})

describe("code mappings", () => {
  test("maps remote to the home-office working-time code", () => {
    expect(workTimeCode("remote")).toBe("ho")
    expect(workTimeCode("teilzeit")).toBe("tz")
    expect(workTimeCode(undefined)).toBeNull()
    expect(workTimeCode("nonsense")).toBeNull()
  })

  test("maps offer types, defaulting to employment", () => {
    expect(offerTypeCode(undefined)).toBe("1")
    expect(offerTypeCode("ausbildung")).toBe("4")
    expect(offerTypeCode("praktikum")).toBe("34")
  })
})
