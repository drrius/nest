#!/usr/bin/env python3
"""Focused deployment-boundary checks; no Apple account, secrets or external service needed."""

import importlib.util
import sys
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("push_signing", Path(__file__).with_name("verify-native-push-signing.py"))
sys.dont_write_bytecode = True
SIGNING = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SIGNING)


class SigningTests(unittest.TestCase):
    def info(self, enabled="true", environment="development"):
        return {"CFBundleIdentifier": "ch.drrius.nest", "NEST_PUSH_ENABLED": enabled, "NEST_APNS_ENVIRONMENT": environment}

    def production(self):
        return {"aps-environment": "production", "get-task-allow": False,
                "com.apple.developer.team-identifier": "5ZKB6XKYFX", "application-identifier": "5ZKB6XKYFX.ch.drrius.nest",
                "com.apple.developer.applesignin": ["Default"]}

    def test_explicit_local_environment_and_disabled_build(self):
        self.assertEqual(SIGNING.validate(self.info(), {"aps-environment": "development"}), "enabled")
        self.assertEqual(SIGNING.validate(self.info("false"), {}), "disabled")

    def test_missing_wrong_or_inferred_environment_fails_closed(self):
        for info, entitlements in [
            (self.info(), {}), (self.info(), {"aps-environment": "production"}),
            (self.info("false"), {"aps-environment": "production"}),
            (self.info(environment="DEBUG"), {"aps-environment": "development"}),
            (self.info(environment="$(NEST_APNS_ENVIRONMENT)"), {}), (self.info(enabled=True), {}),
        ]:
            with self.subTest(info=info, entitlements=entitlements), self.assertRaises(SIGNING.SigningFailure):
                SIGNING.validate(info, entitlements)

    def test_distribution_requires_production_non_debug_exact_identity(self):
        info = self.info(environment="production")
        signed = self.production()
        self.assertEqual(SIGNING.validate(info, signed, testflight=True), "enabled")
        for changed in [
            {"aps-environment": "development"}, {"get-task-allow": True}, {"get-task-allow": "false"},
            {"application-identifier": "ABCDEFGHIJ.ch.drrius.other"}, {"com.apple.developer.team-identifier": None},
            {"com.apple.developer.team-identifier": "ABCDEFGHIJ", "application-identifier": "ABCDEFGHIJ.ch.drrius.nest"},
            {"com.apple.developer.applesignin": []}, {"com.apple.developer.applesignin": None},
        ]:
            with self.subTest(changed=changed), self.assertRaises(SIGNING.SigningFailure):
                SIGNING.validate(info, signed | changed, testflight=True)
        with self.assertRaises(SIGNING.SigningFailure):
            SIGNING.validate(self.info(), {"aps-environment": "development"}, testflight=True)


if __name__ == "__main__":
    unittest.main()
