#!/usr/bin/env python3
"""Validate public push configuration against the entitlements of the actual signed app."""

from __future__ import annotations

import argparse
import plistlib
import subprocess
import sys
from pathlib import Path


class SigningFailure(ValueError):
    pass


def validate(info: dict, entitlements: dict, testflight: bool = False) -> str:
    enabled = info.get("NEST_PUSH_ENABLED")
    if enabled not in ("true", "false"):
        raise SigningFailure("NEST_PUSH_ENABLED must be explicitly true or false")
    configured = info.get("NEST_APNS_ENVIRONMENT")
    if configured not in ("development", "production"):
        raise SigningFailure("An explicit Apple APNs environment is required")
    actual = entitlements.get("aps-environment")
    if actual is not None and actual != configured:
        raise SigningFailure("Signed aps-environment differs from the app configuration")
    if enabled == "true" and actual != configured:
        raise SigningFailure("Push-enabled apps require matching signed aps-environment")
    if testflight:
        validate_distribution(info, entitlements, configured, actual)
    return "enabled" if enabled == "true" else "disabled"


def validate_distribution(info: dict, entitlements: dict, configured: str, actual: str | None) -> None:
    if configured != "production" or actual != "production":
        raise SigningFailure("TestFlight requires the signed production APNs environment")
    if entitlements.get("get-task-allow", False) is not False:
        raise SigningFailure("TestFlight signing cannot allow debugging")
    team = entitlements.get("com.apple.developer.team-identifier")
    bundle = info.get("CFBundleIdentifier")
    application = entitlements.get("application-identifier")
    if team != "5ZKB6XKYFX":
        raise SigningFailure("Distribution must use Nest's approved Apple team")
    if bundle != "ch.drrius.nest" or application != f"{team}.{bundle}":
        raise SigningFailure("Signed application/team identity must match Nest")
    if entitlements.get("com.apple.developer.applesignin") != ["Default"]:
        raise SigningFailure("Distribution requires Nest's Apple Sign In entitlement")


def signed_entitlements(app: Path) -> dict:
    verified = subprocess.run(
        ["codesign", "--verify", "--strict", str(app)], capture_output=True, check=False, timeout=30,
    )
    if verified.returncode != 0:
        raise SigningFailure("App code signature verification failed")
    result = subprocess.run(
        ["codesign", "--display", "--entitlements", ":-", str(app)],
        capture_output=True, check=False, timeout=30,
    )
    if result.returncode != 0:
        raise SigningFailure("Could not inspect app signing")
    # codesign diagnostics use stderr; never echo signing material or plist contents.
    if not result.stdout.strip():
        return {}
    try:
        value = plistlib.loads(result.stdout)
    except (plistlib.InvalidFileException, ValueError) as error:
        raise SigningFailure("Malformed signed entitlements") from error
    if not isinstance(value, dict):
        raise SigningFailure("Signed entitlements must be a dictionary")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path)
    parser.add_argument("--testflight", action="store_true")
    args = parser.parse_args()
    try:
        with (args.app / "Info.plist").open("rb") as handle:
            info = plistlib.load(handle)
        if not isinstance(info, dict):
            raise SigningFailure("App Info.plist must be a dictionary")
        state = validate(info, signed_entitlements(args.app), args.testflight)
    except SigningFailure as error:
        print(f"Native push signing verification failed: {error}.", file=sys.stderr)
        return 1
    except (OSError, ValueError, subprocess.TimeoutExpired):
        # Deliberately omit external command output and arbitrary file contents.
        print("Native push signing verification failed; inspect the app configuration and signed entitlements.", file=sys.stderr)
        return 1
    print(f"Native push signing: passed ({state}; {'TestFlight distribution' if args.testflight else 'local build'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
