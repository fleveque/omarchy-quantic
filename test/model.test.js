// Model.js against quantic's real output: status.json is quantic-cli's golden
// file for `quantic status --json`, copied byte for byte (CI checks it still
// matches), recorded from a demo user on 2026-10-15. The others are written
// by hand for the states the golden file doesn't cover.
//
// Run with: node --test

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Model = require("../Model.js")

function fixture(name) {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8")
  // The golden file has a placeholder where the time of the run goes.
  return text.replace('"FETCHED_AT"', '"2026-10-15T09:00:00Z"')
}

const ok = (name) => Model.parseRun(true, 0, fixture(name), "")
const TODAY = "2026-10-15"

test("a status document is ok", () => {
  const run = ok("status.json")
  assert.equal(run.state, "ok")
  assert.equal(run.doc.next.symbol, "O")
})

test("each exit code is its own state", () => {
  assert.equal(Model.parseRun(false, 0, "", "").state, "not_installed")
  const signedOut = Model.parseRun(true, 4, fixture("status-signed-out.json"),
    "quantic: not signed in to quantic.finance; run: quantic auth login (or set QUANTIC_TOKEN)\n")
  assert.equal(signedOut.state, "signed_out")
  assert.equal(signedOut.message, "not signed in to quantic.finance; run: quantic auth login (or set QUANTIC_TOKEN)")
  assert.equal(Model.parseRun(true, 3, "", "quantic: can't reach Quantic at quantic.finance: dial tcp: lookup quantic.finance: no such host\n").state, "offline")
  const failed = Model.parseRun(true, 1, "", "")
  assert.equal(failed.state, "error")
  assert.equal(failed.message, "quantic exited with 1")
})

test("output it can't read is an error that says why", () => {
  assert.equal(Model.parseRun(true, 0, "Usage: quantic …", "").message, "quantic printed something that isn't JSON")
  const v2 = Model.parseRun(true, 0, '{"schema": "quantic.cli/status/v2"}', "")
  assert.equal(v2.state, "error")
  assert.equal(v2.message, "quantic printed quantic.cli/status/v2; this widget reads quantic.cli/status/v1")
})

test("the pill: the next event, and its amount only when asked", () => {
  const run = ok("status.json")
  assert.equal(Model.pill(run, false, TODAY).text, "O ex-div in 2 days")
  // O in two portfolios, added up by quantic: 54.72 + 10.94.
  assert.equal(Model.pill(run, true, TODAY).text, "O ex-div in 2 days · $65.66")
  assert.equal(Model.pill(run, false, "2026-10-16").text, "O ex-div tomorrow")
  assert.equal(Model.pill(run, false, "2026-10-17").text, "O ex-div today")
})

test("the pill counts from today, not from when quantic ran", () => {
  // A copy cached on the 15th, read on the 18th: the ex-date has passed.
  const p = Model.pill(ok("status.json"), false, "2026-10-18")
  assert.equal(p.text, "")
  assert.equal(p.tooltip, "Nothing of yours in the next 14 days")
})

test("a stale copy is dimmed and says since when", () => {
  const p = Model.pill(ok("status-partial.json"), false, TODAY)
  assert.equal(p.text, "VZ pays tomorrow")
  assert.equal(p.dim, true)
  assert.match(p.tooltip, /^Quantic can't be reached; as of /)
})

test("no amount on the pill when quantic has none", () => {
  assert.equal(Model.pill(ok("status-partial.json"), true, TODAY).text, "VZ pays tomorrow")
})

test("the pill for each state the design lists", () => {
  const p = (state) => Model.pill({ state, doc: null, message: "boom" }, true, TODAY)
  assert.deepEqual([p("not_installed").dim, p("not_installed").text], [true, ""])
  assert.deepEqual([p("signed_out").keyMark, p("signed_out").text], [true, ""])
  assert.deepEqual([p("offline").dim, p("offline").text, p("offline").tooltip], [false, "", "Quantic can't be reached"])
  assert.equal(p("error").tooltip, "boom")
})

test("the month: received per currency, against a typical month", () => {
  assert.deepEqual(Model.month(ok("status.json").doc), {
    title: "October",
    received: "£49.72 + $141.52 received, after withholding",
    projected: "€138.60 in a typical October, after withholding"
  })
})

test("the month with nothing paid yet, and with a part missing", () => {
  assert.deepEqual(Model.month(ok("status-partial.json").doc), {
    title: "October", received: "Nothing received yet", projected: ""
  })
  const doc = ok("status.json").doc
  doc.this_month.received = null // the dividends call failed
  assert.equal(Model.month(doc).received, "")
  assert.deepEqual(Model.month(null), { title: "", received: "", projected: "" })
})

test("rows: every date from today on, in order, ex before pay", () => {
  const rows = Model.rows(ok("status.json").doc, TODAY)
  assert.deepEqual(rows.slice(0, 4).map((r) => [r.date, r.symbol, r.event, r.amount, r.portfolio]), [
    ["2026-10-17", "O", "ex-div", "$54.72", "Main"],
    ["2026-10-17", "O", "ex-div", "$10.94", "Pension"],
    ["2026-10-19", "JNJ", "ex-div", "$49.11", "Main"],
    ["2026-10-19", "MSFT", "ex-div", "radar", ""]
  ])
  // KO goes ex in 13 days, the last in the window. MSFT's payment on
  // 2026-12-10 is in the same document, as part of its item, but outside it.
  assert.deepEqual([rows.at(-1).symbol, rows.at(-1).date], ["KO", "2026-10-28"])
  assert.equal(rows.some((r) => r.date === "2026-12-10"), false)

  // VZ went ex on the 9th; only the payment is still to come.
  const vz = Model.rows(ok("status-partial.json").doc, TODAY)
  assert.deepEqual(vz.map((r) => [r.event, r.when]), [["pays", "tomorrow"]])
})

test("rows with an ex-date and a payment on the same day: ex first", () => {
  // Quantic orders items by their first date to come: A (paying on the 20th)
  // can come before B (going ex the same day).
  const doc = { upcoming: [
    { symbol: "A", held: true, ex_date: "2026-10-01", pay_date: "2026-10-20", expected: null },
    { symbol: "B", held: true, ex_date: "2026-10-20", pay_date: null, expected: null }
  ] }
  assert.deepEqual(Model.rows(doc, TODAY).map((r) => r.symbol + " " + r.event), ["B ex-div", "A pays"])
})

test("problems name the part that failed", () => {
  assert.deepEqual(Model.problems(ok("status-partial.json").doc), ["income: Something went wrong."])
  assert.deepEqual(Model.problems(ok("status.json").doc), [])
})

test("a quantic that ignored the portfolio is a problem", () => {
  assert.deepEqual(Model.problems(ok("status.json").doc, "Pension"),
    ["portfolio: showing all of them; the Portfolio setting needs quantic-cli 0.1.1 or later."])
  assert.deepEqual(Model.problems(ok("status-partial.json").doc, "Pension"), ["income: Something went wrong."])
  assert.deepEqual(Model.problems(ok("status.json").doc, " "), [])
})

test("money as quantic sent it, with a symbol when there is one", () => {
  assert.equal(Model.formatMoney({ amount: "0.2736", currency: "USD" }), "$0.2736")
  assert.equal(Model.formatMoney({ amount: "12.00", currency: "CHF" }), "12.00 CHF")
  assert.equal(Model.formatMoney({ amount: "-3.10", currency: "EUR" }), "-€3.10")
  assert.equal(Model.formatMoney(null), "")
})

test("days, counted in whole calendar days", () => {
  // Across Europe's spring clock change, on 2027-03-28: in local time that
  // Sunday is 23 hours long, and a count in hours would come up short.
  assert.equal(Model.daysBetween("2027-03-27", "2027-03-29"), 2)
  assert.equal(Model.daysBetween("2026-12-31", "2027-01-01"), 1)
  assert.equal(Model.daysBetween("2026-10-15", "soon"), null)
})

test("refresh is never more often than every 5 minutes", () => {
  assert.equal(Model.refreshMinutes(undefined), 10)
  assert.equal(Model.refreshMinutes("abc"), 10)
  assert.equal(Model.refreshMinutes(1), 5)
  assert.equal(Model.refreshMinutes(30), 30)
})

test("the command never names the portfolio", () => {
  assert.deepEqual(Model.command("quantic"), ["quantic", "status", "--json"])
  assert.deepEqual(Model.command(""), ["quantic", "status", "--json"])
  assert.deepEqual(Model.command("/home/me/go/bin/quantic"), ["/home/me/go/bin/quantic", "status", "--json"])
  assert.deepEqual(Model.command("~/go/bin/quantic", "/home/me"), ["/home/me/go/bin/quantic", "status", "--json"])
})

test("the portfolio goes in the environment, empty for all of them", () => {
  assert.deepEqual(Model.environment(" Pension "), { QUANTIC_PORTFOLIO: "Pension" })
  assert.deepEqual(Model.environment(""), { QUANTIC_PORTFOLIO: "" })
  assert.deepEqual(Model.environment(null), { QUANTIC_PORTFOLIO: "" })
})

test("shortTime: the time today, the date as well otherwise", () => {
  const at = new Date(2026, 9, 15, 9, 5)
  assert.equal(Model.shortTime(at.toISOString(), new Date(2026, 9, 15, 18, 0)), "09:05")
  assert.equal(Model.shortTime(at.toISOString(), new Date(2026, 9, 16, 8, 0)), "Oct 15, 09:05")
  assert.equal(Model.shortTime("FETCHED_AT"), "")
})
