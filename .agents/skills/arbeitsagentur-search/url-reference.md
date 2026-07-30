# Arbeitsagentur Jobbörse API — endpoint reference

Investigated 2026-07-30. This is the file to update if the API changes.

## Base

```
https://rest.arbeitsagentur.de/jobboerse/jobsuche-service
```

## Authentication

A single header on every request:

```
X-API-Key: jobboerse-jobsuche
```

This is the **public client key used by the arbeitsagentur.de web frontend itself**. It is
not a secret, is not tied to a user account, and requires no registration — but the API
returns `403` without it. There is no rate-limit documented; the CLI still backs off
exponentially on `429`/`5xx` as a matter of hygiene.

## Access and terms

- `https://www.arbeitsagentur.de/robots.txt` → `User-agent: *` / `Disallow:` / `Allow: /`
  — nothing is disallowed.
- `https://rest.arbeitsagentur.de/robots.txt` → `403` (the API host serves no robots.txt).
- This is a public API of a German federal agency serving public job listings. **No
  personal-use-only restriction applies**, in contrast to `linkedin-search`.

## Search

```
GET /pc/v4/jobs
```

| Parameter | Meaning | Notes |
|-----------|---------|-------|
| `was` | Keywords (what) | Job title, skill, employer |
| `wo` | Location (where) | City, postcode, region, or `Deutschland` |
| `umkreis` | Radius in km | Applies around `wo` |
| `veroeffentlichtseit` | Published within N **days** | Omit for any age |
| `angebotsart` | Offer type | `1` employment, `2` self-employed, `4` Ausbildung, `34` Praktikum |
| `arbeitszeit` | Working time | `vz` Vollzeit, `tz` Teilzeit, `ho` Homeoffice, `mj` Minijob, `snw` Schicht. Comma-separated |
| `page` | Page number | **1-indexed** |
| `size` | Results per page | Max 100 |

### Response

```json
{
  "stellenangebote": [ ... ],
  "maxErgebnisse": 487,
  "page": 1,
  "size": 25,
  "woOutput": { ... },
  "facetten": { ... }
}
```

`maxErgebnisse` is the total server-side match count, surfaced as `meta.total`.

### Per-result fields (`stellenangebote[]`)

| API field | Mapped to | Notes |
|-----------|-----------|-------|
| `refnr` | `id` | Reference number, e.g. `10001-1003435354-S` |
| `titel` | `title` | Falls back to `beruf` when absent |
| `beruf` | `profession` | Normalised occupation label |
| `arbeitgeber` | `company` | |
| `arbeitsort` | `location` | Object: `{plz, ort, strasse, region, land, koordinaten}` |
| `aktuelleVeroeffentlichungsdatum` | `date` | `YYYY-MM-DD` |
| `eintrittsdatum` | `startDate` | |
| `externeUrl` | `externalUrl` | Present only when the employer posts via a partner site |

**Quirk:** `arbeitsort.strasse` is sometimes the literal **string** `"null"`, not JSON
`null`. `nullish()` in `helpers.ts` normalises this.

## Detail

```
GET /pc/v4/jobdetails/{base64(refnr)}
```

The reference number must be **base64-encoded**:
`10000-1195268326-S` → `MTAwMDAtMTE5NTI2ODMyNi1T`

Verified endpoint behaviour:

| Path | Result |
|------|--------|
| `pc/v4/jobdetails/{base64}` | **200** — the working endpoint |
| `pc/v2/jobdetails/{base64}` | 403 |
| `pc/v2/jobdetails/{raw refnr}` | 403 |
| `pc/v1/jobdetails/{base64}` | 403 |
| `ed/v1/jobdetails/{base64}` | 403 |

**`403` means "not found"** on this endpoint (unknown or expired reference number), not an
auth failure — the key is always sent. The CLI maps `403`/`404` to `null` → `NOT_FOUND`.

### Detail fields — a different vocabulary from search

This is the biggest gotcha: the detail endpoint shares almost no field names with search.

| Detail field | Search equivalent | Mapped to |
|--------------|-------------------|-----------|
| `stellenangebotsTitel` | `titel` | `title` |
| `stellenangebotsBeschreibung` | — | `description` |
| `firma` | `arbeitgeber` | `company` |
| `hauptberuf` | `beruf` | `profession` |
| `stellenlokationen[].adresse` | `arbeitsort` | `location` |
| `datumErsteVeroeffentlichung` | `aktuelleVeroeffentlichungsdatum` | `date` |
| `eintrittszeitraum.von` | `eintrittsdatum` | `startDate` |
| `referenznummer` | `refnr` | `id` |
| `vertragsdauer` | — | `contractDuration` (`UNBEFRISTET` / `BEFRISTET`) |
| `arbeitszeitVollzeit` | — | `fullTime` (boolean) |
| `verguetungsangabe` | — | `salary` |
| `istPrivateArbeitsvermittlung` | — | `isPrivateAgency` (boolean) |
| `stellenangebotsart` | — | `employmentType` (`ARBEIT`, ...) |
| `allianzpartnerUrl` | `externeUrl` | `externalUrl` |

**Quirk:** `verguetungsangabe` is `"KEINE_ANGABEN"` when no salary is stated. Mapped to
`null` so the sentinel never surfaces as a salary.

**Quirk:** `stellenlokationen[].adresse.region` is SCREAMING_SNAKE
(`BADEN_WUERTTEMBERG`), whereas search returns it title-cased (`Baden-Württemberg`).

## Public job URL

```
https://www.arbeitsagentur.de/jobsuche/jobdetail/{refnr}
```

Used for the `url` field so results link to a human-viewable page rather than the API.
