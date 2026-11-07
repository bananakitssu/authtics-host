import type { RobotsConfig } from "./config.js";

function normalizeList(
  value: string | string[] | undefined,
  label: string,
): string[] {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];

  return values.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "" || /[\r\n]/.test(entry)) {
      throw new Error(`[HostJS] robots.${label} entries must be non-empty single-line strings.`);
    }
    return entry.trim();
  });
}

function normalizeRules(value: string[] | undefined, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`[HostJS] robots.${label} must be an array of URL paths.`);
  }

  return value.map((entry) => {
    if (
      typeof entry !== "string" ||
      !entry.startsWith("/") ||
      /[\r\n#]/.test(entry)
    ) {
      throw new Error(
        `[HostJS] Every robots.${label} entry must be a single-line path beginning with "/".`,
      );
    }
    return entry;
  });
}

function normalizeSitemaps(value: string | string[] | undefined): string[] {
  const entries = normalizeList(value, "sitemap");

  return entries.map((entry) => {
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error("[HostJS] robots.sitemap entries must be absolute HTTP(S) URLs.");
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("[HostJS] robots.sitemap entries must use HTTP or HTTPS.");
    }

    return entry;
  });
}

/**
 * Builds the contents served at /robots.txt.
 * A config object is opt-in; enabled:false leaves any static robots.txt untouched.
 */
export function createRobotsTxt(config: RobotsConfig): string {
  const userAgents = normalizeList(config.userAgent, "userAgent");
  const normalizedAgents = userAgents.length > 0 ? userAgents : ["*"];

  for (const agent of normalizedAgents) {
    if (!/^[A-Za-z0-9._*-]+$/.test(agent)) {
      throw new Error(
        "[HostJS] robots.userAgent entries may contain only letters, numbers, dots, underscores, hyphens, and asterisks.",
      );
    }
  }

  const allow = normalizeRules(config.allow, "allow");
  const disallow = normalizeRules(config.disallow, "disallow");
  const sitemaps = normalizeSitemaps(config.sitemap);

  const lines = normalizedAgents.map((agent) => `User-agent: ${agent}`);

  for (const rule of allow) lines.push(`Allow: ${rule}`);
  for (const rule of disallow) lines.push(`Disallow: ${rule}`);

  // An empty Disallow rule explicitly leaves the site crawlable by this group.
  if (allow.length === 0 && disallow.length === 0) {
    lines.push("Disallow:");
  }

  if (sitemaps.length > 0) {
    lines.push("");
    for (const sitemap of sitemaps) lines.push(`Sitemap: ${sitemap}`);
  }

  return `${lines.join("\n")}\n`;
}
