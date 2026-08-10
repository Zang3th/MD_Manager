const test = require("node:test");
const assert = require("node:assert/strict");
const load = require("./load-classic");

const { archive } = load("domain/project.js");
const feature = (title, from, to = "", version = "") => ({ title, version, dates: from ? [{ from, to }] : [], tasks: [] });

test("archive timeline derives its scale from the first and last parsed metadata dates", () => {
  const cases = [
    [[feature("A", "2026-01-01"), feature("B", "2026-01-31")], "day"],
    [[feature("A", "01.01.2026"), feature("B", "15.02.2026")], "week"],
    [[feature("A", "2026-01-01"), feature("B", "2026-09-01")], "month"],
    [[feature("A", "2023-01-01"), feature("B", "2026-01-02")], "year"]
  ];
  for (const [features, scale] of cases) assert.equal(archive.timeline(features).scale, scale);
});

test("archive timeline includes range endpoints, groups starts, and leaves invalid dates at the end", () => {
  const timeline = archive.timeline([
    feature("Range", "15.01.2024", "01.04.2026", "1.0.0"),
    feature("Later", "01.06.2025", "", "2.0.0"),
    feature("Version ten", "", "", "10.0.0"),
    feature("Version two", "", "", "2.0.0"),
    feature("Unknown", "2026-99-10")
  ]);
  assert.equal(timeline.scale, "year");
  assert.equal(timeline.from, "15.01.2024");
  assert.equal(timeline.to, "01.04.2026");
  assert.deepEqual(Array.from(timeline.groups, group => group.label), ["2024", "2025"]);
  assert.deepEqual(Array.from(timeline.groups.flatMap(group => group.entries), entry => entry.feature.title), ["Range", "Later"]);
  assert.deepEqual(Array.from(timeline.versioned, item => item.title), ["Version two", "Version ten"]);
  assert.deepEqual(Array.from(timeline.undated, item => item.title), ["Unknown"]);
});
