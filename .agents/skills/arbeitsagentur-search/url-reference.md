# Arbeitsagentur Jobbörse API — endpoint reference

Investigated 2026-07-30. Search moved from v4 to v6 and was re-verified 2026-10-17 against the
live API and the arbeitsagentur.de frontend's own code. This is the file to update if the API
changes again.

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
GET /pc/v6/jobs
```

`/pc/v4/jobs` (used until 2026) now answers `403 No match found for request` - the API
gateway's reply for a path it no longer routes, with or without the key. The v6 result
list and its field names differ from v4; see below.

| Parameter | Meaning | Notes |
|-----------|---------|-------|
| `was` | Keywords (what) | Job title, skill, employer |
| `wo` | Location (where) | City, postcode, region, or `Deutschland` |
| `umkreis` | Radius in km | Applies around `wo` |
| `veroeffentlichtseit` | Published within N **days** | Omit for any age. Approximate: it narrows the set, but does not match any date the API returns exactly (a 30-day search still returns some postings whose every date is older) |
| `angebotsart` | Offer type | `1` employment, `2` self-employed, `4` Ausbildung, `34` Praktikum |
| `arbeitszeit` | Working time | `vz` Vollzeit, `tz` Teilzeit, `mj` Minijob, `snw` Schicht. Several values are semicolon-separated. `ho` is still in the community spec but matches nothing on v6 |
| `homeoffice` | Home office | `prozentual_0;nv_true` = any stated home-office share plus home office by arrangement, as the arbeitsagentur.de frontend sends it. `--worktime remote` maps here. A bare `nv_true` is rejected with `400` |
| `page` | Page number | **1-indexed** |
| `size` | Results per page | Max 100 |

### Response

```json
{
  "ergebnisliste": [ ... ],
  "maxErgebnisse": 487,
  "page": 1,
  "size": 25,
  "woOutput": { ... },
  "facetten": { ... }
}
```

`maxErgebnisse` is the total server-side match count, surfaced as `meta.total`.

### Per-result fields (`ergebnisliste[]`)

Since v6, search uses the same field vocabulary as the detail endpoint.

| API field | Mapped to | Notes |
|-----------|-----------|-------|
| `referenznummer` | `id` | Reference number, e.g. `10001-1003435354-S` (v4: `refnr`) |
| `stellenangebotsTitel` | `title` | Falls back to `hauptberuf` when absent (v4: `titel`) |
| `hauptberuf` | `profession` | Normalised occupation label (v4: `beruf`) |
| `firma` | `company` | (v4: `arbeitgeber`) |
| `stellenlokationen[0].adresse` | `location` | List of `{adresse: {plz, ort, region, land, ...}, breite, laenge}`; most postings have one, some up to 8. The CLI uses the first (v4: `arbeitsort`) |
| `veroeffentlichungszeitraum.von` | `date` | `YYYY-MM-DD`, start of the current publication period. Falls back to `datumErsteVeroeffentlichung`, which can be months older for re-published ads (v4: `aktuelleVeroeffentlichungsdatum`) |
| `eintrittszeitraum.von` | `startDate` | (v4: `eintrittsdatum`) |
| `externeURL` | `externalUrl` | Present only when the employer posts via a partner site. Capital `URL` (v4: `externeUrl`) |
| `vertragsdauer` | `contractDuration` | `UNBEFRISTET` / `BEFRISTET`; the `KEINE_ANGABE` sentinel becomes `null` |

Other fields seen on v6 hits: `stellenangebotsart`, `verguetungsangabe`, `gehaltsspanneVon`/`gehaltsspanneBis`,
`arbeitszeitVollzeit` and the other `arbeitszeit*` booleans, `homeofficemoeglich`,
`homeofficetyp`, `homeofficeprozent`, `datumErsteVeroeffentlichung`, `aenderungsdatum`,
`alleBerufe`, `arbeitgeberKundennummerHash`, `chiffrenummer`, `entfernung`.

**Quirk:** `region` is SCREAMING_SNAKE (`NORDRHEIN_WESTFALEN`). The CLI writes the 16
federal states by name (`Nordrhein-Westfalen`) and only drops the underscores from anything
else.

**Quirk:** address parts have been sent as the literal **string** `"null"`, not JSON `null`.
`nullish()` in `helpers.ts` normalises this.

**Quirk:** results of equal rank come back in a different order on every request, even with
identical parameters. Fetching page 2 separately can therefore repeat or skip a few
postings at the page boundary; `/scrape` deduplicates by `id`.

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

An unknown or expired reference number returns **`404`** (re-verified 2026-10-17; in July the
API answered `403` here). The CLI maps `404` to `null` → `NOT_FOUND`, and treats `403` as an
error: the gateway sends it when it refuses a request or no longer routes a path, which is how
the v4 search shutdown showed up. The `403` rows in the table above date from July.

### Detail fields

Until v4 this endpoint shared almost no field names with search; since v6, search uses the
same vocabulary. Detail-specific mappings:

| Detail field | Mapped to |
|--------------|-----------|
| `stellenangebotsTitel` | `title` |
| `stellenangebotsBeschreibung` | `description` |
| `firma` | `company` |
| `hauptberuf` | `profession` |
| `stellenlokationen[0].adresse` | `location` |
| `datumErsteVeroeffentlichung` | `date` (first publication; search uses the current publication period) |
| `eintrittszeitraum.von` | `startDate` |
| `vertragsdauer` | `contractDuration` (`UNBEFRISTET` / `BEFRISTET`; `KEINE_ANGABE` → `null`) |
| `arbeitszeitVollzeit` | `fullTime` (boolean) |
| `verguetungsangabe` | `salary` |
| `istPrivateArbeitsvermittlung` | `isPrivateAgency` (boolean) |
| `stellenangebotsart` | `employmentType` (`ARBEIT`, ...) |
| `allianzpartnerUrl` | `externalUrl` (search: `externeURL`) |

**Quirk:** `verguetungsangabe` is `"KEINE_ANGABEN"` when no salary is stated. Mapped to
`null` so the sentinel never surfaces as a salary.

**Quirk:** `stellenlokationen[].adresse.region` is SCREAMING_SNAKE (`BADEN_WUERTTEMBERG`),
as in search; the CLI maps it the same way (`Baden-Württemberg`).

## Public job URL

```
https://www.arbeitsagentur.de/jobsuche/jobdetail/{refnr}
```

Used for the `url` field so results link to a human-viewable page rather than the API.
