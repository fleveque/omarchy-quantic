import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Runs `quantic status --json` every few minutes and when the panel opens,
// and shows the result: the pill's state for BarWidget.qml, and the panel.
// What the output means is decided in Model.js; this file runs the process
// and lays things out.
Panel {
  id: root
  moduleName: "io.github.fleveque.quantic"
  ipcTarget: "io.github.fleveque.quantic"
  manageIpc: false

  property var anchorItem: null
  // The bar knows the widget in its slot, BarWidget.qml, not this panel: it
  // has to be the identity the popout coordinator compares against.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  // One run's outcome: Model.parseRun's { state, doc, message }. Kept until
  // the next run finishes, so a refresh never blanks the pill.
  property var run: ({ state: "loading", doc: null, message: "" })
  property bool installed: false
  property string today: Qt.formatDate(new Date(), "yyyy-MM-dd")

  readonly property bool showAmounts: String(setting("showAmounts", "Off")) === "On"
  readonly property int refreshMinutes: Model.refreshMinutes(setting("refreshMinutes", 10))
  readonly property string portfolio: String(setting("portfolio", ""))
  readonly property var command: Model.command(String(setting("command", "quantic")), Quickshell.env("HOME"))
  readonly property var environment: Model.environment(portfolio)

  readonly property var pill: run.state === "loading"
    ? ({ icon: Model.ICON, text: "", dim: true, keyMark: false, tooltip: "Asking Quantic…" })
    : Model.pill(run, showAmounts, today)
  readonly property var monthInfo: Model.month(run.doc)
  readonly property var rowList: Model.rows(run.doc, today)
  readonly property var problemList: Model.problems(run.doc, portfolio)

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.5)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  // When the settings change what to run, run it.
  onCommandChanged: Qt.callLater(refresh)
  onEnvironmentChanged: Qt.callLater(refresh)

  function refresh() {
    today = Qt.formatDate(new Date(), "yyyy-MM-dd")
    if (whichProc.running || statusProc.running) return
    // Looked up every time, not once: quantic can be installed, or the
    // setting changed, while the shell runs.
    whichProc.command = ["which", command[0]]
    whichProc.running = true
  }

  function openQuantic() {
    Quickshell.execDetached(["xdg-open", "https://quantic.finance"])
    close()
  }

  function open() { openFromHotkey() }

  function openFromHotkey() {
    root.controller.show()
    root.refresh()
  }

  function close() { root.controller.hide() }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function toggle() {
    if (root.opened) root.close()
    else root.openFromHotkey()
  }

  Process {
    id: whichProc
    onExited: function(exitCode) {
      root.installed = exitCode === 0
      if (root.installed) {
        statusProc.command = root.command
        statusProc.environment = root.environment
        statusProc.running = true
      } else {
        root.run = Model.parseRun(false, 0, "", "")
      }
    }
  }

  Process {
    id: statusProc
    stdout: StdioCollector { id: statusOut; waitForEnd: true }
    stderr: StdioCollector { id: statusErr; waitForEnd: true }
    onExited: function(exitCode) {
      root.run = Model.parseRun(true, exitCode, String(statusOut.text || ""), String(statusErr.text || ""))
    }
  }

  Timer {
    interval: root.refreshMinutes * 60 * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // The pill counts days from today: at midnight "tomorrow" becomes "today"
  // without asking Quantic.
  Timer {
    interval: 60 * 1000
    running: true
    repeat: true
    onTriggered: root.today = Qt.formatDate(new Date(), "yyyy-MM-dd")
  }

  IpcHandler {
    target: root.ipcTarget

    function open(): void { root.openFromHotkey() }
    function close(): void { root.close() }
    function show(): void { root.openFromHotkey() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): void { root.refresh() }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(460))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      // r: refresh; o: open Quantic.
      onTextKey: function(t) {
        if (t === "r") root.refresh()
        else if (t === "o") root.openQuantic()
      }

      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: content.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        ColumnLayout {
          id: content
          width: scroll.width
          spacing: Style.space(12)

          // ---- Header: name, when, and the two actions.
          RowLayout {
            Layout.fillWidth: true
            spacing: Style.space(8)

            PanelSectionHeader {
              text: "QUANTIC"
              foreground: root.foreground
              fontFamily: root.fontFamily
              Layout.alignment: Qt.AlignVCenter
            }

            Text {
              textFormat: Text.PlainText
              Layout.fillWidth: true
              Layout.alignment: Qt.AlignVCenter
              horizontalAlignment: Text.AlignRight
              text: {
                if (root.run.state === "loading") return "Asking…"
                if (root.run.doc && root.run.doc.stale) return "As of " + Model.shortTime(root.run.doc.fetched_at) + ", offline"
                if (root.run.doc) return "Updated " + Model.shortTime(root.run.doc.fetched_at)
                return ""
              }
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }

            PanelActionButton {
              iconText: "\u{f0450}" // nf-md-refresh
              tooltipText: "Refresh (r)"
              foreground: root.foreground
              fontFamily: root.fontFamily
              enabled: !statusProc.running && !whichProc.running
              onClicked: root.refresh()
            }

            PanelActionButton {
              iconText: "\u{f03cc}" // nf-md-open_in_new
              tooltipText: "Open Quantic (o)"
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.openQuantic()
            }
          }

          // ---- When there's no document: what to do about it.
          Text {
            visible: root.run.doc === null && root.run.state !== "loading"
            Layout.fillWidth: true
            textFormat: Text.PlainText
            wrapMode: Text.Wrap
            text: {
              switch (root.run.state) {
              case "not_installed": return "quantic isn't installed, or isn't on the shell's PATH. Put it in ~/.local/bin (github.com/fleveque/quantic-cli/releases), or point the widget at it:\nomarchy bar set io.github.fleveque.quantic command ~/go/bin/quantic"
              case "signed_out": return "Not signed in. In a terminal: quantic auth login"
              case "offline": return "Quantic can't be reached, and nothing is cached yet."
              }
              return root.run.message
            }
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
          }

          // ---- The next event, amounts and all: opening the panel is deliberate.
          ColumnLayout {
            visible: root.run.doc !== null
            Layout.fillWidth: true
            spacing: Style.space(4)

            Text {
              textFormat: Text.PlainText
              Layout.fillWidth: true
              wrapMode: Text.Wrap
              text: {
                var next = root.run.doc ? root.run.doc.next : null
                var words = Model.eventText(next, root.today)
                if (words === "") return "Nothing of yours in the next 14 days"
                return next.expected ? words + " · " + Model.formatMoney(next.expected) : words
              }
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
            }

            Text {
              textFormat: Text.PlainText
              visible: text !== ""
              text: root.run.doc && root.run.doc.next ? (root.run.doc.next.name || "") : ""
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }
          }

          // ---- This month: received per currency, against a typical month.
          ColumnLayout {
            visible: root.monthInfo.title !== ""
            Layout.fillWidth: true
            spacing: Style.space(4)

            PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

            PanelSectionHeader {
              text: root.monthInfo.title.toUpperCase()
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Repeater {
              model: [root.monthInfo.received, root.monthInfo.projected].filter(function(line) { return line !== "" })

              Text {
                required property var modelData
                Layout.fillWidth: true
                textFormat: Text.PlainText
                wrapMode: Text.Wrap
                text: modelData
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }
            }
          }

          // ---- The next 14 days, one row per ex-date or payment.
          ColumnLayout {
            visible: root.rowList.length > 0
            Layout.fillWidth: true
            spacing: Style.space(6)

            PanelSeparator { Layout.fillWidth: true; foreground: root.foreground }

            PanelSectionHeader {
              text: "NEXT 14 DAYS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Repeater {
              model: root.rowList

              RowLayout {
                required property var modelData
                Layout.fillWidth: true
                spacing: Style.space(10)

                Text {
                  textFormat: Text.PlainText
                  Layout.preferredWidth: Style.space(80)
                  text: modelData.when
                  color: modelData.days <= 1 ? root.foreground : root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
                Text {
                  textFormat: Text.PlainText
                  Layout.preferredWidth: Style.space(60)
                  text: modelData.symbol
                  color: modelData.held ? root.foreground : root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                  font.bold: true
                }
                Text {
                  textFormat: Text.PlainText
                  Layout.preferredWidth: Style.space(52)
                  text: modelData.event
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
                Text {
                  textFormat: Text.PlainText
                  Layout.fillWidth: true
                  text: modelData.portfolio
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  elide: Text.ElideRight
                }
                Text {
                  textFormat: Text.PlainText
                  text: modelData.amount
                  color: modelData.held ? root.foreground : root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                }
              }
            }
          }

          // ---- Parts quantic couldn't get this time.
          Repeater {
            model: root.problemList

            Text {
              required property var modelData
              Layout.fillWidth: true
              textFormat: Text.PlainText
              wrapMode: Text.Wrap
              text: "Missing " + modelData
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              font.italic: true
            }
          }
        }
      }
    }
  }
}
