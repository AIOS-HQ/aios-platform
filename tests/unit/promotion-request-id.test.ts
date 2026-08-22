import { describe, expect, it } from "vitest";
import {
  M5_BOOTSTRAP_PROMOTION_REQUEST_ID,
  M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE,
  assertPromotionRequestIdMatchesDerived,
  derivePromotionRequestId,
} from "../../src/lib/promotion/request-id";

describe("promotion request id derivation", () => {
  it("derives the canonical M5 request id from immutable governed tuple", () => {
    const derived = derivePromotionRequestId(M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE);
    expect(derived).toBe("promotion-request:6c99fe3e86a4c298511351e98741f5d528172cd1bfc6f9ad2a213ce4e7842eb6");
    expect(M5_BOOTSTRAP_PROMOTION_REQUEST_ID).toBe(derived);
  });

  it("fails closed when a supplied request id does not match the derived id", () => {
    expect(() =>
      assertPromotionRequestIdMatchesDerived(
        "promotion-request:6961a7a485ea1eec6927964cd6b56700a0c3ae930c3ff72d927cc71f7adb5b8a",
        M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE,
      ),
    ).toThrow("promotion_request_id_mismatch");
  });

  it("accepts only the exact derived request id", () => {
    expect(
      assertPromotionRequestIdMatchesDerived(
        M5_BOOTSTRAP_PROMOTION_REQUEST_ID,
        M5_BOOTSTRAP_PROMOTION_REQUEST_TUPLE,
      ),
    ).toBe(M5_BOOTSTRAP_PROMOTION_REQUEST_ID);
  });
});
