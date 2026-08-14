const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "MD_Manager.html"), "utf8");
const iconDirectory = path.join(root, "res", "icons");
const iconNames = new Map([["checkmark", "check"], ["strikethrough", "strike"]]);

/** @param {string} value */
function normalizeMarkup(value) {
  return value.replace(/\s+/g, " ").replace(/> </g, "><").trim();
}

/** @param {string} source */
function standaloneIcon(source) {
  const file = source.trim().match(/^<svg\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"\s+viewBox="([^"]+)"([^>]*)>([\s\S]*?)<\/svg>$/);
  assert.ok(file, "icon has the required standalone SVG wrapper");
  return { viewBox: file[1], attributes: normalizeMarkup(file[2]), content: normalizeMarkup(file[3]) };
}

test("local SVG files exactly match every inline icon symbol", () => {
  const symbols = new Map(Array.from(html.matchAll(/<symbol id="icon-([^"]+)" viewBox="([^"]+)"([^>]*)>([\s\S]*?)<\/symbol>/g), match => [match[1], { viewBox: match[2], attributes: normalizeMarkup(match[3]), content: normalizeMarkup(match[4]) }]));
  const files = fs.readdirSync(iconDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".svg"))
    .map(entry => entry.name)
    .sort();
  const mappedNames = files.map(file => {
    const sourceName = path.basename(file, ".svg");
    return iconNames.get(sourceName) || sourceName;
  }).sort();

  assert.equal(symbols.size, 26);
  assert.equal(files.length, 26);
  assert.deepEqual(mappedNames, Array.from(symbols.keys()).sort());

  for (const entry of files) {
    const sourceName = path.basename(entry, ".svg");
    const name = iconNames.get(sourceName) || sourceName;
    const symbol = symbols.get(name);
    assert.ok(symbol, `${entry} maps to an inline symbol`);
    const file = standaloneIcon(fs.readFileSync(path.join(iconDirectory, entry), "utf8"));
    assert.equal(file.viewBox, "0 0 32 32", `${entry} uses the shared 32x32 source canvas`);
    assert.equal(file.viewBox, symbol.viewBox, `${name}.svg uses the inline viewBox`);
    assert.equal(file.attributes, symbol.attributes, `${name}.svg uses the inline root attributes`);
    assert.equal(file.content, symbol.content, `${name}.svg uses the inline geometry`);
  }
});

test("all logo references use the local logo directory", () => {
  const render = fs.readFileSync(path.join(root, "ui", "render.js"), "utf8");
  assert.ok(fs.existsSync(path.join(root, "res", "logo", "Logo.svg")));
  assert.doesNotMatch(`${html}\n${render}`, /res\/Logo\.svg/);
  assert.match(html, /res\/logo\/Logo\.svg/);
  assert.doesNotMatch(render, /res\/logo\/Logo\.svg/);
});

test("application logo uses the dark theme palette", () => {
  const logoDirectory = path.join(root, "res", "logo");
  const logo = fs.readFileSync(path.join(logoDirectory, "Logo.svg"), "utf8");
  assert.match(logo, /viewBox="0 0 32 32"/);
  assert.match(logo, /fill="#282828"/);
  assert.match(logo, /stroke="#b8bb26"/);
  assert.match(logo, /stroke="#d79921"/);
});
