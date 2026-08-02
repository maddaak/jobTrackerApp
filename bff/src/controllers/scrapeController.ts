import type { Response } from "express";
import { scrape } from "../services/scrapeClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

// Handle every numeric IPv4 form the OS resolver accepts, not just dotted decimal: bare integer
// (2130706433), hex (0x7f000001), octal (0177.0.0.1), short forms (127.1). This is what lets the
// range check catch encodings a plain "127." string prefix would miss.
function parseIpv4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length > 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    let n: number;
    if (/^0x[0-9a-f]+$/.test(part)) n = parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8);
    else if (/^(0|[1-9][0-9]*)$/.test(part)) n = parseInt(part, 10);
    else return null;
    if (!Number.isSafeInteger(n)) return null;
    nums.push(n);
  }
  // inet_aton semantics: the final part fills every byte the earlier parts didn't.
  const last = nums[nums.length - 1];
  const leading = nums.slice(0, -1);
  if (last >= Math.pow(256, 4 - leading.length)) return null;
  if (leading.some(b => b > 255)) return null;
  let value = last;
  for (let i = 0; i < leading.length; i++) {
    value += leading[i] * Math.pow(256, 3 - i);
  }
  return value >>> 0;
}

function isPrivateIpv4(n: number): boolean {
  const a = (n >>> 24) & 0xff;
  const b = (n >>> 16) & 0xff;
  // 0.0.0.0/8, loopback 127/8, private 10/8, 172.16/12, 192.168/16, link-local 169.254/16.
  return (
    a === 0 ||
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

// Defense-in-depth SSRF guard: the scraper already refuses internal targets, this stops loopback,
// RFC1918, and link-local at the auth boundary. No DNS lookup (rebinding is still caught by the
// scraper), but we normalize numeric IPv4 and IPv4-mapped IPv6 so encodings can't slip past.
function pointsAtInternalHost(hostname: string): boolean {
  let host = hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }
  if (host.includes(":")) {
    // Unspecified and both loopback spellings would slip past the prefix checks below.
    if (host === "::" || host === "::1" || host === "0:0:0:0:0:0:0:1") {
      return true;
    }
    // IPv4-mapped IPv6 can smuggle a private/loopback IPv4 past the guard, dotted or as hex groups.
    if (host.includes(".")) {
      const embedded = parseIpv4(host.slice(host.lastIndexOf(":") + 1));
      if (embedded !== null && isPrivateIpv4(embedded)) return true;
    } else if (host.startsWith("::ffff:")) {
      const groups = host.slice("::ffff:".length).split(":");
      if (groups.length === 2 && groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) {
        const embedded = ((parseInt(groups[0], 16) << 16) | parseInt(groups[1], 16)) >>> 0;
        if (isPrivateIpv4(embedded)) return true;
      }
    }
    // Unique-local (fc00::/7) and the whole link-local range fe80::/10, not just literal fe80:.
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    return /^fe[89ab][0-9a-f]:/.test(host);
  }
  const ipv4 = parseIpv4(host);
  return ipv4 !== null && isPrivateIpv4(ipv4);
}

export async function create(req: AuthedRequest, res: Response) {
  const url = (req.body ?? {}).url as string | undefined;
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "url must be http or https" });
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    res.status(400).json({ error: "url must be http or https" });
    return;
  }
  if (pointsAtInternalHost(hostname)) {
    res.status(400).json({ error: "url host is not allowed" });
    return;
  }

  const result = await scrape(url);
  sendUpstream(res, result);
}
