import type { AtlasEntity } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Geographic Entity Registry
//
// The stable bridge between built-in map geometry (Natural Earth / world-atlas,
// keyed by ISO 3166-1 *numeric* feature ids) and user-owned country profiles
// (AtlasCountry, keyed by internal `atlasId`).
//
// This is STATIC APP DATA — never stored in the database, never in backups.
//
// Rules:
//   • `atlasId` is the internal stable key. Convention: lowercase alpha-3 when
//     one exists (e.g. 'tur'), otherwise a stable slug (e.g. 'kosovo'). It must
//     never change once shipped, even if ISO assigns/changes a code.
//   • `iso3` / `isoNumeric` are OPTIONAL. Entities without an official ISO
//     alpha-3 (Kosovo, Northern Cyprus, Somaliland, Western Sahara, …) still
//     appear here so the map is not forced into a "sovereign-or-nothing" binary.
//   • `isoNumeric` (as a string) is what matches world-atlas geometry feature
//     ids. Entities with geometry but no clean numeric mapping can omit it and
//     be reconciled at the geometry layer in a later stage.
//
// Coverage: all 193 UN member states + 2 UN observer states, plus the notable
// partially recognized states, dependent territories, and disputed areas that a
// world atlas should be able to render.
// ─────────────────────────────────────────────────────────────────────────────

/** Build a sovereign-state entry from alpha-3 + numeric. */
function s(iso3: string, isoNumeric: string, name: string, region: string): AtlasEntity {
  return { atlasId: iso3.toLowerCase(), iso3, isoNumeric, name, status: 'sovereign', region };
}

export const ATLAS_ENTITIES: AtlasEntity[] = [
  // ── Africa ──
  s('DZA', '012', 'Algeria', 'Africa'),
  s('AGO', '024', 'Angola', 'Africa'),
  s('BEN', '204', 'Benin', 'Africa'),
  s('BWA', '072', 'Botswana', 'Africa'),
  s('BFA', '854', 'Burkina Faso', 'Africa'),
  s('BDI', '108', 'Burundi', 'Africa'),
  s('CPV', '132', 'Cabo Verde', 'Africa'),
  s('CMR', '120', 'Cameroon', 'Africa'),
  s('CAF', '140', 'Central African Republic', 'Africa'),
  s('TCD', '148', 'Chad', 'Africa'),
  s('COM', '174', 'Comoros', 'Africa'),
  s('COG', '178', 'Republic of the Congo', 'Africa'),
  s('COD', '180', 'Democratic Republic of the Congo', 'Africa'),
  s('CIV', '384', "Côte d'Ivoire", 'Africa'),
  s('DJI', '262', 'Djibouti', 'Africa'),
  s('EGY', '818', 'Egypt', 'Africa'),
  s('GNQ', '226', 'Equatorial Guinea', 'Africa'),
  s('ERI', '232', 'Eritrea', 'Africa'),
  s('SWZ', '748', 'Eswatini', 'Africa'),
  s('ETH', '231', 'Ethiopia', 'Africa'),
  s('GAB', '266', 'Gabon', 'Africa'),
  s('GMB', '270', 'Gambia', 'Africa'),
  s('GHA', '288', 'Ghana', 'Africa'),
  s('GIN', '324', 'Guinea', 'Africa'),
  s('GNB', '624', 'Guinea-Bissau', 'Africa'),
  s('KEN', '404', 'Kenya', 'Africa'),
  s('LSO', '426', 'Lesotho', 'Africa'),
  s('LBR', '430', 'Liberia', 'Africa'),
  s('LBY', '434', 'Libya', 'Africa'),
  s('MDG', '450', 'Madagascar', 'Africa'),
  s('MWI', '454', 'Malawi', 'Africa'),
  s('MLI', '466', 'Mali', 'Africa'),
  s('MRT', '478', 'Mauritania', 'Africa'),
  s('MUS', '480', 'Mauritius', 'Africa'),
  s('MAR', '504', 'Morocco', 'Africa'),
  s('MOZ', '508', 'Mozambique', 'Africa'),
  s('NAM', '516', 'Namibia', 'Africa'),
  s('NER', '562', 'Niger', 'Africa'),
  s('NGA', '566', 'Nigeria', 'Africa'),
  s('RWA', '646', 'Rwanda', 'Africa'),
  s('STP', '678', 'São Tomé and Príncipe', 'Africa'),
  s('SEN', '686', 'Senegal', 'Africa'),
  s('SYC', '690', 'Seychelles', 'Africa'),
  s('SLE', '694', 'Sierra Leone', 'Africa'),
  s('SOM', '706', 'Somalia', 'Africa'),
  s('ZAF', '710', 'South Africa', 'Africa'),
  s('SSD', '728', 'South Sudan', 'Africa'),
  s('SDN', '729', 'Sudan', 'Africa'),
  s('TZA', '834', 'Tanzania', 'Africa'),
  s('TGO', '768', 'Togo', 'Africa'),
  s('TUN', '788', 'Tunisia', 'Africa'),
  s('UGA', '800', 'Uganda', 'Africa'),
  s('ZMB', '894', 'Zambia', 'Africa'),
  s('ZWE', '716', 'Zimbabwe', 'Africa'),

  // ── Americas ──
  s('ATG', '028', 'Antigua and Barbuda', 'Americas'),
  s('ARG', '032', 'Argentina', 'Americas'),
  s('BHS', '044', 'Bahamas', 'Americas'),
  s('BRB', '052', 'Barbados', 'Americas'),
  s('BLZ', '084', 'Belize', 'Americas'),
  s('BOL', '068', 'Bolivia', 'Americas'),
  s('BRA', '076', 'Brazil', 'Americas'),
  s('CAN', '124', 'Canada', 'Americas'),
  s('CHL', '152', 'Chile', 'Americas'),
  s('COL', '170', 'Colombia', 'Americas'),
  s('CRI', '188', 'Costa Rica', 'Americas'),
  s('CUB', '192', 'Cuba', 'Americas'),
  s('DMA', '212', 'Dominica', 'Americas'),
  s('DOM', '214', 'Dominican Republic', 'Americas'),
  s('ECU', '218', 'Ecuador', 'Americas'),
  s('SLV', '222', 'El Salvador', 'Americas'),
  s('GRD', '308', 'Grenada', 'Americas'),
  s('GTM', '320', 'Guatemala', 'Americas'),
  s('GUY', '328', 'Guyana', 'Americas'),
  s('HTI', '332', 'Haiti', 'Americas'),
  s('HND', '340', 'Honduras', 'Americas'),
  s('JAM', '388', 'Jamaica', 'Americas'),
  s('MEX', '484', 'Mexico', 'Americas'),
  s('NIC', '558', 'Nicaragua', 'Americas'),
  s('PAN', '591', 'Panama', 'Americas'),
  s('PRY', '600', 'Paraguay', 'Americas'),
  s('PER', '604', 'Peru', 'Americas'),
  s('KNA', '659', 'Saint Kitts and Nevis', 'Americas'),
  s('LCA', '662', 'Saint Lucia', 'Americas'),
  s('VCT', '670', 'Saint Vincent and the Grenadines', 'Americas'),
  s('SUR', '740', 'Suriname', 'Americas'),
  s('TTO', '780', 'Trinidad and Tobago', 'Americas'),
  s('USA', '840', 'United States', 'Americas'),
  s('URY', '858', 'Uruguay', 'Americas'),
  s('VEN', '862', 'Venezuela', 'Americas'),

  // ── Asia ──
  s('AFG', '004', 'Afghanistan', 'Asia'),
  s('ARM', '051', 'Armenia', 'Asia'),
  s('AZE', '031', 'Azerbaijan', 'Asia'),
  s('BHR', '048', 'Bahrain', 'Asia'),
  s('BGD', '050', 'Bangladesh', 'Asia'),
  s('BTN', '064', 'Bhutan', 'Asia'),
  s('BRN', '096', 'Brunei', 'Asia'),
  s('KHM', '116', 'Cambodia', 'Asia'),
  s('CHN', '156', 'China', 'Asia'),
  s('CYP', '196', 'Cyprus', 'Asia'),
  s('GEO', '268', 'Georgia', 'Asia'),
  s('IND', '356', 'India', 'Asia'),
  s('IDN', '360', 'Indonesia', 'Asia'),
  s('IRN', '364', 'Iran', 'Asia'),
  s('IRQ', '368', 'Iraq', 'Asia'),
  s('ISR', '376', 'Israel', 'Asia'),
  s('JPN', '392', 'Japan', 'Asia'),
  s('JOR', '400', 'Jordan', 'Asia'),
  s('KAZ', '398', 'Kazakhstan', 'Asia'),
  s('KWT', '414', 'Kuwait', 'Asia'),
  s('KGZ', '417', 'Kyrgyzstan', 'Asia'),
  s('LAO', '418', 'Laos', 'Asia'),
  s('LBN', '422', 'Lebanon', 'Asia'),
  s('MYS', '458', 'Malaysia', 'Asia'),
  s('MDV', '462', 'Maldives', 'Asia'),
  s('MNG', '496', 'Mongolia', 'Asia'),
  s('MMR', '104', 'Myanmar', 'Asia'),
  s('NPL', '524', 'Nepal', 'Asia'),
  s('PRK', '408', 'North Korea', 'Asia'),
  s('OMN', '512', 'Oman', 'Asia'),
  s('PAK', '586', 'Pakistan', 'Asia'),
  s('PHL', '608', 'Philippines', 'Asia'),
  s('QAT', '634', 'Qatar', 'Asia'),
  s('SAU', '682', 'Saudi Arabia', 'Asia'),
  s('SGP', '702', 'Singapore', 'Asia'),
  s('KOR', '410', 'South Korea', 'Asia'),
  s('LKA', '144', 'Sri Lanka', 'Asia'),
  s('SYR', '760', 'Syria', 'Asia'),
  s('TJK', '762', 'Tajikistan', 'Asia'),
  s('THA', '764', 'Thailand', 'Asia'),
  s('TLS', '626', 'Timor-Leste', 'Asia'),
  s('TUR', '792', 'Türkiye', 'Asia'),
  s('TKM', '795', 'Turkmenistan', 'Asia'),
  s('ARE', '784', 'United Arab Emirates', 'Asia'),
  s('UZB', '860', 'Uzbekistan', 'Asia'),
  s('VNM', '704', 'Vietnam', 'Asia'),
  s('YEM', '887', 'Yemen', 'Asia'),

  // ── Europe ──
  s('ALB', '008', 'Albania', 'Europe'),
  s('AND', '020', 'Andorra', 'Europe'),
  s('AUT', '040', 'Austria', 'Europe'),
  s('BLR', '112', 'Belarus', 'Europe'),
  s('BEL', '056', 'Belgium', 'Europe'),
  s('BIH', '070', 'Bosnia and Herzegovina', 'Europe'),
  s('BGR', '100', 'Bulgaria', 'Europe'),
  s('HRV', '191', 'Croatia', 'Europe'),
  s('CZE', '203', 'Czechia', 'Europe'),
  s('DNK', '208', 'Denmark', 'Europe'),
  s('EST', '233', 'Estonia', 'Europe'),
  s('FIN', '246', 'Finland', 'Europe'),
  s('FRA', '250', 'France', 'Europe'),
  s('DEU', '276', 'Germany', 'Europe'),
  s('GRC', '300', 'Greece', 'Europe'),
  s('HUN', '348', 'Hungary', 'Europe'),
  s('ISL', '352', 'Iceland', 'Europe'),
  s('IRL', '372', 'Ireland', 'Europe'),
  s('ITA', '380', 'Italy', 'Europe'),
  s('LVA', '428', 'Latvia', 'Europe'),
  s('LIE', '438', 'Liechtenstein', 'Europe'),
  s('LTU', '440', 'Lithuania', 'Europe'),
  s('LUX', '442', 'Luxembourg', 'Europe'),
  s('MLT', '470', 'Malta', 'Europe'),
  s('MDA', '498', 'Moldova', 'Europe'),
  s('MCO', '492', 'Monaco', 'Europe'),
  s('MNE', '499', 'Montenegro', 'Europe'),
  s('NLD', '528', 'Netherlands', 'Europe'),
  s('MKD', '807', 'North Macedonia', 'Europe'),
  s('NOR', '578', 'Norway', 'Europe'),
  s('POL', '616', 'Poland', 'Europe'),
  s('PRT', '620', 'Portugal', 'Europe'),
  s('ROU', '642', 'Romania', 'Europe'),
  s('RUS', '643', 'Russia', 'Europe'),
  s('SMR', '674', 'San Marino', 'Europe'),
  s('SRB', '688', 'Serbia', 'Europe'),
  s('SVK', '703', 'Slovakia', 'Europe'),
  s('SVN', '705', 'Slovenia', 'Europe'),
  s('ESP', '724', 'Spain', 'Europe'),
  s('SWE', '752', 'Sweden', 'Europe'),
  s('CHE', '756', 'Switzerland', 'Europe'),
  s('UKR', '804', 'Ukraine', 'Europe'),
  s('GBR', '826', 'United Kingdom', 'Europe'),
  s('VAT', '336', 'Vatican City', 'Europe'),

  // ── Oceania ──
  s('AUS', '036', 'Australia', 'Oceania'),
  s('FJI', '242', 'Fiji', 'Oceania'),
  s('KIR', '296', 'Kiribati', 'Oceania'),
  s('MHL', '584', 'Marshall Islands', 'Oceania'),
  s('FSM', '583', 'Micronesia', 'Oceania'),
  s('NRU', '520', 'Nauru', 'Oceania'),
  s('NZL', '554', 'New Zealand', 'Oceania'),
  s('PLW', '585', 'Palau', 'Oceania'),
  s('PNG', '598', 'Papua New Guinea', 'Oceania'),
  s('WSM', '882', 'Samoa', 'Oceania'),
  s('SLB', '090', 'Solomon Islands', 'Oceania'),
  s('TON', '776', 'Tonga', 'Oceania'),
  s('TUV', '798', 'Tuvalu', 'Oceania'),
  s('VUT', '548', 'Vanuatu', 'Oceania'),

  // ── UN observer states ──
  { atlasId: 'pse', iso3: 'PSE', isoNumeric: '275', name: 'Palestine', status: 'partial', region: 'Asia' },
  // Vatican (Holy See) is a UN observer; listed above as sovereign for atlas purposes.

  // ── Partially recognized states (no universally accepted ISO alpha-3) ──
  { atlasId: 'kosovo', name: 'Kosovo', status: 'partial', region: 'Europe' },        // XKX is a user-assigned code, not official ISO
  { atlasId: 'twn', iso3: 'TWN', isoNumeric: '158', name: 'Taiwan', status: 'partial', region: 'Asia' },
  { atlasId: 'north-cyprus', name: 'Northern Cyprus', status: 'partial', region: 'Asia' },
  { atlasId: 'somaliland', name: 'Somaliland', status: 'partial', region: 'Africa' },
  { atlasId: 'south-ossetia', name: 'South Ossetia', status: 'partial', region: 'Asia' },
  { atlasId: 'abkhazia', name: 'Abkhazia', status: 'partial', region: 'Asia' },

  // ── Disputed areas ──
  { atlasId: 'western-sahara', iso3: 'ESH', isoNumeric: '732', name: 'Western Sahara', status: 'disputed', region: 'Africa' },

  // ── Selected dependent territories (populated, commonly mapped) ──
  { atlasId: 'grl', iso3: 'GRL', isoNumeric: '304', name: 'Greenland', status: 'territory', region: 'Americas' },
  { atlasId: 'pri', iso3: 'PRI', isoNumeric: '630', name: 'Puerto Rico', status: 'territory', region: 'Americas' },
  { atlasId: 'hkg', iso3: 'HKG', isoNumeric: '344', name: 'Hong Kong', status: 'territory', region: 'Asia' },
  { atlasId: 'mac', iso3: 'MAC', isoNumeric: '446', name: 'Macau', status: 'territory', region: 'Asia' },
  { atlasId: 'ncl', iso3: 'NCL', isoNumeric: '540', name: 'New Caledonia', status: 'territory', region: 'Oceania' },
  { atlasId: 'pyf', iso3: 'PYF', isoNumeric: '258', name: 'French Polynesia', status: 'territory', region: 'Oceania' },
  { atlasId: 'flk', iso3: 'FLK', isoNumeric: '238', name: 'Falkland Islands', status: 'disputed', region: 'Americas' },
];

// ── Lookup indices (built once at module load) ──

const byAtlasId = new Map<string, AtlasEntity>();
const byIso3 = new Map<string, AtlasEntity>();
const byIsoNumeric = new Map<string, AtlasEntity>();

for (const e of ATLAS_ENTITIES) {
  byAtlasId.set(e.atlasId, e);
  if (e.iso3) byIso3.set(e.iso3.toUpperCase(), e);
  if (e.isoNumeric) byIsoNumeric.set(e.isoNumeric, e);
}

export function getEntityByAtlasId(atlasId: string): AtlasEntity | undefined {
  return byAtlasId.get(atlasId);
}

export function getEntityByIso3(iso3: string): AtlasEntity | undefined {
  return byIso3.get(iso3.toUpperCase());
}

/** Match a world-atlas geometry feature id (ISO numeric, as string) to an entity. */
export function getEntityByIsoNumeric(isoNumeric: string): AtlasEntity | undefined {
  return byIsoNumeric.get(isoNumeric);
}

/**
 * Resolve an import-supplied identifier to a canonical `atlasId`.
 * Accepts an explicit atlasId, an ISO alpha-3, or (defensively) a numeric code.
 * Returns undefined if nothing matches — callers should surface this as an error
 * rather than silently creating an orphan profile.
 */
export function resolveAtlasId(idOrIso: string): string | undefined {
  const raw = idOrIso.trim();
  if (byAtlasId.has(raw)) return raw;
  const lower = raw.toLowerCase();
  if (byAtlasId.has(lower)) return lower;
  const byCode = getEntityByIso3(raw);
  if (byCode) return byCode.atlasId;
  const byNum = byIsoNumeric.get(raw);
  if (byNum) return byNum.atlasId;
  return undefined;
}
