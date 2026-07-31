export type JurisdictionId =
  | "india"
  | "singapore"
  | "usa"
  | "eu"
  | "uae"
  | "middle_east"
  | "japan"
  | "china"
  | "russia"
  | "australia";

export type RegulatorySource = {
  name: string;
  authorityType:
    | "central_bank"
    | "securities_regulator"
    | "company_registry"
    | "tax_authority"
    | "data_protection"
    | "aml_cft"
    | "virtual_asset_regulator"
    | "consumer_protection"
    | "other";
  url: string;
  description: string;
  relevance: string[];
};

export type JurisdictionKnowledgeBase = {
  id: JurisdictionId;
  name: string;
  region: string;
  sources: RegulatorySource[];
  defaultComplianceAreas: string[];
};

const TAGS = {
  payments: "payments",
  stablecoins: "stablecoins",
  fintech: "fintech",
  crypto: "crypto",
  aml: "aml",
  kyc: "kyc",
  dataPrivacy: "data_privacy",
  companyRegistration: "company_registration",
  tax: "tax",
  securities: "securities",
  consumerProtection: "consumer_protection",
} as const;

export const JURISDICTION_KNOWLEDGE_BASE: Record<JurisdictionId, JurisdictionKnowledgeBase> = {
  india: {
    id: "india",
    name: "India",
    region: "South Asia",
    defaultComplianceAreas: ["payments", "aml", "kyc", "company_registration", "tax", "data_privacy"],
    sources: [
      {
        name: "Reserve Bank of India",
        authorityType: "central_bank",
        url: "https://www.rbi.org.in/",
        description: "Central bank guidance for payments, prepaid instruments, forex, and regulated financial activity.",
        relevance: [TAGS.payments, TAGS.fintech, TAGS.stablecoins, TAGS.aml, TAGS.consumerProtection],
      },
      {
        name: "Ministry of Corporate Affairs",
        authorityType: "company_registry",
        url: "https://www.mca.gov.in/",
        description: "Company incorporation, filings, beneficial ownership, and corporate governance requirements.",
        relevance: [TAGS.companyRegistration, TAGS.consumerProtection],
      },
      {
        name: "FIU-IND",
        authorityType: "aml_cft",
        url: "https://fiuindia.gov.in/",
        description: "AML/CFT reporting and suspicious transaction obligations for reporting entities.",
        relevance: [TAGS.aml, TAGS.kyc, TAGS.crypto, TAGS.payments],
      },
      {
        name: "Securities and Exchange Board of India",
        authorityType: "securities_regulator",
        url: "https://www.sebi.gov.in/",
        description: "Securities, investment products, market intermediaries, and investor protection guidance.",
        relevance: [TAGS.securities, TAGS.fintech, TAGS.consumerProtection],
      },
      {
        name: "Income Tax Department",
        authorityType: "tax_authority",
        url: "https://www.incometax.gov.in/",
        description: "Direct tax registration, reporting, withholding, and compliance references.",
        relevance: [TAGS.tax, TAGS.companyRegistration],
      },
      {
        name: "Goods and Services Tax Portal",
        authorityType: "tax_authority",
        url: "https://www.gst.gov.in/",
        description: "GST registration, filing, invoicing, and indirect tax compliance.",
        relevance: [TAGS.tax, TAGS.payments],
      },
      {
        name: "Digital Personal Data Protection Act resources",
        authorityType: "data_protection",
        url: "https://www.meity.gov.in/data-protection-framework",
        description: "Data protection framework and privacy obligations for digital businesses.",
        relevance: [TAGS.dataPrivacy, TAGS.kyc, TAGS.fintech],
      },
    ],
  },
  singapore: {
    id: "singapore",
    name: "Singapore",
    region: "Southeast Asia",
    defaultComplianceAreas: ["payments", "aml", "kyc", "company_registration", "tax", "data_privacy"],
    sources: [
      {
        name: "Monetary Authority of Singapore",
        authorityType: "central_bank",
        url: "https://www.mas.gov.sg/",
        description: "Financial services, Payment Services Act, AML/CFT, digital payment token, and stablecoin guidance.",
        relevance: [TAGS.payments, TAGS.fintech, TAGS.crypto, TAGS.stablecoins, TAGS.aml, TAGS.kyc],
      },
      {
        name: "Accounting and Corporate Regulatory Authority",
        authorityType: "company_registry",
        url: "https://www.acra.gov.sg/",
        description: "Business registration, corporate filings, and beneficial ownership obligations.",
        relevance: [TAGS.companyRegistration],
      },
      {
        name: "Inland Revenue Authority of Singapore",
        authorityType: "tax_authority",
        url: "https://www.iras.gov.sg/",
        description: "Corporate tax, GST, withholding, and tax guidance for Singapore businesses.",
        relevance: [TAGS.tax],
      },
      {
        name: "Personal Data Protection Commission",
        authorityType: "data_protection",
        url: "https://www.pdpc.gov.sg/",
        description: "Personal Data Protection Act guidance and privacy compliance resources.",
        relevance: [TAGS.dataPrivacy, TAGS.kyc],
      },
      {
        name: "Singapore Statutes Online",
        authorityType: "other",
        url: "https://sso.agc.gov.sg/",
        description: "Official legislation source for Singapore statutory requirements.",
        relevance: [TAGS.fintech, TAGS.payments, TAGS.aml, TAGS.companyRegistration],
      },
    ],
  },
  usa: {
    id: "usa",
    name: "United States",
    region: "North America",
    defaultComplianceAreas: ["payments", "aml", "kyc", "securities", "tax", "consumer_protection"],
    sources: [
      {
        name: "Financial Crimes Enforcement Network",
        authorityType: "aml_cft",
        url: "https://www.fincen.gov/",
        description: "BSA/AML guidance, MSB registration, beneficial ownership, and reporting requirements.",
        relevance: [TAGS.aml, TAGS.kyc, TAGS.payments, TAGS.crypto, TAGS.stablecoins],
      },
      {
        name: "U.S. Securities and Exchange Commission",
        authorityType: "securities_regulator",
        url: "https://www.sec.gov/",
        description: "Securities laws, registration, investor protection, and crypto-asset enforcement guidance.",
        relevance: [TAGS.securities, TAGS.crypto, TAGS.consumerProtection],
      },
      {
        name: "Commodity Futures Trading Commission",
        authorityType: "securities_regulator",
        url: "https://www.cftc.gov/",
        description: "Derivatives, commodities, and digital asset market oversight resources.",
        relevance: [TAGS.crypto, TAGS.securities, TAGS.consumerProtection],
      },
      {
        name: "Office of Foreign Assets Control",
        authorityType: "aml_cft",
        url: "https://ofac.treasury.gov/",
        description: "Sanctions screening, SDN lists, and restricted party compliance resources.",
        relevance: [TAGS.aml, TAGS.kyc, TAGS.payments, TAGS.crypto],
      },
      {
        name: "Internal Revenue Service",
        authorityType: "tax_authority",
        url: "https://www.irs.gov/",
        description: "Federal tax reporting, withholding, information returns, and digital asset tax references.",
        relevance: [TAGS.tax, TAGS.crypto, TAGS.companyRegistration],
      },
      {
        name: "NMLS Resource Center",
        authorityType: "other",
        url: "https://mortgage.nationwidelicensingsystem.org/",
        description: "State licensing resources, including money transmitter licensing references.",
        relevance: [TAGS.payments, TAGS.fintech, TAGS.consumerProtection],
      },
    ],
  },
  eu: {
    id: "eu",
    name: "European Union",
    region: "Europe",
    defaultComplianceAreas: ["payments", "crypto", "stablecoins", "aml", "data_privacy", "securities"],
    sources: [
      {
        name: "European Banking Authority",
        authorityType: "central_bank",
        url: "https://www.eba.europa.eu/",
        description: "EU banking, payments, AML/CFT, and crypto-asset supervisory resources.",
        relevance: [TAGS.payments, TAGS.aml, TAGS.crypto, TAGS.stablecoins],
      },
      {
        name: "European Securities and Markets Authority",
        authorityType: "securities_regulator",
        url: "https://www.esma.europa.eu/",
        description: "EU securities markets, MiCA implementation, and investor protection guidance.",
        relevance: [TAGS.securities, TAGS.crypto, TAGS.stablecoins, TAGS.consumerProtection],
      },
      {
        name: "European Commission MiCA resources",
        authorityType: "virtual_asset_regulator",
        url: "https://finance.ec.europa.eu/digital-finance/crypto-assets_en",
        description: "Markets in Crypto-Assets Regulation resources and EU digital finance policy.",
        relevance: [TAGS.crypto, TAGS.stablecoins, TAGS.fintech],
      },
      {
        name: "European Data Protection Board",
        authorityType: "data_protection",
        url: "https://www.edpb.europa.eu/",
        description: "GDPR guidance, privacy decisions, and data protection interpretation.",
        relevance: [TAGS.dataPrivacy, TAGS.kyc],
      },
      {
        name: "EU AML/CFT policy",
        authorityType: "aml_cft",
        url: "https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism_en",
        description: "EU AML/CFT package, policy updates, and supervisory architecture.",
        relevance: [TAGS.aml, TAGS.kyc, TAGS.payments, TAGS.crypto],
      },
    ],
  },
  uae: {
    id: "uae",
    name: "United Arab Emirates",
    region: "Middle East",
    defaultComplianceAreas: ["payments", "crypto", "aml", "company_registration", "tax"],
    sources: [
      {
        name: "Central Bank of the UAE",
        authorityType: "central_bank",
        url: "https://www.centralbank.ae/",
        description: "Banking, stored value, payment services, AML, and financial services regulation.",
        relevance: [TAGS.payments, TAGS.fintech, TAGS.aml, TAGS.kyc, TAGS.stablecoins],
      },
      {
        name: "Dubai Virtual Assets Regulatory Authority",
        authorityType: "virtual_asset_regulator",
        url: "https://vara.ae/",
        description: "Dubai virtual asset licensing, rulebooks, and supervisory expectations.",
        relevance: [TAGS.crypto, TAGS.stablecoins, TAGS.aml, TAGS.kyc],
      },
      {
        name: "ADGM Financial Services Regulatory Authority",
        authorityType: "securities_regulator",
        url: "https://www.adgm.com/operating-in-adgm/financial-services-regulatory-authority",
        description: "ADGM financial services and virtual asset regulatory framework.",
        relevance: [TAGS.fintech, TAGS.crypto, TAGS.securities, TAGS.aml],
      },
      {
        name: "Dubai Financial Services Authority",
        authorityType: "securities_regulator",
        url: "https://www.dfsa.ae/",
        description: "DIFC financial services regulation and conduct requirements.",
        relevance: [TAGS.fintech, TAGS.securities, TAGS.consumerProtection],
      },
      {
        name: "UAE Ministry of Economy",
        authorityType: "company_registry",
        url: "https://www.moec.gov.ae/",
        description: "Business, company registration, consumer protection, and commercial regulation resources.",
        relevance: [TAGS.companyRegistration, TAGS.consumerProtection],
      },
    ],
  },
  middle_east: {
    id: "middle_east",
    name: "Middle East",
    region: "Middle East",
    defaultComplianceAreas: ["payments", "crypto", "aml", "company_registration"],
    sources: [
      {
        name: "Central Bank of the UAE",
        authorityType: "central_bank",
        url: "https://www.centralbank.ae/",
        description: "Regional reference for UAE financial services, AML, and payments regulation.",
        relevance: [TAGS.payments, TAGS.fintech, TAGS.aml, TAGS.kyc],
      },
      {
        name: "Dubai Virtual Assets Regulatory Authority",
        authorityType: "virtual_asset_regulator",
        url: "https://vara.ae/",
        description: "Virtual asset licensing and supervisory framework for Dubai.",
        relevance: [TAGS.crypto, TAGS.stablecoins, TAGS.aml],
      },
      {
        name: "ADGM FSRA",
        authorityType: "securities_regulator",
        url: "https://www.adgm.com/operating-in-adgm/financial-services-regulatory-authority",
        description: "Financial services and virtual asset regulation in Abu Dhabi Global Market.",
        relevance: [TAGS.fintech, TAGS.crypto, TAGS.securities],
      },
      {
        name: "Dubai Financial Services Authority",
        authorityType: "securities_regulator",
        url: "https://www.dfsa.ae/",
        description: "Financial services regulator for DIFC.",
        relevance: [TAGS.fintech, TAGS.securities, TAGS.consumerProtection],
      },
    ],
  },
  japan: {
    id: "japan",
    name: "Japan",
    region: "East Asia",
    defaultComplianceAreas: ["payments", "crypto", "aml", "data_privacy", "tax"],
    sources: [
      {
        name: "Financial Services Agency Japan",
        authorityType: "securities_regulator",
        url: "https://www.fsa.go.jp/en/",
        description: "Financial services, crypto-asset exchange, payment services, and AML resources.",
        relevance: [TAGS.payments, TAGS.crypto, TAGS.stablecoins, TAGS.aml, TAGS.securities],
      },
      {
        name: "Japan Virtual and Crypto assets Exchange Association",
        authorityType: "virtual_asset_regulator",
        url: "https://jvcea.or.jp/",
        description: "Self-regulatory rules and operational expectations for crypto asset exchanges.",
        relevance: [TAGS.crypto, TAGS.aml, TAGS.kyc, TAGS.consumerProtection],
      },
      {
        name: "Personal Information Protection Commission",
        authorityType: "data_protection",
        url: "https://www.ppc.go.jp/en/",
        description: "Personal data protection guidance and APPI compliance resources.",
        relevance: [TAGS.dataPrivacy, TAGS.kyc],
      },
      {
        name: "National Tax Agency Japan",
        authorityType: "tax_authority",
        url: "https://www.nta.go.jp/english/",
        description: "Tax registration, reporting, and digital asset tax guidance.",
        relevance: [TAGS.tax, TAGS.crypto, TAGS.companyRegistration],
      },
    ],
  },
  china: {
    id: "china",
    name: "China",
    region: "East Asia",
    defaultComplianceAreas: ["payments", "data_privacy", "company_registration", "tax", "consumer_protection"],
    sources: [
      {
        name: "People's Bank of China",
        authorityType: "central_bank",
        url: "https://www.pbc.gov.cn/en/",
        description: "Central bank resources for payments, financial stability, and monetary regulation.",
        relevance: [TAGS.payments, TAGS.fintech, TAGS.consumerProtection],
      },
      {
        name: "Cyberspace Administration of China",
        authorityType: "data_protection",
        url: "https://www.cac.gov.cn/",
        description: "Cybersecurity, data, and platform governance resources.",
        relevance: [TAGS.dataPrivacy, TAGS.consumerProtection],
      },
      {
        name: "State Administration for Market Regulation",
        authorityType: "company_registry",
        url: "https://www.samr.gov.cn/",
        description: "Market supervision, business registration, and consumer protection resources.",
        relevance: [TAGS.companyRegistration, TAGS.consumerProtection],
      },
      {
        name: "State Taxation Administration",
        authorityType: "tax_authority",
        url: "https://www.chinatax.gov.cn/eng/",
        description: "Tax registration, compliance, and filing references.",
        relevance: [TAGS.tax, TAGS.companyRegistration],
      },
    ],
  },
  russia: {
    id: "russia",
    name: "Russia",
    region: "Eurasia",
    defaultComplianceAreas: ["payments", "crypto", "data_privacy", "tax", "company_registration"],
    sources: [
      {
        name: "Central Bank of Russia",
        authorityType: "central_bank",
        url: "https://www.cbr.ru/eng/",
        description: "Financial services, payment systems, and digital financial asset regulatory resources.",
        relevance: [TAGS.payments, TAGS.fintech, TAGS.crypto, TAGS.consumerProtection],
      },
      {
        name: "Roskomnadzor",
        authorityType: "data_protection",
        url: "https://rkn.gov.ru/",
        description: "Personal data, communications, and data localization supervision resources.",
        relevance: [TAGS.dataPrivacy, TAGS.consumerProtection],
      },
      {
        name: "Federal Tax Service of Russia",
        authorityType: "tax_authority",
        url: "https://www.nalog.gov.ru/eng/",
        description: "Tax registration, business filings, and tax compliance resources.",
        relevance: [TAGS.tax, TAGS.companyRegistration],
      },
      {
        name: "Digital financial assets legal information",
        authorityType: "other",
        url: "http://publication.pravo.gov.ru/",
        description: "Official publication portal for legal acts including digital financial asset regulation.",
        relevance: [TAGS.crypto, TAGS.securities, TAGS.fintech],
      },
    ],
  },
  australia: {
    id: "australia",
    name: "Australia",
    region: "Oceania",
    defaultComplianceAreas: ["payments", "aml", "kyc", "company_registration", "tax", "data_privacy"],
    sources: [
      {
        name: "Australian Securities and Investments Commission",
        authorityType: "securities_regulator",
        url: "https://asic.gov.au/",
        description: "Company registration, financial services licensing, securities, and consumer protection.",
        relevance: [TAGS.companyRegistration, TAGS.securities, TAGS.fintech, TAGS.consumerProtection],
      },
      {
        name: "AUSTRAC",
        authorityType: "aml_cft",
        url: "https://www.austrac.gov.au/",
        description: "AML/CTF reporting, customer due diligence, and digital currency exchange obligations.",
        relevance: [TAGS.aml, TAGS.kyc, TAGS.crypto, TAGS.payments],
      },
      {
        name: "Australian Taxation Office",
        authorityType: "tax_authority",
        url: "https://www.ato.gov.au/",
        description: "Tax, GST, payroll, and crypto tax compliance resources.",
        relevance: [TAGS.tax, TAGS.crypto, TAGS.companyRegistration],
      },
      {
        name: "Office of the Australian Information Commissioner",
        authorityType: "data_protection",
        url: "https://www.oaic.gov.au/",
        description: "Privacy Act, data breach, and personal information handling guidance.",
        relevance: [TAGS.dataPrivacy, TAGS.kyc],
      },
      {
        name: "Australian Prudential Regulation Authority",
        authorityType: "central_bank",
        url: "https://www.apra.gov.au/",
        description: "Prudential standards and regulated financial institution obligations.",
        relevance: [TAGS.fintech, TAGS.payments, TAGS.consumerProtection],
      },
    ],
  },
};

const JURISDICTION_ALIASES: Record<string, JurisdictionId> = {
  in: "india",
  ind: "india",
  india: "india",
  sg: "singapore",
  singapore: "singapore",
  us: "usa",
  usa: "usa",
  "u.s.": "usa",
  "u.s.a.": "usa",
  "united states": "usa",
  "united states of america": "usa",
  eu: "eu",
  eea: "eu",
  europe: "eu",
  "european union": "eu",
  uae: "uae",
  "united arab emirates": "uae",
  dubai: "uae",
  "middle east": "middle_east",
  mena: "middle_east",
  japan: "japan",
  jp: "japan",
  china: "china",
  cn: "china",
  russia: "russia",
  ru: "russia",
  australia: "australia",
  au: "australia",
};

export function normalizeJurisdictionId(jurisdiction: string): JurisdictionId | null {
  const normalized = jurisdiction.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (JURISDICTION_ALIASES[normalized]) return JURISDICTION_ALIASES[normalized];
  for (const [alias, id] of Object.entries(JURISDICTION_ALIASES)) {
    if (normalized.includes(alias)) return id;
  }
  return null;
}

export function getJurisdictionKnowledgeBase(jurisdiction: string): JurisdictionKnowledgeBase | null {
  const id = normalizeJurisdictionId(jurisdiction);
  return id ? JURISDICTION_KNOWLEDGE_BASE[id] : null;
}

export function getRegulatorySourcesForJurisdiction(jurisdiction: string): RegulatorySource[] {
  return getJurisdictionKnowledgeBase(jurisdiction)?.sources ?? [];
}

function tagsForBusinessText(text: string): Set<string> {
  const lower = text.toLowerCase();
  const tags = new Set<string>();
  if (/(payment|checkout|card|wallet|remittance|transfer|settlement|treasury)/.test(lower)) tags.add(TAGS.payments);
  if (/(stablecoin|usdc|usdt|tokenized|token|stellar|crypto|digital asset|virtual asset|web3)/.test(lower)) {
    tags.add(TAGS.crypto);
    tags.add(TAGS.stablecoins);
  }
  if (/(aml|anti-money|sanction|screen|kyc|identity|onboarding)/.test(lower)) {
    tags.add(TAGS.aml);
    tags.add(TAGS.kyc);
  }
  if (/(privacy|personal data|data|gdpr|dpdp|pii)/.test(lower)) tags.add(TAGS.dataPrivacy);
  if (/(security|securities|investment|yield|fund|derivative|marketplace)/.test(lower)) tags.add(TAGS.securities);
  if (/(tax|gst|vat|withholding|invoice)/.test(lower)) tags.add(TAGS.tax);
  if (/(incorporation|company|subsidiary|entity|registration)/.test(lower)) tags.add(TAGS.companyRegistration);
  if (/(consumer|customer|dispute|complaint|refund)/.test(lower)) tags.add(TAGS.consumerProtection);
  return tags;
}

export function getRelevantSourcesForBusiness(
  jurisdiction: string,
  businessModel: string,
  companyDescription?: string
): RegulatorySource[] {
  const knowledgeBase = getJurisdictionKnowledgeBase(jurisdiction);
  if (!knowledgeBase) return [];

  const tags = tagsForBusinessText(`${businessModel} ${companyDescription ?? ""}`);
  if (tags.size === 0) return knowledgeBase.sources;

  const scored = knowledgeBase.sources
    .map((source, index) => ({
      source,
      index,
      score: source.relevance.reduce((sum, tag) => sum + (tags.has(tag) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const matches = scored.filter((item) => item.score > 0).map((item) => item.source);
  const fallback = scored.filter((item) => item.score === 0).map((item) => item.source);
  return [...matches, ...fallback].slice(0, Math.min(knowledgeBase.sources.length, 6));
}
