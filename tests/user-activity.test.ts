import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { recordUserActivity } from "../lib/user-activity";

type ActivityUser = { id: string; isActive: boolean; lastSeenAt: Date | null };

function mockUser(t: TestContext, user: ActivityUser) {
  const original = prisma.user;
  Object.defineProperty(prisma, "user", {
    configurable: true,
    value: {
      async updateMany({ where, data }: {
        where: { id: string; isActive: boolean; OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: Date } }] };
        data: { lastSeenAt: Date };
      }) {
        const matches = user.id === where.id && user.isActive === where.isActive &&
          (user.lastSeenAt === where.OR[0].lastSeenAt ||
            (user.lastSeenAt != null && user.lastSeenAt < where.OR[1].lastSeenAt.lt));
        if (matches) user.lastSeenAt = data.lastSeenAt;
        return { count: matches ? 1 : 0 };
      }
    }
  });
  t.after(() => Object.defineProperty(prisma, "user", { value: original, configurable: true }));
}

test("first authenticated activity records the visit", async (t) => {
  const user = { id: "leader", isActive: true, lastSeenAt: null } as ActivityUser;
  mockUser(t, user);
  const now = new Date("2026-10-05T03:00:00Z");
  assert.equal((await recordUserActivity(user.id, now)).count, 1);
  assert.equal(user.lastSeenAt?.toISOString(), now.toISOString());
});

test("frequent and concurrent requests update activity at most once per minute", async (t) => {
  const user = { id: "leader", isActive: true, lastSeenAt: new Date("2026-10-05T03:00:00Z") };
  mockUser(t, user);
  assert.equal((await recordUserActivity(user.id, new Date("2026-10-05T03:00:30Z"))).count, 0);
  const results = await Promise.all([
    recordUserActivity(user.id, new Date("2026-10-05T03:01:01Z")),
    recordUserActivity(user.id, new Date("2026-10-05T03:01:02Z"))
  ]);
  assert.equal(results.reduce((sum, result) => sum + result.count, 0), 1);
  assert.equal(user.lastSeenAt.toISOString(), "2026-10-05T03:01:01.000Z");
});

test("a successful new login records the time even inside the throttle window", async (t) => {
  const user = { id: "leader", isActive: true, lastSeenAt: new Date("2026-10-05T03:00:00Z") };
  mockUser(t, user);
  assert.equal((await recordUserActivity(user.id, new Date("2026-10-05T03:00:30Z"), true)).count, 1);
  assert.equal(user.lastSeenAt.toISOString(), "2026-10-05T03:00:30.000Z");
});

test("disabled users do not gain activity timestamps", async (t) => {
  const user = { id: "leader", isActive: false, lastSeenAt: null } as ActivityUser;
  mockUser(t, user);
  assert.equal((await recordUserActivity(user.id, new Date(), true)).count, 0);
  assert.equal(user.lastSeenAt, null);
});

test("an older delayed request cannot move the last visit backwards", async (t) => {
  const user = { id: "leader", isActive: true, lastSeenAt: new Date("2026-10-05T03:02:00Z") };
  mockUser(t, user);
  assert.equal((await recordUserActivity(user.id, new Date("2026-10-05T03:01:00Z"), true)).count, 0);
  assert.equal(user.lastSeenAt.toISOString(), "2026-10-05T03:02:00.000Z");
});
