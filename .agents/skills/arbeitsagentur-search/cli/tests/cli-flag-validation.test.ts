import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers.js"

describe("CLI contract", () => {
  test("no args prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("USAGE")
  })

  test("--help exits 0 with usage", async () => {
    const r = await runCLI(["search", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("SEARCH FLAGS")
  })

  test("unknown command errors as JSON on stderr", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    expect(JSON.parse(r.stderr).code).toBe("BAD_CMD")
  })

  test("search with neither --query nor --location is rejected", async () => {
    const r = await runCLI(["search"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_CRITERIA")
  })

  test("non-numeric --jobage is rejected", async () => {
    const r = await runCLI(["search", "-q", "test", "--jobage", "soon"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("invalid --worktime is rejected with the allowed list", async () => {
    const r = await runCLI(["search", "-q", "test", "--worktime", "underwater"])
    expect(r.exitCode).toBe(1)
    const err = JSON.parse(r.stderr)
    expect(err.code).toBe("BAD_ARG")
    expect(err.error).toContain("remote")
  })

  test("invalid --offer-type is rejected", async () => {
    const r = await runCLI(["search", "-q", "test", "--offer-type", "moonlighting"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })

  test("detail without an id is rejected", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_ID")
  })

  test("errors never go to stdout", async () => {
    for (const args of [["frobnicate"], ["search"], ["detail"]]) {
      const r = await runCLI(args)
      expect(r.stdout).toBe("")
      expect(r.stderr.length).toBeGreaterThan(0)
    }
  })
})
