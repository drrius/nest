// Create or refresh Nest's synthetic verification household on the hosted backend.
// Runs on the Mac (`nest-verify accounts`). Reads the server key from a file and never prints it
// or the passwords. Safe to rerun: existing users, household and memberships are reused.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SUPABASE = "https://tkjixmujjoustdiedfmw.supabase.co";
const API = "https://nest-test-api-drrius-projects.vercel.app";
const HOUSEHOLD = "Nest verification household";
const MEMBERS = [
  { role: "member", email: "nest-verify-alex@example.invalid", name: "Test Alex" },
  { role: "partner", email: "nest-verify-sam@example.invalid", name: "Test Sam" },
];
const home = homedir();
const keyFile = process.env.NEST_SUPABASE_SECRET_FILE ?? join(home, "Nest/supabase-secret.txt");
const configFile = process.env.NEST_VERIFY_XCCONFIG ?? join(home, "Nest/nest-local.xcconfig");
const output = join(home, "Library/Application Support/nest-verify/accounts.json");

function extract(file, pattern) {
  const value = readFileSync(file, "utf8").match(pattern)?.[0];
  if (!value) throw new Error(`no ${pattern.source.split("[")[0]} value in ${file}`);
  return value;
}

const secret = extract(keyFile, /sb_secret_[A-Za-z0-9_-]+/);
const publishable = extract(configFile, /sb_publishable_[A-Za-z0-9_-]+/);

async function request(url, { method = "GET", body, headers }) {
  const init = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    signal: AbortSignal.timeout(30000),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}

const admin = (path, options = {}) =>
  request(`${SUPABASE}${path}`, {
    ...options,
    headers: { apikey: secret, Prefer: "return=representation" },
  });

function savedPasswords() {
  if (!existsSync(output)) return {};
  const saved = JSON.parse(readFileSync(output, "utf8"));
  return Object.fromEntries(Object.values(saved).map((entry) => [entry.email, entry.password]));
}

async function ensureUser({ email }, passwords) {
  const { users } = await admin("/auth/v1/admin/users?page=1&per_page=1000");
  const existing = users.find((user) => user.email === email);
  if (existing && passwords[email]) return { id: existing.id, password: passwords[email] };
  const password = randomBytes(24).toString("base64url");
  if (existing) {
    await admin(`/auth/v1/admin/users/${existing.id}`, { method: "PUT", body: { password } });
    return { id: existing.id, password };
  }
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, user_metadata: { nest_verification: true } },
  });
  return { id: created.id, password };
}

async function ensureHousehold(userIds) {
  const name = encodeURIComponent(HOUSEHOLD);
  const [found] = await admin(`/rest/v1/households?name=eq.${name}&select=id`);
  const household =
    found ??
    (
      await admin("/rest/v1/households", {
        method: "POST",
        body: { name: HOUSEHOLD, timezone: "Europe/Zurich", currency: "CHF" },
      })
    )[0];
  const members = await admin(`/rest/v1/household_members?household_id=eq.${household.id}&select=user_id`);
  const strangers = members.filter((row) => !userIds.includes(row.user_id));
  if (strangers.length) throw new Error(`${HOUSEHOLD} has members outside the verification accounts`);
  return household.id;
}

async function ensureMembership(householdId, userId, name) {
  const rows = await admin(`/rest/v1/household_members?user_id=eq.${userId}&select=household_id`);
  if (rows.some((row) => row.household_id !== householdId)) {
    throw new Error(`${name} belongs to another household; refusing to continue`);
  }
  if (rows.length) return;
  await admin("/rest/v1/household_members", {
    method: "POST",
    body: { household_id: householdId, user_id: userId, display_name: name },
  });
}

async function verifySignIn(account) {
  const session = await request(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishable },
    body: { email: account.email, password: account.password },
  });
  const reply = await request(`${API}/v1/session`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const member = reply.member;
  if (member.userId !== account.actorId || member.householdId !== account.householdId) {
    throw new Error(`${account.name}: /v1/session returned a different member`);
  }
  if (member.displayName !== account.name) throw new Error(`${account.name}: unexpected display name`);
}

const passwords = savedPasswords();
const users = [];
for (const member of MEMBERS) users.push({ ...member, ...(await ensureUser(member, passwords)) });
const householdId = await ensureHousehold(users.map((user) => user.id));
const accounts = {};
for (const user of users) {
  await ensureMembership(householdId, user.id, user.name);
  accounts[user.role] = {
    actorId: user.id,
    householdId,
    email: user.email,
    password: user.password,
    name: user.name,
  };
}
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
chmodSync(output, 0o600);
for (const account of Object.values(accounts)) await verifySignIn(account);
console.log(`household ${householdId} (${HOUSEHOLD})`);
for (const [role, account] of Object.entries(accounts)) {
  console.log(`${role} ${account.actorId} ${account.name} <${account.email}> signs in and verifies`);
}
console.log(`credentials: ${output} (mode 600)`);
