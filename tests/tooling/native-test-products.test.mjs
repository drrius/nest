import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function verify(mode) {
  const script = `
import importlib.util,json,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('products','scripts/resolve-native-test-products.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='nest-products-') as folder:
    root=Path(folder)/'Build/Products';root.mkdir(parents=True)
    host=root/'Debug/Nest.app';bundle=host/'PlugIns/NestAppTests.xctest'
    bundle.mkdir(parents=True)
    outside=Path(folder)/'outside';outside.mkdir()
    plan={'NestAppTests':{'TestHostPath':'__TESTROOT__/Debug/Nest.app','TestBundlePath':'__TESTHOST__/PlugIns/NestAppTests.xctest'},'Unselected':{'TestHostPath':'/system/xctest'}}
    if '${mode}'=='escape':plan['NestAppTests']['TestBundlePath']=str(outside)
    if '${mode}'=='missing':plan['NestAppTests']['TestBundlePath']='__TESTHOST__/missing'
    if '${mode}'=='placeholder':plan['NestAppTests']['TestBundlePath']='__UNKNOWN__/bundle'
    try:
        result=module.selected_products(plan,'NestAppTests',root)
        print(json.dumps({'passed':True,'bundleMatches':result['TestBundlePath']==str(bundle)}))
    except (ValueError,FileNotFoundError):print(json.dumps({'passed':False}))
`;
  const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("selected products resolve nested host placeholders and ignore unselected runners", () => {
  assert.deepEqual(verify("valid"), { passed: true, bundleMatches: true });
});

for (const mode of ["escape", "missing", "placeholder"]) {
  test(`selected products refuse ${mode} paths`, () => {
    assert.equal(verify(mode).passed, false);
  });
}
