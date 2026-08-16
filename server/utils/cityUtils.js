/**
 * Centralized city alias map, variants, and regex utils.
 * Supports all Indian cities configured in the database, including alias spellings.
 */

const CITY_ALIASES = {
  // Anantapur variations
  anantapur: 'anantapur',
  ananthapur: 'anantapur',
  anantapuram: 'anantapur',
  ananthapuram: 'anantapur',
  anathapur: 'anantapur',
  anathapuram: 'anantapur',
  anantpur: 'anantapur',

  // Bhimavaram variations
  bhimavaram: 'bhimavaram',
  bhimavram: 'bhimavaram',
  bhimavaramu: 'bhimavaram',
  bvr: 'bhimavaram',

  // Kadapa variations
  kadapa: 'kadapa',
  cuddapah: 'kadapa',
  kudapa: 'kadapa',
  cdp: 'kadapa',

  // Bangalore variations
  bangalore: 'bangalore',
  bengaluru: 'bangalore',
  blr: 'bangalore',

  // Hyderabad variations
  hyderabad: 'hyderabad',
  hyd: 'hyderabad',
  haiderabad: 'hyderabad',

  // Vijayawada variations
  vijayawada: 'vijayawada',
  vijayawadda: 'vijayawada',
  vijaywada: 'vijayawada',
  bezawada: 'vijayawada',
  bza: 'vijayawada',

  // Tirupati variations
  tirupati: 'tirupati',
  tirupathi: 'tirupati',
  tpt: 'tirupati',

  // Visakhapatnam variations
  visakhapatnam: 'visakhapatnam',
  vizag: 'visakhapatnam',
  vtz: 'visakhapatnam',

  // Mumbai variations
  mumbai: 'mumbai',
  bombay: 'mumbai',
  bom: 'mumbai',

  // Pune variations
  pune: 'pune',
  puni: 'pune',
  poona: 'pune',
  pnq: 'pune',

  // Chennai variations
  chennai: 'chennai',
  madras: 'chennai',
  maa: 'chennai',

  // Delhi variations
  delhi: 'delhi',
  'new delhi': 'delhi',
  del: 'delhi',

  // Jaipur variations
  jaipur: 'jaipur',
  jai: 'jaipur',

  // Kochi variations
  kochi: 'kochi',
  cochin: 'kochi',
  cok: 'kochi',

  // Goa variations
  goa: 'goa',
  goi: 'goa',

  // Kurnool variations
  kurnool: 'kurnool',
  kurnoolu: 'kurnool',
  krn: 'kurnool',

  // Amalapuram variations
  amalapuram: 'amalapuram',
  amp: 'amalapuram'
};

/**
 * Normalizes any variation of city name to its database canonical equivalent.
 */
function normalizeCity(city) {
  if (!city) return '';
  const raw = city.toString().trim().toLowerCase();
  return CITY_ALIASES[raw] || raw;
}

/**
 * Returns all possible variations/spellings of a city name to execute multi-like queries.
 */
function getCityVariants(city) {
  if (!city) return [];
  const raw = city.toString().trim().toLowerCase();
  const normalized = CITY_ALIASES[raw] || raw;

  const set = new Set([raw, normalized]);

  if (normalized === 'anantapur') {
    set.add('anantapur');
    set.add('ananthapuram');
    set.add('ananthapur');
    set.add('anantapuram');
    set.add('anathapuram');
    set.add('anathapur');
    set.add('anantpur');
  }
  if (normalized === 'bhimavaram') {
    set.add('bhimavaram');
    set.add('bhimavram');
    set.add('bhimavaramu');
    set.add('bvr');
  }
  if (normalized === 'bangalore') {
    set.add('bangalore');
    set.add('bengaluru');
    set.add('blr');
  }
  if (normalized === 'hyderabad') {
    set.add('hyderabad');
    set.add('hyd');
    set.add('haiderabad');
  }
  if (normalized === 'vijayawada') {
    set.add('vijayawada');
    set.add('vijayawadda');
    set.add('vijaywada');
    set.add('bezawada');
    set.add('bza');
  }
  if (normalized === 'tirupati') {
    set.add('tirupati');
    set.add('tirupathi');
    set.add('tpt');
  }
  if (normalized === 'visakhapatnam') {
    set.add('visakhapatnam');
    set.add('vizag');
    set.add('vtz');
  }
  if (normalized === 'mumbai') {
    set.add('mumbai');
    set.add('bombay');
    set.add('bom');
  }
  if (normalized === 'pune') {
    set.add('pune');
    set.add('puni');
    set.add('poona');
    set.add('pnq');
  }
  if (normalized === 'chennai') {
    set.add('chennai');
    set.add('madras');
    set.add('maa');
  }
  if (normalized === 'kadapa') {
    set.add('kadapa');
    set.add('cuddapah');
    set.add('cdp');
  }
  if (normalized === 'delhi') {
    set.add('delhi');
    set.add('del');
  }
  if (normalized === 'jaipur') {
    set.add('jaipur');
    set.add('jai');
  }
  if (normalized === 'kochi') {
    set.add('kochi');
    set.add('cochin');
    set.add('cok');
  }
  if (normalized === 'goa') {
    set.add('goa');
    set.add('goi');
  }
  if (normalized === 'kurnool') {
    set.add('kurnool');
    set.add('kurnoolu');
    set.add('krn');
  }
  if (normalized === 'amalapuram') {
    set.add('amalapuram');
    set.add('amp');
  }

  return Array.from(set);
}

/**
 * Builds standard parameterized SQL LIKE clause.
 */
function buildCityMatchClause(columnName, city) {
  const variants = getCityVariants(city);
  if (variants.length === 0) return { sql: '1=1', params: [] };
  const clauses = variants.map(() => `LOWER(${columnName}) LIKE ?`);
  const params = variants.map(v => `%${v}%`);
  return {
    sql: `(${clauses.join(' OR ')})`,
    params
  };
}

// Regex matching all supported cities
const CITY_REGEX = /hyderabad|vijayawada|vijayawadda|vijaywada|bezawada|bangalore|bengaluru|chennai|madras|mumbai|bombay|pune|puni|poona|delhi|jaipur|tirupati|tirupathi|visakhapatnam|vizag|kadapa|cuddapah|anantapur|ananthapuram|ananthapur|anantapuram|anathapuram|anathapur|anantpur|bhimavaram|bhimavram|bvr|kurnool|amalapuram|kochi|goa/i;

const ALL_CITIES_LIST = [
  'hyderabad',
  'vijayawada',
  'bangalore',
  'chennai',
  'mumbai',
  'pune',
  'delhi',
  'jaipur',
  'tirupati',
  'visakhapatnam',
  'kadapa',
  'anantapur',
  'bhimavaram',
  'kurnool',
  'amalapuram',
  'kochi',
  'goa'
];

module.exports = {
  CITY_ALIASES,
  normalizeCity,
  getCityVariants,
  buildCityMatchClause,
  CITY_REGEX,
  ALL_CITIES_LIST
};
