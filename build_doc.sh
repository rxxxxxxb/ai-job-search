#!/usr/bin/env bash
# Compile one CV or cover letter and check it came out the right length.
#
#   ./build_doc.sh documents/applications/<company>_<role>/cv_<slug>.tex
#   ./build_doc.sh documents/applications/<company>_<role>/cover_<slug>.tex
#   ./build_doc.sh --open documents/applications/<company>_<role>/cv_<slug>.tex   # open the PDF after
#
# Picks the engine automatically. Engine choice is NOT cosmetic here:
#   * mteck/article CVs (old_resume style) need pdflatex  — they use \pdfgentounicode,
#     a pdfTeX primitive LuaTeX does not have, and it is what makes the PDF ATS-readable.
#   * moderncv documents need lualatex — pdflatex dies with a font-expansion error.
# Runs twice, because lastpage/hyperref need a second pass to settle page numbers.

set -euo pipefail

OPEN=0
if [[ "${1:-}" == "--open" ]]; then OPEN=1; shift; fi

if [[ $# -ne 1 ]]; then
  echo "usage: $0 [--open] <file.tex>" >&2
  exit 2
fi

SRC="$1"
[[ -f "$SRC" ]] || { echo "no such file: $SRC" >&2; exit 2; }

DIR="$(cd "$(dirname "$SRC")" && pwd)"
BASE="$(basename "$SRC" .tex)"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Prefer whatever is on PATH; fall back to the MacTeX location.
if ! command -v pdflatex >/dev/null 2>&1; then
  export PATH="/Library/TeX/texbin:$PATH"
fi

# Per-position sources live in documents/applications/<slug>/, away from the shared
# template files. Point TeX at the repo's template dirs so cover.cls and friends
# still resolve from wherever the source now sits. Trailing "//" = search recursively,
# trailing ":" = also search the normal system paths.
export TEXINPUTS=".:${REPO}/cover_letters//:${REPO}/cv//:${REPO}//:"

# cover.cls / fontspec -> xelatex; moderncv -> lualatex; everything else -> pdflatex.
if grep -qE 'documentclass(\[[^]]*\])?\{cover\}|usepackage\{fontspec\}' "$SRC"; then
  ENGINE=xelatex
elif grep -q 'documentclass.*moderncv' "$SRC"; then
  ENGINE=lualatex
else
  ENGINE=pdflatex
fi

# Expected page count: cover letters are 1 page, CVs are 2. Keyed on the FILENAME,
# not the directory, because per-position sources now sit together in one folder.
case "$BASE" in
  cover_*|Cover_*) WANT=1 ;;
  *)              WANT=2 ;;
esac

cd "$DIR"

# cover.cls loads Lato/Raleway via `Path = OpenFonts/fonts/...`, which fontspec resolves
# relative to the working directory — not through TEXINPUTS. When the source lives in a
# per-position folder, drop in a symlink so that relative path still lands.
if grep -q 'OpenFonts/' "$BASE.tex" && [[ ! -e OpenFonts ]]; then
  ln -s "$REPO/cover_letters/OpenFonts" OpenFonts
  echo "==> linked OpenFonts -> cover_letters/OpenFonts"
fi

echo "==> $ENGINE $BASE.tex (twice)"
for _ in 1 2; do
  "$ENGINE" -interaction=nonstopmode -halt-on-error "$BASE.tex" >/dev/null 2>&1 || {
    echo "FAILED. Real errors from the log:" >&2
    grep -A4 '^!' "$BASE.log" | head -40 >&2
    exit 1
  }
done

# Build succeeded, so the intermediates are noise. Keep only the PDF. (On failure we exit
# above without reaching this, so the .log survives for exactly the case where it is needed.)
rm -f "$BASE.aux" "$BASE.log" "$BASE.out" "$BASE.toc" "$BASE.fls" "$BASE.fdb_latexmk"

if command -v pdfinfo >/dev/null 2>&1; then
  GOT=$(pdfinfo "$BASE.pdf" | awk '/^Pages/{print $2}')
  if [[ "$GOT" == "$WANT" ]]; then
    echo "==> OK: $BASE.pdf is $GOT page(s), as expected"
  else
    echo "==> WARNING: $BASE.pdf is $GOT page(s), expected $WANT" >&2
    echo "    Cut or add a couple of lines and rebuild." >&2
  fi
else
  echo "==> built $BASE.pdf (install poppler for the page check: brew install poppler)"
fi

[[ $OPEN -eq 1 ]] && open "$BASE.pdf"
exit 0
