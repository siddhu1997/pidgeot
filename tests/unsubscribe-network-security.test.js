import { describe, expect, it } from "vitest";

import {
  getUnsafeIpAddressReason,
  resolveAndValidateExecutionTarget,
  validateExecutionUrl,
} from "@/lib/unsubscribe/network-security";

describe("unsubscribe network security", () => {
  it("accepts a public https target and returns a pinned address", async () => {
    const result = await resolveAndValidateExecutionTarget("https://public.example/unsub", {
      resolveHostnameAddresses: async () => [
        { address: "93.184.216.34", family: 4 },
      ],
    });

    expect(result.hostname).toBe("public.example");
    expect(result.port).toBe("443");
    expect(result.selectedAddress).toEqual({
      address: "93.184.216.34",
      family: 4,
    });
  });

  it("rejects insecure schemes, embedded credentials, unsupported ports, and localhost-style hosts", () => {
    expect(() => validateExecutionUrl("http://public.example/unsub")).toThrow(/requires_https/);
    expect(() => validateExecutionUrl("https://user:pass@public.example/unsub")).toThrow(/embedded_credentials/);
    expect(() => validateExecutionUrl("https://public.example:8443/unsub")).toThrow(/unsupported_port/);
    expect(() => validateExecutionUrl("https://localhost/unsub")).toThrow(/unsafe_hostname/);
    expect(() => validateExecutionUrl("https://printer.local/unsub")).toThrow(/unsafe_hostname/);
  });

  it("rejects private, loopback, metadata, and mixed DNS answers", async () => {
    await expect(resolveAndValidateExecutionTarget("https://evil.example/unsub", {
      resolveHostnameAddresses: async () => [{ address: "127.0.0.1", family: 4 }],
    })).rejects.toMatchObject({ code: "unsubscribe_target_unsafe_ip" });

    await expect(resolveAndValidateExecutionTarget("https://metadata.example/unsub", {
      resolveHostnameAddresses: async () => [{ address: "169.254.169.254", family: 4 }],
    })).rejects.toMatchObject({ code: "unsubscribe_target_unsafe_ip" });

    await expect(resolveAndValidateExecutionTarget("https://mixed.example/unsub", {
      resolveHostnameAddresses: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
    })).rejects.toMatchObject({ code: "unsubscribe_target_unsafe_ip" });
  });

  it("rejects unsafe IPv6 and private IPv4-mapped IPv6 addresses", async () => {
    await expect(resolveAndValidateExecutionTarget("https://ipv6-loopback.example/unsub", {
      resolveHostnameAddresses: async () => [{ address: "::1", family: 6 }],
    })).rejects.toMatchObject({ code: "unsubscribe_target_unsafe_ip" });

    await expect(resolveAndValidateExecutionTarget("https://ipv6-link-local.example/unsub", {
      resolveHostnameAddresses: async () => [{ address: "fe80::1", family: 6 }],
    })).rejects.toMatchObject({ code: "unsubscribe_target_unsafe_ip" });

    await expect(resolveAndValidateExecutionTarget("https://ipv6-ula.example/unsub", {
      resolveHostnameAddresses: async () => [{ address: "fd00::1234", family: 6 }],
    })).rejects.toMatchObject({ code: "unsubscribe_target_unsafe_ip" });

    await expect(resolveAndValidateExecutionTarget("https://mapped.example/unsub", {
      resolveHostnameAddresses: async () => [{ address: "::ffff:192.168.1.4", family: 6 }],
    })).rejects.toMatchObject({ code: "unsubscribe_target_unsafe_ip" });
  });

  it("classifies well-known unsafe IP ranges directly", () => {
    expect(getUnsafeIpAddressReason("10.0.0.1")).toBeTruthy();
    expect(getUnsafeIpAddressReason("172.16.10.9")).toBeTruthy();
    expect(getUnsafeIpAddressReason("192.168.1.12")).toBeTruthy();
    expect(getUnsafeIpAddressReason("169.254.1.10")).toBeTruthy();
    expect(getUnsafeIpAddressReason("::1")).toBeTruthy();
    expect(getUnsafeIpAddressReason("fe80::1")).toBeTruthy();
    expect(getUnsafeIpAddressReason("fd00::5")).toBeTruthy();
    expect(getUnsafeIpAddressReason("93.184.216.34")).toBe(null);
  });

  it("distinguishes permanent and retryable DNS lookup failures", async () => {
    const permanentError = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    const retryableError = Object.assign(new Error("try again"), { code: "EAI_AGAIN" });

    await expect(resolveAndValidateExecutionTarget("https://missing.example/unsub", {
      resolveHostnameAddresses: async () => {
        throw permanentError;
      },
    })).rejects.toMatchObject({ code: "unsubscribe_dns_resolution_failed", retryable: false });

    await expect(resolveAndValidateExecutionTarget("https://flaky.example/unsub", {
      resolveHostnameAddresses: async () => {
        throw retryableError;
      },
    })).rejects.toMatchObject({ code: "unsubscribe_dns_resolution_failed", retryable: true });
  });
});