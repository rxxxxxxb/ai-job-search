---
name: arbeitsagentur-search
version: 1.0.0
description: >
  Make sure to use this skill whenever the user mentions anything related to job
  searching in Germany, German job listings, vacancies in German cities or regions,
  or the German federal employment agency job board — even if they don't mention
  arbeitsagentur.de or the Jobbörse explicitly. This skill covers the official public
  job portal of the Bundesagentur für Arbeit, which carries roughly a million active
  listings across every sector, including public-sector, Mittelstand, and apprenticeship
  positions that never reach LinkedIn. Also invoke for questions about specific German
  job titles, employers, apprenticeships, or regions in an employment context.
  Trigger phrases include: german jobs, jobs in germany, job search germany, german job
  listings, arbeitsagentur, arbeitsagentur.de, jobbörse, jobboerse, bundesagentur für
  arbeit, agentur für arbeit, stellenangebote, stellenanzeigen, stellensuche, jobsuche,
  arbeit finden, job finden, offene stellen, freie stellen, vakanzen, bewerbung,
  ausbildungsplatz, ausbildung, praktikum, duales studium, minijob, teilzeit, vollzeit,
  festanstellung, befristet, unbefristet, homeoffice, jobs in berlin, jobs in münchen,
  jobs in hamburg, jobs in kiel, jobs in köln, jobs in frankfurt, jobs in stuttgart,
  jobs in erlangen, jobs in heidelberg, stellenangebote informatik, ingenieur jobs,
  machine learning jobs germany, data scientist germany, softwareentwickler stellen,
  wissenschaftlicher mitarbeiter, jobs deutschland.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts *)
---

# Arbeitsagentur-Search Skill

Access live German job listings from the **Bundesagentur für Arbeit** ("Jobbörse") public
REST API. No authentication needed.

The Bundesagentur für Arbeit is Germany's federal employment agency, and its Jobbörse is
the country's largest job board — roughly a million active listings at any time. Coverage
is far broader than commercial boards: alongside private-sector roles it carries public
sector and university-clinic positions, Mittelstand employers who never post to LinkedIn,
apprenticeships (`Ausbildung`), and dual-study places.

**This is a documented JSON API, not a scraper.** It is the same backend the public
`arbeitsagentur.de/jobsuche` frontend calls. There is no HTML parsing, so a site restyle
cannot break it, and `robots.txt` on `www.arbeitsagentur.de` permits access (`Allow: /`).
No personal-use restriction applies — unlike `linkedin-search`.

## Commands

### `search`

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search [flags]
```

| Flag | Description |
|------|-------------|
| `--query`, `-q` | Keywords: job title, skill, or role. e.g. `"Machine Learning Engineer"` |
| `--location`, `-l` | City, postcode, region, or `Deutschland` for nationwide |
| `--radius`, `-r` | Radius around `--location` in km. e.g. `50` |
| `--jobage` | Posted within N days (the API applies this approximately). Default: all ages |
| `--worktime` | `remote` \| `vollzeit` \| `teilzeit` \| `minijob` \| `schicht` |
| `--offer-type` | `employment` (default) \| `ausbildung` \| `praktikum` \| `selbstaendig` |
| `--page` | 1-indexed page. Default `1` |
| `--size` | Results per page requested server-side (max 100). Default `25` |
| `--limit`, `-n` | Cap results emitted (client-side) |
| `--format` | `json` (default) \| `table` \| `plain` |

At least one of `--query` or `--location` is required — an unqualified search returns an
unbounded firehose.

### `detail`

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts detail <refnr|url> [--format json|plain]
```

Accepts either a bare reference number (`10001-1003435354-S`) or a full
`arbeitsagentur.de/jobsuche/jobdetail/...` URL pasted from a browser.

## Examples

```bash
# Nationwide ML engineering roles from the last two weeks
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search \
  -q "Machine Learning Engineer" -l Deutschland --jobage 14 --format table

# Medical imaging AI — the niche, so search nationwide, never city-limited
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search \
  -q "Medical Imaging" -l Deutschland --format table

# Within commuting distance of Kiel
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search \
  -q "Computer Vision" -l Kiel -r 50 --format table

# Remote-friendly MLOps roles
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search \
  -q "MLOps" -l Deutschland --worktime remote --format table

# Research positions at universities and institutes
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search \
  -q "wissenschaftlicher Mitarbeiter Machine Learning" -l Deutschland --format table

# Full description of one posting
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts detail 10001-1003435354-S --format plain
```

## Output

`search --format json` returns:

```json
{
  "meta": { "count": 8, "page": 1, "total": 124 },
  "results": [
    {
      "id": "10001-1003435354-S",
      "title": "AI Engineer (m/w/d) – Machine Learning & Data Science",
      "company": "Brillux GmbH & Co.KG",
      "location": "48163 Münster, Westfalen, Nordrhein-Westfalen",
      "date": "2026-07-23",
      "url": "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003435354-S",
      "profession": "Data Scientist",
      "externalUrl": null,
      "startDate": "2026-07-28",
      "contractDuration": "UNBEFRISTET"
    }
  ]
}
```

`meta.total` is the server-side total match count, not the number returned — useful for
judging whether a query is too broad. Missing values are `null`, never omitted.
`contractDuration` is `UNBEFRISTET` (permanent), `BEFRISTET` (fixed-term) or `null` when the
posting does not say - roughly 40% of postings in a sample of 100.

Errors go to **stderr** as `{"error": "...", "code": "..."}` with exit code `1`.

## Notes

- **Listings are overwhelmingly in German.** Titles routinely carry the `(m/w/d)` gender
  suffix. Search in German for best recall (`Softwareentwickler`, `wissenschaftlicher
  Mitarbeiter`), though English terms like "Machine Learning" and "Data Scientist" are
  common in tech postings.
- **`ANÜ` in a title means `Arbeitnehmerüberlassung`** — temporary staffing / labour
  leasing, not a direct hire. The `isPrivateAgency` field on `detail` (`true`) flags
  postings listed via a private recruitment agency rather than the employer.
- **Search runs on the API's v6 endpoint, detail on v4.** Since v6, search uses the same
  field names as detail (`stellenangebotsTitel`, `firma`, `stellenlokationen`); v4 search
  is switched off. The mapping is documented in `url-reference.md`.
- **Detail is keyed by base64 of the reference number.** The raw refnr returns 404 on the
  detail endpoint; the CLI handles the encoding.
- **404 means "not found"**: an unknown or expired reference number. The CLI maps it to a
  `NOT_FOUND` error rather than a crash.
- **403 is an error, never "no results".** The API gateway sends it when it refuses a
  request or no longer serves a path; the CLI exits 1 with the status text. Likewise, a
  response that reports matches but carries no readable result list exits 1 instead of
  printing an empty list, so an API change cannot pass for a quiet day.
- **`verguetungsangabe: "KEINE_ANGABEN"`** is the API's "salary not stated" sentinel. The
  CLI maps it to `null` rather than passing the sentinel through.
- **The literal string `"null"`** appears in place of missing address parts. The CLI
  treats it as a missing value.
- Salary is stated on only a minority of postings — German listings often omit it.
