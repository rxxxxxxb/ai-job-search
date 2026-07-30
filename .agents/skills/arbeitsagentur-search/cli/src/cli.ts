#!/usr/bin/env bun
// Self-contained CLI for the Bundesagentur für Arbeit (German Federal Employment
// Agency) public "Jobbörse" REST API. No external CLI framework and no runtime
// dependencies, so it runs anywhere `bun` is available with nothing installed
// beyond the repo clone.
//
// The API is the official public backend of arbeitsagentur.de/jobsuche and is
// served over a documented REST interface with a public client key - there is no
// scraping, no authentication, and no ToS restriction on personal use.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    n: "limit",
    r: "radius",
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `arbeitsagentur-cli — search jobs on the German Federal Employment Agency job board

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <refnr|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, or role). e.g. "Machine Learning"
  --location, -l <text>   City, postcode, region, or "Deutschland" for nationwide.
  --radius, -r <km>       Search radius around --location, in km. e.g. 50
  --jobage <days>         Posted within N days. Default: all.
  --worktime <mode>       remote | vollzeit | teilzeit | minijob | schicht
  --offer-type <kind>     employment (default) | ausbildung | praktikum | selbstaendig
  --page <n>              1-indexed page. Default 1.
  --size <n>              Results requested per page (server-side). Default 25.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "Machine Learning Engineer" -l Deutschland --jobage 14 --format table
  bun run src/cli.ts search -q "Medical Imaging" -l Deutschland --format table
  bun run src/cli.ts search -q "Computer Vision" -l Kiel -r 50 --format table
  bun run src/cli.ts search -q "MLOps" -l München --worktime remote --format table
  bun run src/cli.ts search -q "Data Scientist" -l Hamburg --jobage 7 --limit 10
  bun run src/cli.ts detail 10000-1195268326-S --format plain

Official public API of the Bundesagentur für Arbeit — no authentication required.
`

const VALID_WORKTIME = [
  "remote",
  "homeoffice",
  "home-office",
  "vollzeit",
  "fulltime",
  "full-time",
  "teilzeit",
  "parttime",
  "part-time",
  "minijob",
  "schicht",
  "shift",
]

const VALID_OFFER_TYPE = [
  "employment",
  "arbeit",
  "ausbildung",
  "training",
  "praktikum",
  "internship",
  "selbstaendig",
  "self-employed",
]

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query : undefined
    const location = typeof flags.location === "string" ? flags.location : undefined

    // The API accepts a bare location or a bare keyword, but an empty search
    // returns an unbounded firehose - require at least one of them.
    if (!query && !location) {
      process.stderr.write(
        JSON.stringify({
          error:
            'at least one of --query/-q or --location/-l is required (e.g. -q "Machine Learning" -l Deutschland)',
          code: "NO_CRITERIA",
        }) + "\n",
      )
      return 1
    }

    const parseIntFlag = (name: string, raw: string | boolean | string[]): number | null => {
      const val = parseInt(raw as string, 10)
      if (isNaN(val)) {
        process.stderr.write(
          JSON.stringify({ error: `--${name} must be a number, got "${raw}"`, code: "BAD_ARG" }) + "\n",
        )
        return null
      }
      return val
    }

    for (const name of ["jobage", "page", "limit", "size", "radius"]) {
      if (flags[name] !== undefined) {
        const v = parseIntFlag(name, flags[name])
        if (v === null) return 1
        flags[name] = String(v)
      }
    }

    const worktime = typeof flags.worktime === "string" ? flags.worktime : undefined
    if (worktime && !VALID_WORKTIME.includes(worktime.toLowerCase())) {
      process.stderr.write(
        JSON.stringify({
          error: `--worktime must be one of: ${VALID_WORKTIME.join(", ")}; got "${worktime}"`,
          code: "BAD_ARG",
        }) + "\n",
      )
      return 1
    }

    const offerType = typeof flags["offer-type"] === "string" ? (flags["offer-type"] as string) : undefined
    if (offerType && !VALID_OFFER_TYPE.includes(offerType.toLowerCase())) {
      process.stderr.write(
        JSON.stringify({
          error: `--offer-type must be one of: ${VALID_OFFER_TYPE.join(", ")}; got "${offerType}"`,
          code: "BAD_ARG",
        }) + "\n",
      )
      return 1
    }

    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query,
      location,
      radius: flags.radius ? parseInt(flags.radius as string, 10) : undefined,
      jobage: flags.jobage ? parseInt(flags.jobage as string, 10) : 9999,
      worktime,
      offerType,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      size: flags.size ? Math.max(1, Math.min(100, parseInt(flags.size as string, 10))) : 25,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires a <refnr|url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
