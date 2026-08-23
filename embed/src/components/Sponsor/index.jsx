import { isAllowedEmbedUrl } from "@/utils/urlAllowlist";

export default function Sponsor({ settings }) {
  if (!!settings.noSponsor) return null;
  const sponsorLink = isAllowedEmbedUrl(
    settings.sponsorLink,
    settings.allowExternalDomains
  )
    ? settings.sponsorLink
    : "#";

  return (
    <div className="allm-flex allm-w-full allm-items-center allm-justify-center">
      <a
        style={{ color: "#0119D9" }}
        href={sponsorLink}
        target="_blank"
        rel="noreferrer"
        className="allm-text-xs allm-font-sans hover:allm-opacity-80 hover:allm-underline"
      >
        {settings.sponsorText}
      </a>
    </div>
  );
}
