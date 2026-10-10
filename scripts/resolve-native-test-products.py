#!/usr/bin/env python3
"""Resolve only selected xctestrun product paths without exposing test environments."""

from pathlib import Path


def selected_products(plan, suite, products):
    root = Path(products).resolve(strict=True)
    target = plan[suite]
    host = target["TestHostPath"].replace("__TESTROOT__", str(root))
    resolved = {}
    for field in ("TestHostPath", "TestBundlePath", "UITargetAppPath"):
        if field not in target:
            continue
        value = target[field].replace("__TESTROOT__", str(root)).replace("__TESTHOST__", host)
        if "__" in value:
            raise ValueError("Unresolved selected product placeholder")
        path = Path(value).resolve(strict=True)
        if not path.is_relative_to(root):
            raise ValueError("Selected test product escapes its build directory")
        resolved[field] = str(path)
    if "TestBundlePath" not in resolved:
        raise ValueError("Selected suite has no test bundle")
    return resolved
