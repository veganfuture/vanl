import { describe, expect, it } from "vitest";
import { generateOtpCode, hashOtpCode } from "./otp";

describe("generateOtpCode", () => {
  it("always produces a zero-padded 6-digit string", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashOtpCode", () => {
  it("is deterministic and does not just echo the input", () => {
    expect(hashOtpCode("1234")).toBe(hashOtpCode("1234"));
    expect(hashOtpCode("1234")).not.toBe("1234");
    expect(hashOtpCode("1234")).not.toBe(hashOtpCode("4321"));
  });
});
