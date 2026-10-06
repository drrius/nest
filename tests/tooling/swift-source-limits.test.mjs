import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function check(source) {
  const script = `
import importlib.util,json,sys,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('limits','scripts/check-swift-limits.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
source=sys.stdin.read()
with tempfile.TemporaryDirectory(prefix='nest-swift-limits-') as directory:
    module.ROOT=Path(directory)
    module.TESTS=module.ROOT/'Tests'
    module.APP_TESTS=module.ROOT/'AppTests'
    results={}
    for role in ['Nest','Tests','AppTests','UITests']:
        path=module.ROOT/role/'Probe.swift'
        path.parent.mkdir()
        path.write_text(source)
        results[role]=module.check(path)
    print(json.dumps(results))
`;
  const result = spawnSync("python3", ["-c", script], { input: source, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("Swift shipping and test files enforce the 400-line limit", () => {
  for (const [role, findings] of Object.entries(check("// line\n".repeat(401)))) {
    assert.ok(
      findings.some((finding) => finding.includes("exceeds 400")),
      role,
    );
  }
});

test("Swift shipping and test functions enforce the 80-code-line limit", () => {
  const body = Array.from({ length: 81 }, (_, i) => `let value${i} = ${i}`).join("\n");
  for (const [role, findings] of Object.entries(check(`func long() {\n${body}\n}\n`))) {
    assert.ok(
      findings.some((finding) => finding.includes("max 80")),
      role,
    );
  }
});

test("Swift shipping and test functions enforce complexity 10", () => {
  const body = Array.from({ length: 11 }, (_, i) => `if value == ${i} { return }`).join("\n");
  for (const [role, findings] of Object.entries(check(`func branch(value: Int) {\n${body}\n}\n`))) {
    assert.ok(
      findings.some((finding) => finding.includes("exceeds 10")),
      role,
    );
  }
});
