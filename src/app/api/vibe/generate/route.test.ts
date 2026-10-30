import { describe, expect, it } from "vitest";
import { parseGeneratePayload } from "./route";

describe("advanced generator contract", () => {
  it("accepts moods without requiring genres and forwards explicit preference", () => {
    expect(parseGeneratePayload({ vibes: ["Chill"], trackCount: 20, includeExplicit: false })).toMatchObject({ ok: true, value: { vibes: ["Chill"], includeExplicit: false } });
  });
  it.each([null, [], { vibes: ["unknown"] }, { vibes: ["Chill"], trackCount: 0 }, { vibes: ["Chill"], includeExplicit: "false" }])("rejects invalid request %j", (value) => expect(parseGeneratePayload(value).ok).toBe(false));
});
