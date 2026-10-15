import QtQuick
import qs.Commons
import qs.Ui

// The pill. It only draws what Panel.qml decides: the panel runs quantic and
// holds the state, as Omarchy's weather widget does, so the pill and the
// panel can never disagree.
BarWidget {
  id: root
  moduleName: "io.github.fleveque.quantic"

  readonly property var pill: panelLoader.item ? panelLoader.item.pill : null

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  // The shape the bar's summon, hide and toggle routing expects of a widget
  // with a panel: open, close and opened on the widget itself.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.openFromHotkey()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: {
      if (!root.pill) return ""
      var t = root.pill.icon
      if (root.pill.keyMark) t += " \u{f0306}" // nf-md-key: sign in
      if (root.pill.text !== "") t += "  " + root.pill.text
      return t
    }
    dimmed: root.pill ? root.pill.dim : false
    tooltipText: root.pill ? root.pill.tooltip : ""

    // Left: the panel. Middle: ask again now.
    onPressed: function(b) {
      if (!panelLoader.item) return
      if (b === Qt.MiddleButton) panelLoader.item.refresh()
      else panelLoader.item.toggle()
    }
  }
}
