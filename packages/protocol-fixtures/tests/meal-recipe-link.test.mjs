import assert from "node:assert/strict";
import { test } from "node:test";
import { recipeSourceUrl } from "../src/meals/recipe-link.ts";

test("recipe source links allow only explicit web URLs, never legacy schemes or embedded credentials", () => {
  assert.equal(
    recipeSourceUrl("https://example.com/recipe?servings=2#steps"),
    "https://example.com/recipe?servings=2#steps",
  );
  assert.equal(recipeSourceUrl("HTTP://EXAMPLE.COM/recipe"), "http://example.com/recipe");
  for (const value of [
    null,
    "",
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///private/recipe",
    "nest://settings",
    "mailto:owner@example.com",
    "//example.com/recipe",
    "example.com/recipe",
    "https://user:secret@example.com",
    "https://user@example.com",
    "https:\n//example.com",
    " https://example.com",
    "https://example.com/path with spaces",
    "https://",
  ]) {
    assert.equal(recipeSourceUrl(value), null, String(value));
  }
});
