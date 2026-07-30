# arbeitsagentur-cli

CLI for the **Bundesagentur für Arbeit** ("Jobbörse") public REST API — Germany's federal
employment agency job board, and the country's largest source of job listings (~1M active
postings).

Zero runtime dependencies: plain `bun` + `fetch` against a JSON API. `bun install` pulls
only TypeScript dev types.

## Install

```bash
cd .agents/skills/arbeitsagentur-search/cli && bun install
```

Optional — the CLI runs without it, since there are no runtime dependencies.

## Usage

```bash
# Nationwide, last 14 days
bun run src/cli.ts search -q "Machine Learning Engineer" -l Deutschland --jobage 14 --format table

# Within 50 km of a city
bun run src/cli.ts search -q "Computer Vision" -l Kiel -r 50 --format table

# Remote-friendly
bun run src/cli.ts search -q "MLOps" -l Deutschland --worktime remote --format table

# Apprenticeships instead of employment
bun run src/cli.ts search -q Fachinformatiker -l Hamburg --offer-type ausbildung --format table

# Full posting text
bun run src/cli.ts detail 10001-1003435354-S --format plain
```

Run without arguments for the full flag reference.

## Output contract

- `search` → `{ "meta": { "count", "page", "total" }, "results": [...] }` on stdout.
  Each result always carries `id`, `title`, `company`, `location`, `date`, `url`
  (`null` when unknown, never omitted).
- `detail` → a single object with those fields plus `description`, `contractDuration`,
  `fullTime`, `salary`, `isPrivateAgency`.
- Errors → `{ "error": "...", "code": "..." }` on **stderr**, exit code `1`.
  Never on stdout.

## Tests

```bash
bun run typecheck
bun test
```

36 tests: pure-function parsing tests against captured API fixtures, CLI flag-validation
tests, and a small set of live smoke tests against the real API (a handful of requests,
never a crawl).

## Why an API and not a scraper

This is the documented JSON backend of `arbeitsagentur.de/jobsuche`, so there is no HTML
parsing and a site restyle cannot break it. `robots.txt` permits access and no
personal-use restriction applies. Endpoint details, field mappings, and the API's quirks
are recorded in `../url-reference.md`.
