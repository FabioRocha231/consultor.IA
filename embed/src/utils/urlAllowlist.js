export function isAllowedEmbedUrl(url = "", allowlist = []) {
  if (!url || typeof url !== "string") return false;

  try {
    const base = window.location.href;
    const parsed = new URL(url, base);
    if (parsed.origin === window.location.origin) return true;

    const hostname = parsed.hostname.toLowerCase();
    return allowlist.some((domain) => {
      const normalized = String(domain).trim().toLowerCase().replace(/^\.+/, "");
      return (
        normalized !== "" &&
        (hostname === normalized || hostname.endsWith(`.${normalized}`))
      );
    });
  } catch {
    return false;
  }
}
