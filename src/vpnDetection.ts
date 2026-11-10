import { isIP } from "node:net";

export interface VPNInfo {
  isVPN: boolean | null;
  isProxy: boolean | null;
  isTor: boolean | null;
  isRelay: boolean | null;
  provider?: string;
}

interface IPinfoResponse {
  is_vpn?: unknown;
  is_proxy?: unknown;
  is_tor?: unknown;
  is_relay?: unknown;
  name?: unknown;
}

const CACHE_TTL = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL = 30 * 1000;
const MAX_CACHE_SIZE = 5000;

export const UNKNOWN_VPN_INFO: VPNInfo = {
  isVPN: null,
  isProxy: null,
  isTor: null,
  isRelay: null
};

const cache = new Map<
  string,
  { expires: number; data: VPNInfo }
>();

const pending = new Map<string, Promise<VPNInfo>>();

export async function detectVPN(
  ip: string,
  token: string
): Promise<VPNInfo> {
  if (!ip || isIP(ip) === 0) {
    return { ...UNKNOWN_VPN_INFO };
  }

  const cached = cache.get(ip);

  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  if (cached) cache.delete(ip);

  const existing = pending.get(ip);
  if (existing) return existing;

  const lookup = (async (): Promise<VPNInfo> => {
    try {
      const response = await fetch(
        `https://api.ipinfo.io/lookup/${encodeURIComponent(ip)}/anonymous`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
          },
          signal: AbortSignal.timeout(2500)
        }
      );

      if (!response.ok) {
        throw new Error(
          `IPinfo returned HTTP ${response.status}`
        );
      }

      const raw: unknown = await response.json();

      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Invalid IPinfo response");
      }

      const data = raw as IPinfoResponse;

      const result: VPNInfo = {
        isVPN: typeof data.is_vpn === "boolean"
          ? data.is_vpn : null,

        isProxy: typeof data.is_proxy === "boolean"
          ? data.is_proxy : null,

        isTor: typeof data.is_tor === "boolean"
          ? data.is_tor : null,

        isRelay: typeof data.is_relay === "boolean"
          ? data.is_relay : null,

        provider: typeof data.name === "string"
          ? data.name : undefined
      };

      store(ip, result, CACHE_TTL);
      return result;

    } catch (error) {
      console.warn("[HostJS] VPN detection failed:", error);

      const unknown = { ...UNKNOWN_VPN_INFO };

      store(ip, unknown, FAILURE_CACHE_TTL);
      return unknown;

    } finally {
      pending.delete(ip);
    }
  })();

  pending.set(ip, lookup);

  return lookup;
}

function store(
  ip: string,
  data: VPNInfo,
  ttl: number
): void {
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(ip)) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  cache.set(ip, {
    data,
    expires: Date.now() + ttl
  });
}
