import { STELLAR_LOGO_URL, USDC_LOGO_URL } from "@/lib/stellar-assets";

/** Partner logos for the hero “Built with” strip (CoinGecko CDN where available). */
export const HERO_BUILT_WITH_PARTNERS = [
  {
    name: "Circle",
    logoSrc: USDC_LOGO_URL,
    logoAlt: "Circle USDC",
    rounded: true,
  },
  {
    name: "Stellar",
    logoSrc: STELLAR_LOGO_URL,
    logoAlt: "Stellar",
    rounded: true,
  },
  {
    name: "Soroban",
    /** Soroban is not listed on CoinGecko; Stellar smart-contract platform mark. */
    logoSrc: "/partners/soroban-color.svg",
    logoAlt: "Soroban",
    rounded: true,
  },
  {
    name: "MoneyGram",
    logoSrc: "/partners/moneygram.png",
    logoAlt: "MoneyGram",
    wide: true,
  },
] as const;
