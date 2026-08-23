import { describe, expect, it } from "vitest";
import { safeErrorMessage } from "./text.js";

describe("safeErrorMessage", () => {
  it("redacts image data URLs and configured secrets", () => {
    const message = safeErrorMessage(
      new Error("failed data:image/jpeg;base64,QUJDREVGRw== token-secret"),
      ["token-secret"],
    );
    expect(message).toContain("[REDACTED_IMAGE]");
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain("QUJDREVGRw");
    expect(message).not.toContain("token-secret");
  });
});
