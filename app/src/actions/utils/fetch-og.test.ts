import { describe, expect, it } from "vitest";
import { fetchOgImageAction, validateDestinationSafety } from "./fetch-og";

describe("fetch-og SSRF protection & image extraction", () => {
  describe("validateDestinationSafety", () => {
    it("rejects loopback IPv4 addresses", async () => {
      expect(await validateDestinationSafety(new URL("http://127.0.0.1"))).toBe(
        false,
      );
      expect(await validateDestinationSafety(new URL("http://127.0.0.2"))).toBe(
        false,
      );
    });

    it("rejects private RFC 1918 subnets", async () => {
      expect(await validateDestinationSafety(new URL("http://10.0.0.1"))).toBe(
        false,
      );
      expect(
        await validateDestinationSafety(new URL("http://172.16.0.1")),
      ).toBe(false);
      expect(
        await validateDestinationSafety(new URL("http://172.31.255.255")),
      ).toBe(false);
      expect(
        await validateDestinationSafety(new URL("http://192.168.1.1")),
      ).toBe(false);
    });

    it("rejects cloud metadata link-local address", async () => {
      expect(
        await validateDestinationSafety(new URL("http://169.254.169.254")),
      ).toBe(false);
    });

    it("rejects loopback hostname and special internal suffixes", async () => {
      expect(await validateDestinationSafety(new URL("http://localhost"))).toBe(
        false,
      );
      expect(
        await validateDestinationSafety(new URL("http://app.localhost")),
      ).toBe(false);
      expect(
        await validateDestinationSafety(new URL("http://myservice.local")),
      ).toBe(false);
      expect(
        await validateDestinationSafety(new URL("http://db.internal")),
      ).toBe(false);
    });

    it("rejects IPv6 loopback", async () => {
      expect(await validateDestinationSafety(new URL("http://[::1]"))).toBe(
        false,
      );
    });
  });

  describe("fetchOgImageAction", () => {
    it("rejects loopback and private IP requests without making network calls", async () => {
      const res = await fetchOgImageAction("http://127.0.0.1:4000/healthz");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Target address is not permitted");
      }
    });

    it("rejects cloud metadata endpoint requests", async () => {
      const res = await fetchOgImageAction(
        "http://169.254.169.254/latest/meta-data/",
      );
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Target address is not permitted");
      }
    });

    it("rejects localhost requests", async () => {
      const res = await fetchOgImageAction("http://localhost:3000/api");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Target address is not permitted");
      }
    });

    it("rejects non-http/https URL schemes", async () => {
      const res = await fetchOgImageAction("javascript:alert(1)");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Invalid URL provided");
      }
    });

    it("rejects URLs with embedded credentials", async () => {
      const res = await fetchOgImageAction("http://admin:secret@example.com");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe("Invalid URL provided");
      }
    });
  });
});
