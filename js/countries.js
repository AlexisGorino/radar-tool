// Country/city terms for location detection. Accented and unaccented
// variants are listed explicitly since matching stays accent-sensitive.
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
      "argentina", "buenos aires", "caba", "cordoba", "córdoba", "rosario", "mendoza", "la plata",
      "santa fe", "tucuman", "tucumán", "entre rios", "entre ríos", "chaco", "neuquen", "neuquén", "misiones",
    ],
    "Chile": [
      "chile", "santiago", "valparaiso", "valparaíso", "concepcion", "concepción",
      "biobio", "biobío", "araucania", "araucanía", "coquimbo", "maule", "antofagasta", "atacama",
    ],
    "México": [
      "mexico", "méxico", "cdmx", "ciudad de mexico", "ciudad de méxico", "guadalajara", "monterrey", "queretaro", "querétaro",
      "jalisco", "nuevo leon", "nuevo león", "puebla", "yucatan", "yucatán", "chihuahua", "baja california", "veracruz", "michoacan", "michoacán", "oaxaca", "chiapas",
      "cancun", "cancún", "quintana roo", "campeche", "tabasco", "merida", "mérida",
    ],
    "Colombia": [
      "colombia", "bogota", "bogotá", "medellin", "medellín", "cali", "barranquilla",
      "antioquia", "valle del cauca", "atlantico", "atlántico", "cundinamarca", "bolivar", "bolívar", "narino", "nariño", "tolima",
    ],
    "Perú": ["peru", "perú", "lima", "arequipa", "cusco", "la libertad", "piura", "lambayeque", "junin", "junín"],
    "Uruguay": ["uruguay", "montevideo"],
    "Brasil": [
      "brasil", "brazil", "sao paulo", "são paulo", "rio de janeiro", "belo horizonte",
      "bahia", "bahía", "parana", "paraná", "rio grande do sul", "pernambuco", "ceara", "ceará", "santa catarina",
    ],
    "Ecuador": ["ecuador", "quito", "guayaquil"],
    "Bolivia": ["bolivia", "la paz", "santa cruz de la sierra"],
    "Paraguay": ["paraguay", "asuncion", "asunción"],
    "Venezuela": ["venezuela", "caracas"],
    "Panamá": ["panama", "panamá"],
    "Costa Rica": ["costa rica", "san jose", "san josé"],
    "República Dominicana": ["republica dominicana", "república dominicana", "santo domingo"],
  };

  const EUROPE = {
    "España": [
      "espana", "españa", "spain", "madrid", "barcelona", "valencia", "sevilla", "bilbao",
      "cataluña", "cataluna", "andalucia", "andalucía", "pais vasco", "país vasco", "galicia", "aragon", "aragón", "canarias", "murcia",
      "mallorca", "palma", "baleares", "islas baleares", "santiago de compostela",
    ],
    "Reino Unido": ["reino unido", "united kingdom", "londres", "london", "manchester", "birmingham"],
    "Alemania": [
      "alemania", "germany", "berlin", "berlín", "munich", "múnich", "frankfurt", "hamburgo", "hamburg",
      "baviera", "bavaria", "renania", "hesse", "hessen",
    ],
    "Francia": ["francia", "france", "paris", "parís", "lyon", "marsella", "marseille"],
    "Italia": ["italia", "italy", "roma", "rome", "milan", "milán", "milano"],
    "Portugal": ["portugal", "lisboa", "lisbon", "oporto", "porto"],
    "Países Bajos": ["paises bajos", "países bajos", "holanda", "netherlands", "amsterdam", "ámsterdam", "rotterdam"],
    "Irlanda": ["irlanda", "ireland", "dublin", "dublín"],
    "Polonia": ["polonia", "poland", "varsovia", "warsaw", "cracovia", "krakow"],
    "Bélgica": ["belgica", "bélgica", "belgium", "bruselas", "brussels"],
    "Suiza": ["suiza", "switzerland", "zurich", "zúrich", "ginebra", "geneva"],
    "Rumania": ["rumania", "romania", "bucarest", "bucharest"],
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

  /** Whole-word, case-insensitive match. Works fine with accented letters in V8/Chromium/Node. */
  function containsWord(text, term) {
    const re = new RegExp("(^|[^a-záéíóúñü0-9])" + escapeRegex(term.toLowerCase()) + "($|[^a-záéíóúñü0-9])", "i");
    return re.test(text.toLowerCase());
  }

  /** Returns the first country whose terms match the given text, or null. */
  function detectCountry(text) {
    for (const country of Object.keys(ALL_COUNTRIES)) {
      const terms = ALL_COUNTRIES[country];
      for (const term of terms) {
        if (containsWord(text, term)) return country;
      }
    }
    return null;
  }

  /** Earliest-mentioned locality term for a country, title-cased, or null. */
  function earliestLocality(text, country) {
    const terms = ALL_COUNTRIES[country];
    const bare = new Set(BARE_COUNTRY_NAMES[country] || [country.toLowerCase()]);
    let locality = null;
    let localityIndex = Infinity;
    for (const term of terms) {
      if (bare.has(term) || !containsWord(text, term)) continue;
      const idx = text.toLowerCase().indexOf(term);
      if (idx !== -1 && idx < localityIndex) {
        localityIndex = idx;
        locality = titleCase(term);
      }
    }
    return locality;
  }

  /**
   * Country plus the specific city/province/region mentioned, if any (not
   * just the bare country name). "Trabajo remoto en Argentina" -> country
   * only; "vacante en Rosario, Argentina" -> country + locality "Rosario".
   */
  function detectLocationDetailed(text) {
    // Pass 1: the country's own name, checked across ALL countries first.
    // A bare country name is unambiguous by construction; a locality is not
    // — "Santiago" is both Chile's capital and half of "Santiago de
    // Compostela" (Spain), "Lima" is both Peru's capital and a common
    // surname. Verified live: a JD for "Santiago de Compostela, España"
    // was coming back as Chile, because Chile's locality list happened to
    // get checked before España's bare name ever got a chance — even
    // though "España" was sitting right there in the same sentence. Nobody
    // writes a country's real name by mistake, so it always outranks a
    // locality guess from a different, earlier-checked country.
    for (const country of Object.keys(ALL_COUNTRIES)) {
      const bare = BARE_COUNTRY_NAMES[country] || [country.toLowerCase()];
      if (bare.some((term) => containsWord(text, term))) {
        return { country, locality: earliestLocality(text, country) };
      }
    }
    // Pass 2: no country named outright anywhere — fall back to the first
    // locality match, same list order as before (LATAM before Europe).
    for (const country of Object.keys(ALL_COUNTRIES)) {
      const locality = earliestLocality(text, country);
      if (locality) return { country, locality };
    }
    return { country: null, locality: null };
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
  // nothing about the country at all) — never "Alemania". Verified live: the
  // exact same Xing search went from zero results to real matches just by
  // swapping "Alemania" for "Germany" (Google doesn't localize Xing's pages
  // into Spanish the way it happens to do for LinkedIn's). Returns the
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
