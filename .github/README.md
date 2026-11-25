<p align="center">
  <img src="../assets/readme/hero.svg" alt="AI Job Search. Pip the courier bird carries an application along a flight path to its destination. The job search that runs on your machine." width="100%">
</p>

<p align="center">
  <a href="https://github.com/rxxxxxxb/ai-job-search/actions/workflows/ci.yml"><img src="https://github.com/rxxxxxxb/ai-job-search/actions/workflows/ci.yml/badge.svg" alt="CI" height="20"></a>
  &nbsp;
  <a href="https://github.com/ai-job-search-dev/ai-job-search/releases/tag/v2.1.0"><img src="https://img.shields.io/badge/upstream-v2.1.0-2A9D8F?style=flat" alt="Based on upstream release v2.1.0" height="20"></a>
  &nbsp;
  <a href="https://claude.com/claude-code"><img src="https://img.shields.io/badge/built_on-Claude_Code-2A9D8F?style=flat" alt="Built on Claude Code" height="20"></a>
  &nbsp;
  <a href="/LICENSE"><img src="https://img.shields.io/badge/license-MIT-2A9D8F?style=flat" alt="MIT license" height="20"></a>
</p>

<h3 align="center">German job market fork</h3>

<p align="center">
  A fork of <a href="https://github.com/ai-job-search-dev/ai-job-search">ai-job-search-dev/ai-job-search</a>, the Claude Code framework that<br>
  evaluates job postings, tailors LaTeX CVs and cover letters, and prepares you for interviews.<br>
  This fork adds a search tool for Germany's federal job board<br>
  and keeps all personal data out of the public repository.
</p>

<p align="center">
  <a href="#search-germanys-federal-job-board"><b>Job board search</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#personal-data-stays-out-of-git"><b>Personal data</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#build-a-cv-or-cover-letter-with-one-command"><b>One-command builds</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#setting-up"><b>Setting up</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="/README.md"><b>Upstream README</b></a>
</p>

> [!NOTE]
> The framework, its commands and the full setup guide are the upstream project's work. They are documented in the [upstream README](/README.md), which this fork keeps unchanged. This page covers what the fork adds. The fork is independent and is not affiliated with the upstream maintainers or with Anthropic.

## Search Germany's federal job board

<p align="center">
  <img src="readme/arbeitsagentur.svg" alt="/scrape sends plain search terms to arbeitsagentur-search, which queries the Jobbörse of the Bundesagentur für Arbeit through its REST API v6. Each result is marked UNBEFRISTET (permanent) or BEFRISTET (fixed-term) when the posting says so." width="100%">
</p>

`arbeitsagentur-search` queries the Jobbörse of the Bundesagentur für Arbeit (Federal Employment Agency) through its public REST API. `/scrape` picks it up automatically, like any portal tool under `.agents/skills/`.

- Search by keyword, place, radius, posting age, working time and offer type, and fetch the full text of any posting.
- Each result says whether the contract is permanent (`UNBEFRISTET`) or fixed-term (`BEFRISTET`), when the posting states it.
- `--worktime remote` returns only postings that offer home office.
- Several words must all appear, in any order. Quotes force an exact phrase and can cost every match (`"medizinische Bildverarbeitung"`: 0 postings, unquoted: 12), so `/scrape` passes its terms unquoted.
- If the API refuses a request or changes its response format, the tool exits with an error instead of printing an empty list. The agency moved search from API v4 to v6 in 2026; the tool uses v6.

```bash
bun run .agents/skills/arbeitsagentur-search/cli/src/cli.ts search \
  -q "Machine Learning" -l Deutschland --jobage 14 --format table
```

Flags and output format: [SKILL.md](/.agents/skills/arbeitsagentur-search/SKILL.md). API notes, including the field changes from v4 to v6 and the query-syntax measurements: [url-reference.md](/.agents/skills/arbeitsagentur-search/url-reference.md).

## Personal data stays out of git

<p align="center">
  <img src="readme/private-data.svg" alt="On your machine, the personal files (profile, CVs and letters, applications, tracker, search queries, company research) are listed in the fork's .gitignore and never committed. Only the framework, its tests and the Arbeitsagentur search reach the public fork on GitHub." width="100%">
</p>

A fork of a public repository is public, and `/setup` writes names, contact details, work history and self-assessment notes into the profile files. In this fork those files stay on disk but outside git:

- `CLAUDE.md`, `search-queries.md` and the profile files `01` to `07` of the job-application-assistant skill are listed in the FORK-LOCAL block at the end of [.gitignore](/.gitignore).
- The personalised CV is `cv/main_profile.tex`, which is ignored. `cv/main_example.tex` stays the placeholder that CI compiles.
- Applications, archived postings, the tracker and company research are ignored, as in upstream.
- Tests that read the untracked methodology files skip when a file is missing from the checkout ([tests/_local_files.py](/tests/_local_files.py)). They still run locally, and CI passes without the files.

## Build a CV or cover letter with one command

[build_doc.sh](/build_doc.sh) picks the LaTeX engine a document needs (lualatex for moderncv, xelatex for `cover.cls`, pdflatex otherwise), compiles it twice, deletes the intermediate files and checks the page count: one page for files whose name starts with `cover_`, two for the rest.

```bash
./build_doc.sh documents/applications/<company>_<role>/cv_<slug>.tex
```

Each application keeps its LaTeX sources, PDFs and the archived posting together in its own folder under `documents/applications/`.

## Setting up

Follow the [upstream quick start](/README.md#quick-start). Three things differ:

- Since v2.0.0, upstream ships no job-board tools; they live in [community-portals](https://github.com/ai-job-search-dev/community-portals). This fork tracks only its own `arbeitsagentur-search`, which needs [Bun](https://bun.sh) and has no runtime dependencies. For LinkedIn and freehire.me, copy `portals/global/linkedin-search` and `portals/global/freehire-search` from community-portals into `.agents/skills/`, read their code, and run `python3 tools/install_portal_clis.py`. The fork's `.gitignore` keeps those two copies out of git.
- To let `/scrape` run the portal tools without asking on every call, add one `Bash(bun run .agents/skills/<name>/cli/src/cli.ts:*)` rule per portal to `.claude/settings.local.json`, which git ignores. Upstream's way, an entry in `.claude/settings.json` plus `ALLOWED_PERMISSIONS` in `tools/security_guards.py`, would change two tracked framework files for tools this fork does not track.
- Don't update from upstream with a plain `git pull`. Git treats ignored files as disposable, so a merge that touches the profile files replaces your copies with upstream's blank templates. Back them up, merge a release tag on a separate branch, and restore them, still untracked, before committing. `python3 tools/check_upstream_updates.py` then lists the method changes to copy into your own versions by hand.

## Credits and license

The framework is by [Mads Lorentzen](https://github.com/MadsLorentzen) and its contributors, now maintained in the [ai-job-search-dev](https://github.com/ai-job-search-dev) organization and released under the [MIT License](/LICENSE); see the [upstream acknowledgements](/README.md#acknowledgements). The header artwork and Pip come from the upstream project; the two diagrams on this page are the fork's own, drawn in the same style. This fork's changes are released under the same license. Built with [Claude Code](https://claude.com/claude-code).

<p align="center">
  <img src="../assets/mascot/pip_flight_loop.gif" alt="Pip, the courier bird" width="120"><br>
  <sub>Pip delivers. Viel Erfolg!</sub>
</p>
