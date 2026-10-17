"""Skip guard for tests that read the candidate's methodology files.

A public fork can keep CLAUDE.md, search-queries.md and the
job-application-assistant profile files (01-07) out of git, because /setup
writes personal data into them. Those files are still on disk in the fork's
own working copy, so these tests keep checking them there, and on the
upstream template every file is tracked. Only a clean checkout of such a fork
- its CI - lacks them, and there the tests skip instead of failing on a
missing file.
"""
import unittest
from pathlib import Path


def requires_files(*paths: Path):
    """Skip the decorated test or class when any of ``paths`` is absent."""
    missing = [p.name for p in paths if not p.exists()]
    return unittest.skipIf(
        bool(missing),
        f"not in this checkout (a fork may keep it untracked): {', '.join(missing)}",
    )
