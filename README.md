# omarchy-quantic

Your next dividend in the [Omarchy](https://omarchy.org) bar, and the next two weeks in a panel,
from [Quantic Finance](https://quantic.finance).

![The bar: O ex-div in 3 days](docs/screenshots/pill.png)

![The panel: the next event, October's income, and the next 14 days](docs/screenshots/panel.png)

It's a thin widget over [quantic-cli](https://github.com/fleveque/quantic-cli). Every few minutes it
runs `quantic status --json` and shows what comes back. The CLI handles everything else: signing
in, the API, caching, and staying usable offline.

## What it shows

**The pill** shows your holdings' next ex-dividend date or payment: `O ex-div in 3 days`. Amounts
are hidden by default, because the bar is on screen whenever you share it. Turn them on and the
pill adds what that dividend should pay:

![The pill with amounts on: O ex-div in 3 days · $65.66](docs/screenshots/pill-amounts.png)

**The panel** (left click) shows:
- the next event with its amount;
- what this month has paid so far, one total per currency (Quantic doesn't convert them, and
  neither does the widget);
- what a typical such month pays, in your preferred currency;
- every ex-date and payment in the next 14 days. Stocks on your Quantic radar are listed
  dimmed, as `radar`.

`r` refreshes, `o` opens Quantic, and `Esc` closes it. A middle click on the pill also refreshes.

**When something's wrong:**

| State | Pill |
|---|---|
| quantic not installed, or not found | the icon, dimmed; the panel says how to fix it |
| not signed in | the icon with a key: ![signed out](docs/screenshots/pill-signed-out.png) |
| Quantic unreachable, cached answer | the cached text, dimmed; the tooltip and panel say since when: ![stale](docs/screenshots/pill-stale.png) |
| Quantic unreachable, nothing cached | the icon only |
| one part failed (say, income) | everything else as usual; the panel lists what's missing |

## Install

1. Install [quantic-cli](https://github.com/fleveque/quantic-cli#try-it) and sign in:

   ```
   go install github.com/fleveque/quantic-cli/cmd/quantic@latest
   quantic auth login
   quantic status            # check it works
   ```

2. Add the widget:

   ```
   omarchy plugin add https://github.com/fleveque/omarchy-quantic.git --enable
   ```

3. `go install` puts `quantic` in `~/go/bin`, which usually isn't on the Omarchy shell's `PATH`.
   Point the widget at it:

   ```
   omarchy bar set fleveque.quantic command ~/go/bin/quantic
   ```

   (Once quantic-cli has packages, from its milestone 7, this step goes away.)

Plugins run inside the Omarchy shell, unsandboxed: read the code before enabling it. It's
`Model.js`, `Panel.qml` and `BarWidget.qml`, about 700 lines. The widget runs only `which` and
`quantic status --json`, plus `xdg-open https://quantic.finance` when you ask it to. It has no token
and makes no network calls of its own.

## Settings

Each one is set with `omarchy bar set fleveque.quantic <key> <value>`:

| Key | Default | |
|---|---|---|
| `refreshMinutes` | `10` | how often to ask; never under 5 |
| `portfolio` | empty | one portfolio by name or slug; empty is all of them, and your radar |
| `showAmounts` | `Off` | `On` adds the next dividend's amount to the pill |
| `command` | `quantic` | the quantic binary: a name on `PATH`, or a path (`~/` works) |

## The contract

The widget reads [`quantic.cli/status/v1`](https://github.com/fleveque/quantic-cli/blob/main/docs/design.md#8-quantic-status-one-call-for-the-widget)
and quantic's [exit codes](https://github.com/fleveque/quantic-cli/blob/main/docs/design.md#6-exit-codes):
3 for unreachable, 4 for not signed in. A `quantic` that prints another schema version is an error
the panel names, rather than something the widget guesses at.

`test/fixtures/status.json` is a copy of quantic-cli's golden file for `quantic status --json`, and
CI fails when the two differ. When the CLI's output changes, the copy and the widget are updated
together.

## Working on this

```
node --test       # Model.js against the fixtures, and the manifest
```

`Model.js` holds every decision: what an exit code means, the pill's words, the month's lines, the
panel's rows. It's plain JavaScript that the QML imports and node tests. The QML only runs the
process and lays things out, and it's checked by hand. To load a checkout into the shell:

```
ln -s "$PWD" ~/.config/omarchy/plugins/fleveque.quantic
omarchy-shell shell rescanPlugins
omarchy plugin enable fleveque.quantic
omarchy-shell fleveque.quantic refresh     # ask again now
```

`main` is protected: every change goes through a pull request, and CI must pass before merge.

## License

[MIT](LICENSE)
