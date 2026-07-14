import { describe, expect, it } from "vitest";

import {
  assertContentSampleReferencePair,
  ContentSampleReferenceError
} from "../apps/api/src/incubation/content-sample-reference";

describe("Content Sample shared references", () => {
  it("accepts either an unlinked sample or a complete Article and Snapshot pair", () => {
    expect(() => assertContentSampleReferencePair(null, null)).not.toThrow();
    expect(() => assertContentSampleReferencePair("article-1", "snapshot-1")).not.toThrow();
  });

  it("rejects an incomplete shared reference", () => {
    expect(() => assertContentSampleReferencePair("article-1", null)).toThrow(ContentSampleReferenceError);
    expect(() => assertContentSampleReferencePair(null, "snapshot-1")).toThrow(ContentSampleReferenceError);
  });
});
