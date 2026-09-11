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

  // Order here defines dropdown order within each region.
  const LATAM = {
    "Argentina": ["argentina", "buenos aires", "caba", "cordoba", "córdoba", "rosario", "mendoza", "la plata"],
    "Chile": ["chile", "santiago", "valparaiso", "valparaíso", "concepcion", "concepción"],
    "México": ["mexico", "méxico", "cdmx", "ciudad de mexico", "ciudad de méxico", "guadalajara", "monterrey", "queretaro", "querétaro"],
    "Colombia": ["colombia", "bogota", "bogotá", "medellin", "medellín", "cali", "barranquilla"],
    "Perú": ["peru", "perú", "lima", "arequipa"],
    "Uruguay": ["uruguay", "montevideo"],
    "Brasil": ["brasil", "brazil", "sao paulo", "são paulo", "rio de janeiro", "belo horizonte"],
    "Ecuador": ["ecuador", "quito", "guayaquil"],
    "Bolivia": ["bolivia", "la paz", "santa cruz de la sierra"],
    "Paraguay": ["paraguay", "asuncion", "asunción"],
    "Venezuela": ["venezuela", "caracas"],
    "Panamá": ["panama", "panamá"],
    "Costa Rica": ["costa rica", "san jose", "san josé"],
    "República Dominicana": ["republica dominicana", "república dominicana", "santo domingo"],
  };

  const EUROPE = {
    "España": ["espana", "españa", "spain", "madrid", "barcelona", "valencia", "sevilla", "bilbao"],
    "Reino Unido": ["reino unido", "united kingdom", "londres", "london", "manchester", "birmingham"],
    "Alemania": ["alemania", "germany", "berlin", "berlín", "munich", "múnich", "frankfurt", "hamburgo", "hamburg"],
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

  const MODALITY = {
    terms: ["remoto", "remote", "hibrido", "híbrido", "hybrid", "presencial", "onsite"],
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

  /** Returns matched modality words present in the text (deduped, original casing lost -> canonical). */
  function detectModality(text) {
    const found = [];
    const canon = { "remote": "remoto", "hibrido": "híbrido", "hybrid": "híbrido", "onsite": "presencial" };
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

  return {
    ALL_COUNTRIES,
    LATAM,
    EUROPE,
    OTHER,
    countryList,
    detectCountry,
    detectModality,
    containsWord,
  };
});
