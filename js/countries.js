// Country/city terms for location detection. Accented and unaccented
// variants are listed explicitly for canonical display; matching ignores accents.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RadarCountries = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Order here defines dropdown order within each region. Beyond capitals
  // and big cities, each country also lists a handful of provinces/states/
  // regions likely to show up in a JD ("modalidad híbrida en Jalisco").
  // Province names that collide with common Spanish words or well-known
  // brand names (Salta as a verb form, Santander as a bank) are left out
  // on purpose to avoid false-positive country detection.
  const LATAM = {
    "Argentina": [
      "argentina", "buenos aires", "caba", "capital federal", "ciudad autonoma de buenos aires", "cordoba", "córdoba", "rosario", "mendoza", "la plata",
      "mar del plata", "santa fe", "san miguel de tucuman", "san miguel de tucumán", "tucuman", "tucumán", "entre rios", "entre ríos", "parana", "paraná",
      "chaco", "resistencia", "neuquen", "neuquén", "misiones", "posadas", "corrientes", "santiago del estero", "san juan", "san luis", "rio negro", "río negro",
      "bariloche", "general roca", "cipolletti", "viedma", "chubut", "comodoro rivadavia", "trelew", "santa cruz", "rio gallegos", "río gallegos",
      "ushuaia", "tierra del fuego", "jujuy", "san salvador de jujuy", "catamarca", "la rioja", "formosa capital", "concordia", "gualeguaychu", "gualeguaychú",
      "tandil", "bahia blanca", "bahía blanca", "quilmes", "lanus", "lanús", "avellaneda", "moron", "morón", "san isidro", "vicente lopez", "vicente lópez",
      "villa maria", "villa maría", "rio cuarto", "río cuarto", "san rafael", "rafaela", "reconquista", "eldorado", "obera", "oberá",
    ],
    "Chile": [
      "chile", "santiago", "valparaiso", "valparaíso", "concepcion", "concepción",
      "biobio", "biobío", "araucania", "araucanía", "coquimbo", "maule", "antofagasta", "atacama", "tarapaca", "tarapacá",
      "los lagos", "los rios", "los ríos", "aysen", "aysén", "magallanes", "viña del mar", "vina del mar", "temuco", "rancagua", "talca", "iquique", "puerto montt",
    ],
    "México": [
      "mexico", "méxico", "cdmx", "ciudad de mexico", "ciudad de méxico", "guadalajara", "monterrey", "queretaro", "querétaro",
      "jalisco", "nuevo leon", "nuevo león", "puebla", "yucatan", "yucatán", "chihuahua", "baja california", "veracruz", "michoacan", "michoacán", "oaxaca", "chiapas",
      "cancun", "cancún", "quintana roo", "campeche", "tabasco", "merida", "mérida", "guanajuato", "san luis potosi", "san luis potosí",
      "aguascalientes", "sinaloa", "sonora", "durango", "zacatecas", "colima", "morelos", "guerrero", "hidalgo", "tlaxcala", "nayarit", "tamaulipas",
      "tijuana", "ciudad juarez", "ciudad juárez", "toluca", "cuernavaca", "hermosillo", "mazatlan", "mazatlán", "tuxtla gutierrez", "tuxtla gutiérrez",
    ],
    "Colombia": [
      "colombia", "bogota", "bogotá", "medellin", "medellín", "cali", "barranquilla",
      "antioquia", "valle del cauca", "atlantico", "atlántico", "cundinamarca", "bolivar", "bolívar", "narino", "nariño", "tolima",
      "santander", "norte de santander", "caldas", "risaralda", "quindio", "quindío", "huila", "meta", "cauca", "boyaca", "boyacá", "magdalena",
      "cartagena", "bucaramanga", "pereira", "manizales", "ibague", "ibagué", "villavicencio", "santa marta", "armenia",
    ],
    "Perú": ["peru", "perú", "lima", "arequipa", "cusco", "la libertad", "piura", "lambayeque", "junin", "junín", "callao", "trujillo", "chiclayo", "huancayo", "iquitos", "puno", "tacna", "ica"],
    "Uruguay": ["uruguay", "montevideo", "canelones", "maldonado", "punta del este", "salto", "paysandu", "paysandú"],
    "Brasil": [
      "brasil", "brazil", "sao paulo", "são paulo", "rio de janeiro", "belo horizonte",
      "bahia", "bahía", "parana", "paraná", "rio grande do sul", "pernambuco", "ceara", "ceará", "santa catarina", "brasilia", "brasília", "curitiba", "porto alegre",
      "goias", "goiás", "amazonas", "estado do pará", "minas gerais", "espirito santo", "espírito santo", "mato grosso", "mato grosso do sul", "maranhao", "maranhão",
      "piaui", "piauí", "sergipe", "alagoas", "rondonia", "rondônia", "acre", "amapa", "amapá", "tocantins", "florianopolis", "florianópolis", "recife", "fortaleza", "salvador", "manaus", "goiania", "goiânia", "campinas", "niteroi", "niterói",
    ],
    "Ecuador": ["ecuador", "quito", "guayaquil", "cuenca", "ambato", "loja", "manabi", "manabí", "azuay", "pichincha"],
    "Bolivia": ["bolivia", "la paz", "santa cruz de la sierra", "cochabamba", "sucre", "oruro", "tarija", "potosi", "potosí"],
    "Paraguay": ["paraguay", "asuncion", "asunción", "ciudad del este", "encarnacion", "encarnación", "central"],
    "Venezuela": ["venezuela", "caracas"],
    "Panamá": ["panama", "panamá", "ciudad de panama", "ciudad de panamá", "san miguelito", "colon", "colón", "chiriqui", "chiriquí"],
    "Costa Rica": ["costa rica", "san jose", "san josé", "alajuela", "heredia", "cartago", "guanacaste", "puntarenas"],
    "República Dominicana": ["republica dominicana", "república dominicana", "santo domingo"],
  };

  const EUROPE = {
    "España": [
      "espana", "españa", "spain", "madrid", "barcelona", "valencia", "sevilla", "bilbao",
      "cataluña", "cataluna", "andalucia", "andalucía", "pais vasco", "país vasco", "galicia", "aragon", "aragón", "canarias", "murcia",
      "mallorca", "palma", "baleares", "islas baleares", "santiago de compostela", "islas canarias", "canary islands", "gran canaria", "lanzarote", "fuerteventura", "la palma", "la gomera", "el hierro", "castilla y leon", "castilla y león", "castilla la mancha", "extremadura", "asturias", "cantabria", "navarra", "zaragoza", "malaga", "málaga", "granada", "alicante", "a coruña", "vigo", "valladolid", "toledo", "girona", "tarragona", "lleida", "ibiza", "menorca", "tenerife", "las palmas", "oviedo", "pamplona", "donostia", "san sebastian", "san sebastián",
    ],
    "Reino Unido": ["reino unido", "united kingdom", "londres", "london", "manchester", "birmingham", "england", "scotland", "wales", "northern ireland", "edinburgh", "glasgow", "leeds", "liverpool", "bristol", "cambridge", "oxford", "cardiff", "belfast", "sheffield", "nottingham", "newcastle", "brighton"],
    "Alemania": [
      "alemania", "germany", "berlin", "berlín", "munich", "múnich", "frankfurt", "hamburgo", "hamburg",
      "baviera", "bavaria", "renania", "hesse", "hessen", "north rhine-westphalia", "baden-wurttemberg", "baden-württemberg", "saxony", "lower saxony", "cologne", "köln", "dusseldorf", "düsseldorf", "stuttgart", "dresden", "leipzig", "nuremberg", "nürnberg", "bonn",
    ],
    "Francia": ["francia", "france", "paris", "parís", "lyon", "marsella", "marseille", "toulouse", "nantes", "lille", "bordeaux", "burdeos", "nice", "niza", "strasbourg", "montpellier", "provence", "ile-de-france", "île-de-france"],
    "Italia": ["italia", "italy", "roma", "rome", "milan", "milán", "milano", "turin", "torino", "naples", "napoli", "bologna", "florence", "firenze", "venice", "venezia", "sicilia", "toscana", "lazio"],
    "Portugal": ["portugal", "lisboa", "lisbon", "oporto", "porto", "braga", "coimbra", "faro", "aveiro", "madeira", "algarve"],
    "Países Bajos": ["paises bajos", "países bajos", "holanda", "netherlands", "amsterdam", "ámsterdam", "rotterdam", "utrecht", "the hague", "la haya", "eindhoven", "groningen", "limburg", "north holland", "south holland"],
    "Irlanda": ["irlanda", "ireland", "dublin", "dublín", "cork", "galway", "limerick", "leinster", "munster"],
    "Polonia": ["polonia", "poland", "varsovia", "warsaw", "cracovia", "krakow", "wroclaw", "wrocław", "gdansk", "gdańsk", "poznan", "poznań", "lodz", "łódź"],
    "Bélgica": ["belgica", "bélgica", "belgium", "bruselas", "brussels", "antwerp", "amberes", "ghent", "gante", "wallonia", "flanders"],
    "Suiza": ["suiza", "switzerland", "zurich", "zúrich", "ginebra", "geneva", "lausanne", "basel", "berna", "bern", "ticino", "vaud"],
    "Rumania": ["rumania", "romania", "bucarest", "bucharest", "cluj-napoca", "timisoara", "timișoara", "iasi", "iași", "brasov", "brașov"],
    "Austria": ["austria", "viena", "wien", "salzburg", "graz", "innsbruck", "linz"],
    "Suecia": ["suecia", "sweden", "estocolmo", "stockholm", "gothenburg", "gotemburgo", "malmo", "malmö", "uppsala"],
    "Noruega": ["noruega", "norway", "oslo", "bergen", "stavanger", "trondheim"],
    "Dinamarca": ["dinamarca", "denmark", "copenhague", "copenhagen", "aarhus", "odense"],
    "Finlandia": ["finlandia", "finland", "helsinki", "tampere", "turku", "oulu"],
    "Grecia": ["grecia", "greece", "atenas", "athens", "thessaloniki", "tesalonica"],
    "República Checa": ["republica checa", "república checa", "czech republic", "czechia", "praga", "prague", "brno"],
    "Hungría": ["hungria", "hungría", "hungary", "budapest", "debrecen"],
  };

  const OTHER = {
    "Estados Unidos": ["estados unidos", "united states", "usa", "nueva york", "new york", "miami", "san francisco"],
    "Canadá": ["canada", "canadá", "toronto", "vancouver"],
  };

  const ALL_COUNTRIES = Object.assign({}, LATAM, EUROPE, OTHER);

  // The terms that just spell the country's own name (in every variant it's
  // listed under above) — everything else in a country's list is a specific
  // city/province/region. Used to tell "país" apart from "localidad".
  const BARE_COUNTRY_NAMES = {
    "Argentina": ["argentina"],
    "Chile": ["chile"],
    "México": ["mexico", "méxico"],
    "Colombia": ["colombia"],
    "Perú": ["peru", "perú"],
    "Uruguay": ["uruguay"],
    "Brasil": ["brasil", "brazil"],
    "Ecuador": ["ecuador"],
    "Bolivia": ["bolivia"],
    "Paraguay": ["paraguay"],
    "Venezuela": ["venezuela"],
    "Panamá": ["panama", "panamá"],
    "Costa Rica": ["costa rica"],
    "República Dominicana": ["republica dominicana", "república dominicana"],
    "España": ["espana", "españa", "spain"],
    "Reino Unido": ["reino unido", "united kingdom"],
    "Alemania": ["alemania", "germany"],
    "Francia": ["francia", "france"],
    "Italia": ["italia", "italy"],
    "Portugal": ["portugal"],
    "Países Bajos": ["paises bajos", "países bajos", "holanda", "netherlands"],
    "Irlanda": ["irlanda", "ireland"],
    "Polonia": ["polonia", "poland"],
    "Bélgica": ["belgica", "bélgica", "belgium"],
    "Suiza": ["suiza", "switzerland"],
    "Rumania": ["rumania", "romania"],
    "Austria": ["austria"],
    "Suecia": ["suecia", "sweden"],
    "Noruega": ["noruega", "norway"],
    "Dinamarca": ["dinamarca", "denmark"],
    "Finlandia": ["finlandia", "finland"],
    "Grecia": ["grecia", "greece"],
    "República Checa": ["republica checa", "república checa", "czech republic", "czechia"],
    "Hungría": ["hungria", "hungría", "hungary"],
    "Estados Unidos": ["estados unidos", "united states", "usa"],
    "Canadá": ["canada", "canadá"],
  };

  // Spanish connectors that stay lowercase in a place name unless they're
  // the first word ("Ciudad de México", not "Ciudad De México").
  const TITLE_CASE_LOWERCASE_WORDS = new Set(["de", "del", "la", "las", "los", "y", "en"]);
  // Known acronyms that are always written fully upper-case, never title-cased.
  const TITLE_CASE_ACRONYMS = new Set(["caba", "cdmx"]);
  function titleCase(term) {
    return term
      .split(" ")
      .map((word, i) => {
        if (!word) return word;
        if (TITLE_CASE_ACRONYMS.has(word)) return word.toUpperCase();
        if (i > 0 && TITLE_CASE_LOWERCASE_WORDS.has(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  }

  const MODALITY = {
    terms: ["remoto", "remota", "remote", "hibrido", "híbrido", "hibrida", "híbrida", "hybrid", "presencial", "onsite"],
  };

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function foldAccents(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function displayLocality(terms, matched) {
    // The lookup list may contain an unaccented spelling first for matching,
    // but chips should preserve the canonical Spanish spelling when known.
    const folded = foldAccents(matched);
    const accented = terms.find((candidate) => foldAccents(candidate) === folded && candidate.normalize("NFD") !== candidate);
    return titleCase(accented || matched);
  }

  function originalIndexForFolded(text, foldedIndex) {
    let foldedLength = 0;
    for (let i = 0; i < text.length; i++) {
      const charLength = foldAccents(text[i]).length;
      if (foldedLength >= foldedIndex) return i;
      foldedLength += charLength;
    }
    return text.length;
  }

  /** Whole-word, case- and accent-insensitive match. */
  function containsWord(text, term) {
    const normalizedText = foldAccents(text);
    const normalizedTerm = foldAccents(term);
    const re = new RegExp("(^|[^a-z0-9])" + escapeRegex(normalizedTerm) + "($|[^a-z0-9])", "i");
    return re.test(normalizedText);
  }

  const AMBIGUOUS_LOCALITIES = new Set(["salta", "salto", "santander", "meta", "formosa", "armenia", "lima", "santiago", "santa fe", "cordoba", "córdoba"]);
  function hasLocationContext(text, index, term) {
    const before = text.slice(Math.max(0, index - 55), index);
    const after = text.slice(index + term.length, Math.min(text.length, index + term.length + 55));
    return /\b(en|de|desde|para|ubicad[oa]s?|residencia|reside|radicad[oa]s?|sede en|localidad|ciudad de|provincia de|estado de|regi[oó]n de|based in|located in|from|lives in)\s+(?:the\s+)?$/i.test(before) ||
      /^\s*(?:,|\-|\(|\/|\b(?:argentina|uruguay|colombia|espa[nñ]a|per[uú]|chile)\b)/i.test(after);
  }

  /** Returns the first country whose terms match the given text, or null. */
  // Country only, no locality — thin wrapper around detectLocationDetailed
  // so there's exactly one place that resolves an ambiguous locality
  // ("Santiago" is Chile's capital and half of "Santiago de Compostela" in
  // Spain) against an explicit country name in the text. This used to be
  // its own scan in bare list order, drifted out of sync with the real fix,
  // and quietly kept giving Chile for a Spanish address.
  function detectCountry(text) {
    return detectLocationDetailed(text).country;
  }

  /** Earliest-mentioned locality term for a country: { term, index, locality }, or null. Pass excludeTerm to find the next one after an already-found match. */
  function earliestLocalityMatch(text, country, excludeTerm) {
    const terms = ALL_COUNTRIES[country];
    const bare = new Set(BARE_COUNTRY_NAMES[country] || [country.toLowerCase()]);
    let best = null;
    for (const term of terms) {
      if (bare.has(term) || term === excludeTerm || !containsWord(text, term)) continue;
      const foldedIndex = foldAccents(text).indexOf(foldAccents(term));
      const idx = foldedIndex === -1 ? -1 : originalIndexForFolded(text, foldedIndex);
      if (AMBIGUOUS_LOCALITIES.has(foldAccents(term)) && !hasLocationContext(text, idx, term)) continue;
      if (idx !== -1 && (!best || idx < best.index)) {
        best = { term, index: idx, locality: displayLocality(terms, term) };
      }
    }
    return best;
  }

  /** Earliest-mentioned locality term for a country, title-cased, or null. */
  function earliestLocality(text, country) {
    const match = earliestLocalityMatch(text, country);
    return match ? match.locality : null;
  }

  // A recruiter template listing two acceptable cities back to back ("Madrid
  // y Barcelona", or "MADRID"/"BARCELONA" on consecutive table rows once a
  // PDF flattens the layout) means "either of these", same as an explicit
  // OR — dropping the second one silently loses half the real candidate
  // pool. Only fires within a short window right after the first match, so
  // two unrelated city mentions pages apart in a long JD don't get paired.
  const NEARBY_LOCALITY_CHARS = 40;
  function nearbyLocality(text, country, first) {
    if (!first) return null;
    const second = earliestLocalityMatch(text, country, first.term);
    if (!second) return null;
    const gap = second.index - (first.index + first.term.length);
    return gap >= 0 && gap <= NEARBY_LOCALITY_CHARS ? second.locality : null;
  }

  /**
   * Country plus the specific city/province/region mentioned, if any (not
   * just the bare country name). "Trabajo remoto en Argentina" -> country
   * only; "vacante en Rosario, Argentina" -> country + locality "Rosario".
   */
  function detectLocationDetailed(text) {
    // Pass 1: the country's own name, checked across ALL countries first.
    // A bare country name is unambiguous by construction; a locality isn't
    // — "Santiago" is both Chile's capital and half of "Santiago de
    // Compostela" (Spain), "Lima" is both Peru's capital and a common
    // surname. A real JD for "Santiago de Compostela, España" was coming
    // back as Chile because Chile's locality list happened to get checked
    // first, even with "España" sitting right there in the same sentence.
    // Nobody writes a country's real name by mistake, so it always outranks
    // a locality guess from a different, earlier-checked country.
    for (const country of Object.keys(ALL_COUNTRIES)) {
      const bare = BARE_COUNTRY_NAMES[country] || [country.toLowerCase()];
      if (bare.some((term) => containsWord(text, term))) {
        const first = earliestLocalityMatch(text, country);
        return { country, locality: first ? first.locality : null, secondLocality: nearbyLocality(text, country, first) };
      }
    }
    // Pass 2: no country named outright anywhere — default is still the
    // first country-list match in LATAM-before-Europe order, same as
    // always. The one override: when a later country's match starts at
    // that exact same character (not just "somewhere in the text", the
    // identical position), it's not a separate mention — it's a longer,
    // more specific reading of the same words, like Spain's "santiago de
    // compostela" completely swallowing Chile's "santiago" match inside
    // it. That earns the swap. Two unrelated matches at different spots
    // — Chile's "santiago" as a stray first name next to Argentina's real
    // "caba" later in the same JD — don't collide this way, so the
    // original list-order pick stands.
    let best = null;
    for (const country of Object.keys(ALL_COUNTRIES)) {
      const match = earliestLocalityMatch(text, country);
      if (!match) continue;
      if (!best) {
        best = { country, index: match.index, term: match.term, locality: match.locality };
      } else if (match.index === best.index && match.term.length > best.term.length) {
        best = { country, index: match.index, term: match.term, locality: match.locality };
      }
    }
    return best
      ? { country: best.country, locality: best.locality, secondLocality: nearbyLocality(text, best.country, best) }
      : { country: null, locality: null, secondLocality: null };
  }

  /** Returns matched modality words present in the text (deduped, original casing lost -> canonical). */
  function detectModality(text) {
    const found = [];
    const canon = {
      remote: "remoto",
      remota: "remoto",
      hibrido: "híbrido",
      hibrida: "híbrido",
      híbrida: "híbrido",
      hybrid: "híbrido",
      onsite: "presencial",
    };
    MODALITY.terms.forEach((t) => {
      if (containsWord(text, t)) {
        const label = canon[t] || t;
        if (!found.includes(label)) found.push(label);
      }
    });
    return found;
  }

  function countryList() {
    return Object.keys(ALL_COUNTRIES);
  }

  // A German candidate's own LinkedIn/Xing/GitHub profile says "Germany" (or
  // nothing about the country at all) — never "Alemania". Swapping one for
  // the other on a Xing search took it from zero results to real matches;
  // Google doesn't localize Xing's pages into Spanish the way it happens to
  // do for LinkedIn's. Returns the
  // English/local form from BARE_COUNTRY_NAMES so a search can widen with an
  // OR instead of only trying the Spanish name — null when the country's own
  // name already reads the same in English (Argentina, Chile, Perú...), so
  // there's nothing useful to add.
  function searchAlias(country) {
    const names = BARE_COUNTRY_NAMES[country];
    if (!names || names.length < 2) return null;
    const alias = names[names.length - 1];
    if (alias.toLowerCase() === country.toLowerCase()) return null;
    return alias.length <= 3 ? alias.toUpperCase() : alias.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return {
    ALL_COUNTRIES,
    LATAM,
    EUROPE,
    OTHER,
    BARE_COUNTRY_NAMES,
    countryList,
    detectCountry,
    detectLocationDetailed,
    detectModality,
    searchAlias,
    containsWord,
  };
});
