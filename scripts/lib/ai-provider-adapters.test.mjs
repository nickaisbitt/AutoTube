import test from "node:test";
import assert from "node:assert/strict";
import { createAiProviderAdapters } from "./ai-provider-adapters.mjs";

test("provider adapter factory exposes the four planning stages and visual generation", () => {
  const adapters = createAiProviderAdapters({ outputDir: "/tmp/documentary-test" });
  for (const stage of ["research", "script", "visual_bible", "shot_plan", "visual_generation"]) {
    assert.equal(typeof adapters[stage], "function", stage);
  }
});

test("provider configuration fails clearly when credentials are absent", async () => {
  const previous = {
    key: process.env.AI_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    chat: process.env.AI_CHAT_MODEL,
    image: process.env.AI_IMAGE_MODEL,
  };
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.AI_CHAT_MODEL = "test-chat";
  process.env.AI_IMAGE_MODEL = "test-image";
  try {
    const adapters = createAiProviderAdapters();
    await assert.rejects(
      () => adapters.research({ targetMinutes: 1 }, { title: "Test topic" }),
      /AI_API_KEY/,
    );
  } finally {
    if (previous.key === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previous.key;
    if (previous.openai === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.openai;
    if (previous.chat === undefined) delete process.env.AI_CHAT_MODEL; else process.env.AI_CHAT_MODEL = previous.chat;
    if (previous.image === undefined) delete process.env.AI_IMAGE_MODEL; else process.env.AI_IMAGE_MODEL = previous.image;
  }
});
