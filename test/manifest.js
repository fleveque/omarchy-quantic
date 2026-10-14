// The checks `omarchy plugin validate` makes that matter here, for CI, which
// has no Omarchy: the fields the shell requires, entry points that exist,
// and defaults that match the settings schema.
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))

assert.equal(m.schemaVersion, 1)
for (const field of ["id", "name", "version", "kinds", "entryPoints"]) assert.ok(m[field] !== undefined, `manifest: no ${field}`)
assert.deepEqual(m.kinds, ["bar-widget"])
for (const [kind, file] of Object.entries(m.entryPoints)) {
  assert.ok(!file.startsWith("/") && !file.includes(".."), `${kind}: ${file} must be inside the plugin`)
  assert.ok(fs.existsSync(path.join(root, file)), `${kind}: ${file} doesn't exist`)
}
assert.ok(["left", "center", "right"].includes(m.barWidget.defaultSection))
for (const field of m.barWidget.schema) {
  assert.deepEqual(m.barWidget.defaults[field.key], field.defaultValue, `${field.key}: defaults and schema disagree`)
}
console.log(`manifest ok: ${m.id} ${m.version}`)
