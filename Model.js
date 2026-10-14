// Everything the widget decides, kept out of the QML so it can be tested
// with node: what `quantic status --json` and its exit code mean, and the
// words and amounts the pill and the panel show. No QML, no I/O.
//
// The input is quantic-cli's output contract, quantic.cli/status/v1
// (https://github.com/fleveque/quantic-cli/blob/main/docs/design.md#8-quantic-status-one-call-for-the-widget).

var SCHEMA = "quantic.cli/status/v1"

// quantic's exit codes (design §6) that the widget tells apart.
var EXIT_OK = 0
var EXIT_UNREACHABLE = 3
var EXIT_NOT_SIGNED_IN = 4

// The pill's icon: nf-md-chart_line, from the Nerd Font the bar uses.
var ICON = "\u{f012a}"

var SYMBOLS = { EUR: "€", USD: "$", GBP: "£", JPY: "¥" }

// parseRun turns one run of `quantic status --json` into the widget's state:
//
//   not_installed  no quantic on PATH
//   signed_out     exit 4: quantic auth login
//   offline        exit 3: Quantic unreachable, and nothing cached
//   error          any other failure, or output this version can't read
//   ok             a status document, in doc; doc.stale says it's a cached copy
//
// message is what to tell someone in the panel, when there's something to say.
function parseRun(installed, exitCode, stdout, stderr) {
  if (!installed) return { state: "not_installed", doc: null, message: "" }
  if (exitCode === EXIT_NOT_SIGNED_IN) return { state: "signed_out", doc: null, message: lastLine(stderr) }
  if (exitCode === EXIT_UNREACHABLE) return { state: "offline", doc: null, message: lastLine(stderr) }
  if (exitCode !== EXIT_OK) {
    return { state: "error", doc: null, message: lastLine(stderr) || ("quantic exited with " + exitCode) }
  }

  var doc
  try {
    doc = JSON.parse(String(stdout || ""))
  } catch (e) {
    return { state: "error", doc: null, message: "quantic printed something that isn't JSON" }
  }
  if (!doc || doc.schema !== SCHEMA) {
    // A newer quantic with status/v2, say: the widget needs updating too.
    return { state: "error", doc: null, message: "quantic printed " + (doc && doc.schema ? doc.schema : "an unknown shape") + "; this widget reads " + SCHEMA }
  }
  return { state: "ok", doc: doc, message: "" }
}

// The last non-empty line of stderr, without quantic's "quantic: " prefix.
function lastLine(text) {
  var lines = String(text || "").split("\n").filter(function(l) { return l.trim() !== "" })
  if (lines.length === 0) return ""
  return lines[lines.length - 1].replace(/^quantic: /, "").trim()
}

// formatMoney shows {"amount": "65.66", "currency": "USD"} as "$65.66", and a
// currency without a symbol here as "65.66 CHF". The amount stays the
// decimal string quantic sent: never turned into a number, never rounded.
function formatMoney(m) {
  if (!m || m.amount === undefined || !m.currency) return ""
  var symbol = SYMBOLS[m.currency]
  if (!symbol) return m.amount + " " + m.currency
  if (m.amount.charAt(0) === "-") return "-" + symbol + m.amount.slice(1)
  return symbol + m.amount
}

// daysBetween counts whole days from today to date, both "2026-10-15".
// Parsed as UTC midnights, so a daylight-saving change can't make a day 23
// hours long.
function daysBetween(today, date) {
  var a = Date.parse(today + "T00:00:00Z")
  var b = Date.parse(date + "T00:00:00Z")
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

// when says a day as people do: "today", "tomorrow", "in 3 days".
function when(days) {
  if (days === 0) return "today"
  if (days === 1) return "tomorrow"
  return "in " + days + " days"
}

// eventText is the next event in words, counted from today rather than taken
// from in_days: a cached document can be hours old, and the pill shouldn't
// say "tomorrow" on the day itself. Empty for an event already past.
function eventText(next, today) {
  if (!next || !next.date) return ""
  var days = daysBetween(today, next.date)
  if (days === null || days < 0) return ""
  var what = next.event === "pay_date" ? "pays" : "ex-div"
  return next.symbol + " " + what + " " + when(days)
}

// pill is what the bar shows: { icon, text, dim, keyMark, tooltip }.
// Amounts only with showAmounts: a bar is on screen when you share it.
function pill(run, showAmounts, today) {
  var p = { icon: ICON, text: "", dim: false, keyMark: false, tooltip: "" }
  switch (run.state) {
  case "not_installed":
    p.dim = true
    p.tooltip = "quantic isn't installed"
    return p
  case "signed_out":
    p.keyMark = true
    p.tooltip = "Not signed in: quantic auth login"
    return p
  case "offline":
    p.tooltip = "Quantic can't be reached"
    return p
  case "error":
    p.dim = true
    p.tooltip = run.message
    return p
  }

  var doc = run.doc
  p.text = eventText(doc.next, today)
  if (p.text !== "" && showAmounts && doc.next.expected) p.text += " · " + formatMoney(doc.next.expected)
  if (p.text === "") p.tooltip = "Nothing of yours in the next 14 days"
  if (doc.stale) {
    p.dim = true
    p.tooltip = "Quantic can't be reached; as of " + shortTime(doc.fetched_at)
  }
  return p
}

// shortTime shows an RFC 3339 time as local "HH:MM", or "Oct 14, 09:00" when
// it isn't today.
function shortTime(iso, now) {
  var t = new Date(iso)
  if (isNaN(t.getTime())) return ""
  var n = now || new Date()
  var hm = pad(t.getHours()) + ":" + pad(t.getMinutes())
  if (t.toDateString() === n.toDateString()) return hm
  return MONTHS[t.getMonth()] + " " + t.getDate() + ", " + hm
}

function pad(n) { return (n < 10 ? "0" : "") + n }

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

// month is the panel's month block: { title, received, projected }, each a
// line, or "" when that part is missing. received is every currency it was
// paid in: quantic doesn't convert them, and neither does the widget.
function month(doc) {
  var m = doc && doc.this_month
  if (!m) return { title: "", received: "", projected: "" }
  var n = parseInt(String(m.month || "").slice(5, 7), 10)
  var name = n >= 1 && n <= 12 ? MONTH_NAMES[n - 1] : ""
  var net = m.net_of_withholding ? ", after withholding" : ""

  var received = ""
  if (m.received) {
    received = m.received.length === 0
      ? "Nothing received yet"
      : m.received.map(formatMoney).join(" + ") + " received" + net
  }
  var projected = m.projected ? formatMoney(m.projected) + " in a typical " + name + net : ""
  return { title: name, received: received, projected: projected }
}

// rows are the panel's list: one per ex-date or payment from today to
// WINDOW days on, in date order, an ex-date before a payment on the same day.
// An item comes when either of its dates is in the window, so its other date
// can be outside it: the window holds that one back. A holding's row has its
// amount; a radar stock's says "radar".
var WINDOW = 14

function rows(doc, today) {
  var out = []
  var items = (doc && doc.upcoming) || []
  for (var i = 0; i < items.length; i++) {
    var it = items[i]
    var events = [["ex_date", "ex-div"], ["pay_date", "pays"]]
    for (var j = 0; j < events.length; j++) {
      var date = it[events[j][0]]
      if (!date) continue
      var days = daysBetween(today, date)
      if (days === null || days < 0 || days > WINDOW) continue
      out.push({
        date: date,
        days: days,
        order: j,
        when: when(days),
        symbol: it.symbol,
        name: it.name || "",
        event: events[j][1],
        amount: it.held ? formatMoney(it.expected) : "radar",
        portfolio: it.portfolio || "",
        held: it.held === true
      })
    }
  }
  out.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return a.order - b.order
  })
  return out
}

// problems are the parts of the document that failed, for the panel:
// "income: Something went wrong."
function problems(doc) {
  return ((doc && doc.errors) || []).map(function(e) { return e.part + ": " + e.message })
}

// refreshMinutes is the setting, never under 5: the widget shouldn't ask
// Quantic more often than that (design §9). Ten when unset or unreadable.
function refreshMinutes(setting) {
  var n = parseInt(setting, 10)
  if (isNaN(n)) return 10
  return Math.max(5, n)
}

// command is the argument list for one refresh. A path setting can start
// with ~/, which no shell is there to expand: home is $HOME.
function command(binary, portfolio, home) {
  var b = String(binary || "").trim() || "quantic"
  if (b.indexOf("~/") === 0 && home) b = home + b.slice(1)
  var args = [b, "status", "--json"]
  var p = String(portfolio || "").trim()
  if (p !== "") args.push("--portfolio", p)
  return args
}

if (typeof module !== "undefined") {
  module.exports = {
    SCHEMA: SCHEMA,
    ICON: ICON,
    parseRun: parseRun,
    lastLine: lastLine,
    formatMoney: formatMoney,
    daysBetween: daysBetween,
    when: when,
    eventText: eventText,
    pill: pill,
    shortTime: shortTime,
    month: month,
    rows: rows,
    problems: problems,
    refreshMinutes: refreshMinutes,
    command: command
  }
}
