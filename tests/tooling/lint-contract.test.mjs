import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

function lint(source) {
  const dir = mkdtempSync("apps/mobile/src/tooling-probe-");
  try {
    const path = join(dir, "probe.tsx");
    writeFileSync(path, source);
    const result = spawnSync(
      "pnpm",
      ["exec", "oxlint", "--config", "apps/mobile/.oxlintrc.json", "--format", "json", path],
      { encoding: "utf8" },
    );
    assert.equal(result.signal, null, result.stderr);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("rejects files above 400 total lines", () => {
  const result = lint("// line\n".repeat(401) + "export const value = 1;\n");
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /max-lines/);
});

test("rejects functions above 80 code lines", () => {
  const result = lint(
    "export function long(value: number) {\n" + "value += 1;\n".repeat(81) + "return value;\n}\n",
  );
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /max-lines-per-function/);
});

test("rejects complexity above 10", () => {
  const branches = Array.from({ length: 11 }, (_, i) => `if (value === ${i}) return ${i};`).join(
    "\n",
  );
  const result = lint(`export function complex(value: number) {\n${branches}\nreturn -1;\n}\n`);
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /complexity/);
});

test("rejects raw native text and dynamic Expo environment access", () => {
  const result = lint(
    'import { View } from "react-native";\nexport const invalid = <View>Raw text</View>;\nexport const value = process.env["EXPO_PUBLIC_API_URL"];\n',
  );
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /no-raw-text/);
  assert.match(result.output, /no-dynamic-env-var/);
});

test("accepts a small native component with wrapped text", () => {
  const result = lint(
    'import { Text, View } from "react-native";\nexport function Greeting() { return <View><Text>Nest</Text></View>; }\n',
  );
  assert.equal(result.status, 0, result.output);
});

test("Effect integration rejects an unexecuted floating Effect", () => {
  const result = lint('import * as Effect from "effect/Effect";\nEffect.log("not executed");\n');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /floating-effect/);
});
