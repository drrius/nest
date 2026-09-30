import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { agendaDay, adjacentDay } from "../src/calendar/agenda-day.ts";
const moduleUrl = new URL("../src/calendar/agenda-day.ts", import.meta.url).href;
test("invalid civil dates are rejected and navigation stays inside supported dates", () => {
  for (const date of ["bad", "2026-02-30", "2026-9-21", "0000-01-01"])
    assert.equal(agendaDay(date), null);
  assert.equal(adjacentDay("0001-01-01", -1), null);
  assert.equal(adjacentDay("9999-12-31", 1), null);
});
test("device-local day windows match actual civil boundaries across DST, midnight transitions and travel zones", () => {
  const code = `import assert from 'node:assert/strict';
    import { agendaDay, localDate, adjacentDay } from ${JSON.stringify(moduleUrl)};
    for (let i=0;i<1000;i++) {
      const date=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10), window=agendaDay(date);
      assert.ok(window);
      assert.equal(localDate(new Date(window.start)),date);
      assert.notEqual(localDate(new Date(window.start-1)),date);
      assert.equal(localDate(new Date(window.end-1)),date);
      assert.notEqual(localDate(new Date(window.end)),date);
      assert.ok(window.end>window.start);
      assert.equal(adjacentDay(date,1),localDate(new Date(window.end)));
    }
    if(process.env.TZ==='Europe/Zurich') {
      assert.equal(agendaDay('2026-03-29').end-agendaDay('2026-03-29').start,23*3600000);
      assert.equal(agendaDay('2026-10-25').end-agendaDay('2026-10-25').start,25*3600000);
    }
    if(process.env.TZ==='Pacific/Apia') assert.equal(agendaDay('2011-12-30'),null);`;
  for (const zone of [
    "Europe/Zurich",
    "America/New_York",
    "America/Santiago",
    "Asia/Kathmandu",
    "Pacific/Apia",
  ])
    execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      env: { ...process.env, TZ: zone },
      stdio: "pipe",
    });
});
