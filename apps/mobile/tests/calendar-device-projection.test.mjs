import assert from "node:assert/strict";
import { test } from "node:test";
import { projectDeviceEvents } from "../src/calendar/device-projection.ts";
import { projectBusy } from "../src/calendar/availability.ts";
const event = (people, patch = {}) => ({
  calendarId: "local",
  startDate: new Date(100),
  endDate: new Date(200),
  availability: "busy",
  status: "confirmed",
  title: "Secret",
  location: "Secret place",
  getAttendees: async () => people,
  ...patch,
});
test("only the current user's declined participation releases time, and attendee metadata is discarded", async () => {
  const events = await projectDeviceEvents([
    event([{ isCurrentUser: true, status: "declined", name: "Private" }]),
    event([{ isCurrentUser: false, status: "declined", email: "private@example.invalid" }], {
      startDate: new Date(300),
      endDate: new Date(400),
    }),
  ]);
  assert.equal(events[0].availability, "free");
  assert.equal(events[1].availability, "busy");
  assert.ok(!JSON.stringify(events).includes("Secret"));
  assert.ok(!JSON.stringify(events).includes("Private"));
  assert.ok(!JSON.stringify(events).includes("email"));
  assert.deepEqual(projectBusy(events, ["local"], { start: 0, end: 1000 }, 0).intervals, [
    { start: 300, end: 400 },
  ]);
});
test("free or cancelled occurrences skip participant reads, while failed required reads cannot imply free time", async () => {
  const getAttendees = async () => {
    throw new Error("Restricted participants");
  };
  await projectDeviceEvents([
    event([], { availability: "free", getAttendees }),
    event([], { status: "canceled", getAttendees }),
  ]);
  await assert.rejects(projectDeviceEvents([event([], { getAttendees })]), /Restricted/);
});
