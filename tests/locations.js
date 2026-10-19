// node tests/locations.js
// Province/state/region detection across every supported country, plus a
// check that common words don't false-positive into a country match.
const path = require("path");
const assert = require("assert");
const Countries = require(path.join(__dirname, "..", "js", "countries.js"));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, err });
  }
}

const provinceCases = [
  ["Puesto remoto en Santa Fe, Argentina.", "Argentina"],
  ["Buscamos analista en Tucumán.", "Argentina"],
  ["Vacante en Neuquén, patagonia argentina.", "Argentina"],
  ["Rol basado en Chaco.", "Argentina"],
  ["Puesto en Jalisco, México.", "México"],
  ["Vacante en Nuevo León.", "México"],
  ["Rol en Yucatán, modalidad híbrida.", "México"],
  ["Buscamos ingeniero en Antioquia, Colombia.", "Colombia"],
  ["Vacante en Valle del Cauca.", "Colombia"],
  ["Puesto en Cusco, Perú.", "Perú"],
  ["Buscamos en Piura.", "Perú"],
  ["Rol en Bahía, Brasil.", "Brasil"],
  ["Vacante en Rio Grande do Sul.", "Brasil"],
  ["Puesto en Cataluña, España.", "España"],
  ["Vacante en Andalucía.", "España"],
  ["Rol en el País Vasco.", "España"],
  ["Empresa alemana con sede en Baviera.", "Alemania"],
];

provinceCases.forEach(([text, expected]) => {
  test(`detects "${expected}" from province/region in: "${text}"`, () => {
    assert.strictEqual(Countries.detectCountry(text), expected);
  });
});

// Words that happen to look like a province/city but are common vocabulary
// or well-known brands unrelated to that place — must NOT false-positive.
const falsePositiveCases = [
  ["El candidato no salta de trabajo en trabajo, buena estabilidad laboral.", "Argentina", "salta (verb form) must not match Salta province"],
  ["Tiene experiencia trabajando para Banco Santander.", "México", "Santander (bank brand) must not match any Mexican-adjacent province term we might add later"],
];

falsePositiveCases.forEach(([text, notExpected, label]) => {
  test(`does not false-positive: ${label}`, () => {
    assert.notStrictEqual(Countries.detectCountry(text), notExpected);
  });
});

// detectLocationDetailed must title-case accented localities correctly —
// a naive \b-based regex mis-capitalizes accented letters (produced
// "NeuquÉN" and "MÉXico" instead of "Neuquén" and "México").
const localityCasingCases = [
  ["Vacante en Neuquén, Argentina.", "Argentina", "Neuquén"],
  ["Puesto en Ciudad de México.", "México", "Ciudad de México"],
  ["Rol en Jalisco, México.", "México", "Jalisco"],
];

localityCasingCases.forEach(([text, expectedCountry, expectedLocality]) => {
  test(`detectLocationDetailed capitalizes "${expectedLocality}" correctly`, () => {
    const { country, locality } = Countries.detectLocationDetailed(text);
    assert.strictEqual(country, expectedCountry);
    assert.strictEqual(locality, expectedLocality);
  });
});

// An explicit country name outranks an ambiguous or partial locality match.
test("an explicit country name outranks an ambiguous locality match from a different, earlier-checked country", () => {
  const { country, locality } = Countries.detectLocationDetailed("100% presencial en Santiago de Compostela, España.");
  assert.strictEqual(country, "España");
  assert.strictEqual(locality, "Santiago de Compostela");
});

test("a bare Santiago asks for the country and full locality without suggesting Chile", () => {
  const result = Countries.detectLocationDetailed("Vacante en Santiago, modalidad híbrida.");
  assert.strictEqual(result.country, null);
  assert.deepStrictEqual(result.ambiguousLocations, []);
  assert.strictEqual(result.locationNeedsClarification, true);
});

test("removes Chile and its subdivisions from the supported location catalog", () => {
  assert.strictEqual(Countries.ALL_COUNTRIES.Chile, undefined);
  assert.strictEqual(Countries.countryList().includes("Chile"), false);
  assert.strictEqual(Countries.detectCountry("Buscamos perfiles para Chile."), null);
  assert.strictEqual(Countries.detectCountry("Empresa con sede en Antofagasta."), null);
  const city = Countries.detectLocationDetailed("Vacante presencial en Santiago de Chile.");
  assert.strictEqual(city.country, null);
  assert.strictEqual(city.locationNeedsClarification, true);
});

test("a locality shared by countries asks for the correct country", () => {
  const mexicoSpain = Countries.detectLocationDetailed("Puesto presencial en Guadalajara.");
  assert.strictEqual(mexicoSpain.country, null);
  assert.deepStrictEqual(mexicoSpain.ambiguousLocations, [
    { country: "México", locality: "Guadalajara" },
    { country: "España", locality: "Guadalajara" },
  ]);
  const cordoba = Countries.detectLocationDetailed("Vacante en Córdoba.");
  assert.deepStrictEqual(cordoba.ambiguousLocations, [
    { country: "Argentina", locality: "Córdoba" },
    { country: "España", locality: "Córdoba" },
  ]);
});

// A complete locality name remains usable when it starts with a common
// short name, such as Santiago de Compostela.
test("a locality that's a strict prefix of a longer, more specific locality resolves to the longer one", () => {
  const { country, locality } = Countries.detectLocationDetailed("Buscamos alguien para trabajar en Santiago de Compostela.");
  assert.strictEqual(country, "España");
  assert.strictEqual(locality, "Santiago de Compostela");
});

test("Santiago with Spain explicitly means Santiago de Compostela, never Chile", () => {
  const result = Countries.detectLocationDetailed("Ubicación del puesto: España, Santiago.");
  assert.strictEqual(result.country, "España");
  assert.strictEqual(result.locality, "Santiago de Compostela");
  assert.strictEqual(result.locationNeedsClarification, false);
  assert.strictEqual(Countries.countryList().includes("Chile"), false);
});

test("longest locality wins when two names start at the same position", () => {
  const result = Countries.detectLocationDetailed("Puesto en Mato Grosso do Sul, Brasil.");
  assert.strictEqual(result.country, "Brasil");
  assert.strictEqual(result.locality, "Mato Grosso do Sul");
});

test("Argentina, Mexico and Spain subdivision catalogs cover their first-level divisions", () => {
  const fold = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const assertCatalogContains = (country, expected) => {
    const catalog = new Set(Countries.ALL_COUNTRIES[country].map(fold));
    expected.forEach((name) => assert.ok(catalog.has(fold(name)), `${country} is missing ${name}`));
  };

  assertCatalogContains("Argentina", [
    "Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán", "CABA",
  ]);
  assertCatalogContains("México", [
    "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "México", "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
  ]);
  assertCatalogContains("España", [
    "A Coruña", "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz", "Baleares", "Barcelona", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ciudad Real", "Córdoba", "Cuenca", "Girona", "Granada", "Guadalajara", "Guipúzcoa", "Huelva", "Huesca", "Jaén", "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid", "Málaga", "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca", "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo", "Valencia", "Valladolid", "Vizcaya", "Zamora", "Zaragoza",
  ]);
  assertCatalogContains("Brasil", ["Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"]);
  assertCatalogContains("Guatemala", ["Alta Verapaz", "Baja Verapaz", "Chimaltenango", "Chiquimula", "El Progreso", "Escuintla", "Guatemala departamento", "Huehuetenango", "Izabal", "Jalapa", "Jutiapa", "Petén", "Quetzaltenango", "Quiché", "Retalhuleu", "Sacatepéquez", "San Marcos", "Santa Rosa", "Sololá", "Suchitepéquez", "Totonicapán", "Zacapa"]);
  assertCatalogContains("Honduras", ["Atlántida", "Choluteca", "Colón", "Comayagua", "Copán", "Cortés", "El Paraíso", "Francisco Morazán", "Gracias a Dios", "Intibucá", "Islas de la Bahía", "La Paz", "Lempira", "Ocotepeque", "Olancho", "Santa Bárbara", "Valle", "Yoro"]);
  assertCatalogContains("El Salvador", ["Ahuachapán", "Cabañas", "Chalatenango", "Cuscatlán", "La Libertad", "La Paz", "La Unión", "Morazán", "San Miguel", "San Salvador", "San Vicente", "Santa Ana", "Sonsonate", "Usulután"]);
  assertCatalogContains("Nicaragua", ["Boaco", "Carazo", "Chinandega", "Chontales", "Estelí", "Granada", "Jinotega", "León", "Madriz", "Managua", "Masaya", "Matagalpa", "Nueva Segovia", "Río San Juan", "Rivas"]);
  assertCatalogContains("Panamá", ["Bocas del Toro", "Coclé", "Colón", "Chiriquí", "Darién", "Herrera", "Los Santos", "Panamá", "Panamá Oeste", "Veraguas", "Guna Yala", "Ngäbe Buglé"]);
  assertCatalogContains("Costa Rica", ["San José", "Alajuela", "Cartago", "Heredia", "Guanacaste", "Puntarenas", "Limón"]);
  assertCatalogContains("República Dominicana", ["Azua", "Bahoruco", "Barahona", "Dajabón", "Distrito Nacional", "Duarte", "El Seibo", "Elías Piña", "Espaillat", "Hato Mayor", "Hermanas Mirabal", "Independencia", "La Altagracia", "La Romana", "La Vega", "María Trinidad Sánchez", "Monseñor Nouel", "Monte Cristi", "Monte Plata", "Pedernales", "Peravia", "Puerto Plata", "Samaná", "San Cristóbal", "San José de Ocoa", "San Juan", "San Pedro de Macorís", "Sánchez Ramírez", "Santiago", "Santiago Rodríguez", "Santo Domingo", "Valverde"]);
  assertCatalogContains("Cuba", ["Artemisa", "Camagüey", "Ciego de Ávila", "Cienfuegos", "Granma", "Guantánamo", "Holguín", "La Habana", "Las Tunas", "Matanzas", "Mayabeque", "Pinar del Río", "Sancti Spíritus", "Santiago de Cuba", "Villa Clara", "Isla de la Juventud"]);
  assertCatalogContains("Haití", ["Artibonite", "Centre", "Grand'Anse", "Nippes", "Nord", "Nord-Est", "Nord-Ouest", "Ouest", "Sud", "Sud-Est"]);
  assertCatalogContains("Belice", ["Belize District", "Cayo", "Corozal", "Orange Walk", "Stann Creek", "Toledo"]);
  assertCatalogContains("Guyana", ["Barima-Waini", "Pomeroon-Supenaam", "Essequibo Islands-West Demerara", "Demerara-Mahaica", "Mahaica-Berbice", "East Berbice-Corentyne", "Cuyuni-Mazaruni", "Potaro-Siparuni", "Upper Takutu-Upper Essequibo", "Upper Demerara-Berbice"]);
  assertCatalogContains("Surinam", ["Brokopondo", "Commewijne", "Coronie", "Marowijne", "Nickerie", "Para", "Saramacca", "Sipaliwini", "Wanica"]);
  assertCatalogContains("Alemania", ["Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hesse", "Mecklenburg-Vorpommern", "Lower Saxony", "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"]);
  assertCatalogContains("Francia", ["Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire", "Corse", "Grand Est", "Hauts-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire", "Provence-Alpes-Côte d'Azur"]);
  assertCatalogContains("Italia", ["Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", "Friuli-Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche", "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana", "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto"]);
  assertCatalogContains("Países Bajos", ["Drenthe", "Flevoland", "Friesland", "Gelderland", "Groningen", "Limburg", "North Brabant", "North Holland", "Overijssel", "South Holland", "Utrecht", "Zeeland"]);
  assertCatalogContains("Polonia", ["Dolnośląskie", "Kujawsko-Pomorskie", "Lubelskie", "Lubuskie", "Łódzkie", "Małopolskie", "Mazowieckie", "Opolskie", "Podkarpackie", "Podlaskie", "Pomorskie", "Śląskie", "Świętokrzyskie", "Warmińsko-Mazurskie", "Wielkopolskie", "Zachodniopomorskie"]);
});

test("every configured locality resolves to its country when the JD names that country", () => {
  const fold = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let checked = 0;
  for (const [country, terms] of Object.entries(Countries.ALL_COUNTRIES)) {
    const bare = new Set((Countries.BARE_COUNTRY_NAMES[country] || [country]).map(fold));
    for (const term of terms) {
      const result = Countries.detectLocationDetailed(`Vacante ubicada en ${term}, ${country}.`);
      assert.strictEqual(result.country, country, `term "${term}" resolved to ${result.country}, expected ${country}`);
      if (!bare.has(fold(term))) assert.ok(result.locality, `locality "${term}" was lost for ${country}`);
      checked++;
    }
  }
  assert.ok(checked > 600, `expected broad catalog coverage, checked ${checked} terms`);
});

// A personal name that resembles an ambiguous city must not steal the
// location from a real locality later in the JD. Real JD fixture:
// tests/fixtures/pdf-modern-template-jd.txt.
test("an unrelated earlier name match doesn't override a real locality mentioned later", () => {
  const { country, locality } = Countries.detectLocationDetailed("Reporta a: Santiago Ahmed. Híbrido — Puerto Madero, CABA — Full Time.");
  assert.strictEqual(country, "Argentina");
  assert.strictEqual(locality, "CABA");
});

// Two cities the recruiter listed as equally valid options ("X y Y", or
// consecutive rows in a table once a PDF flattens the layout) must both
// come through — dropping the second one silently lost half the real
// candidate pool. Real JD (Sogeti España QA), see tests/jd-bank.js.
test("two cities mentioned right next to each other both come through as locality + secondLocality", () => {
  const r1 = Countries.detectLocationDetailed("UBICACIÓN CANDIDATO\nMADRID\nBARCELONA\nMODALIDAD");
  assert.strictEqual(r1.country, "España");
  assert.strictEqual(r1.locality, "Madrid");
  assert.strictEqual(r1.secondLocality, "Barcelona");

  const r2 = Countries.detectLocationDetailed("Localización: Madrid y Barcelona.");
  assert.strictEqual(r2.secondLocality, "Barcelona");
});

test("two cities mentioned far apart in the same JD do NOT get paired as secondLocality", () => {
  const farText = "Oficina central en Madrid. " + "x".repeat(200) + " También hay equipo en Barcelona.";
  const { secondLocality } = Countries.detectLocationDetailed(farText);
  assert.strictEqual(secondLocality, null);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)\n`);
if (failed) {
  failures.forEach((f) => console.log(`FAIL: ${f.name}\n  ${f.err.message}\n`));
  process.exit(1);
} else {
  console.log("All location checks passed.");
  process.exit(0);
}
