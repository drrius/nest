#!/usr/bin/env python3
"""Enforce the repository's size and complexity budgets for Swift sources."""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "apps/ios/Nest"
TESTS = ROOT / "apps/ios/Tests"
FUNCTION = re.compile(r"(?m)^\s*(?:public |private |fileprivate |internal |static |class |override |final |nonisolated |convenience |required )*(?:func\s+\w+|init\b|deinit\b)")
BRANCH = re.compile(r"\b(?:if|guard|for|while|catch|case)\b|&&|\|\||\?\?")


def mask(text: str) -> str:
    """Erase comments and string contents while retaining braces and newlines."""
    output = list(text)
    index = 0
    while index < len(text):
        if text.startswith("//", index):
            end = text.find("\n", index)
            end = len(text) if end == -1 else end
        elif text.startswith("/*", index):
            end = text.find("*/", index + 2)
            end = len(text) if end == -1 else end + 2
        elif text[index] == '"':
            end = index + 1
            while end < len(text):
                if text[end] == "\\":
                    end += 2
                elif text[end] == '"':
                    end += 1
                    break
                else:
                    end += 1
        else:
            index += 1
            continue
        for position in range(index, min(end, len(text))):
            if output[position] != "\n":
                output[position] = " "
        index = end
    return "".join(output)


def function_bodies(source: str):
    for match in FUNCTION.finditer(source):
        start = source.find("{", match.end())
        if start == -1:
            continue
        depth = 1
        end = start + 1
        while end < len(source) and depth:
            depth += (source[end] == "{") - (source[end] == "}")
            end += 1
        if depth == 0:
            yield match, source[start:end]


def check(path: Path) -> list[str]:
    content = path.read_text()
    relative = path.relative_to(ROOT)
    findings = []
    lines = len(content.splitlines())
    if lines > 400:
        findings.append(f"{relative}: {lines} lines exceeds 400")
    if TESTS in path.parents:
        return findings
    for match, body in function_bodies(mask(content)):
        location = content[:match.start()].count("\n") + 1
        code_lines = sum(bool(line.strip()) for line in body.splitlines())
        complexity = 1 + len(BRANCH.findall(body))
        if code_lines > 80:
            findings.append(f"{relative}:{location}: function has {code_lines} code lines (max 80)")
        if complexity > 10:
            findings.append(f"{relative}:{location}: complexity {complexity} exceeds 10")
    return findings


def main() -> int:
    findings = [item for root in (SOURCES, TESTS) for path in root.rglob("*.swift") for item in check(path)]
    if findings:
        print("\n".join(findings))
        return 1
    print("Swift source limits: passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
