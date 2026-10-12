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
      "salta", "formosa", "la pampa", "santa rosa", "san fernando del valle de catamarca", "rawson", "rio grande", "río grande",
    ],
    "Chile": [
      "chile", "santiago", "valparaiso", "valparaíso", "concepcion", "concepción",
      "biobio", "biobío", "araucania", "araucanía", "coquimbo", "maule", "antofagasta", "atacama", "tarapaca", "tarapacá", "arica y parinacota", "metropolitana de santiago", "ohiggins", "o'higgins", "libertador general bernardo ohiggins",
      "los lagos", "los rios", "los ríos", "aysen", "aysén", "magallanes", "ñuble", "nuble", "viña del mar", "vina del mar", "temuco", "rancagua", "talca", "iquique", "puerto montt", "puerto aysen", "puerto natales",
    ],
    "México": [
      "mexico", "méxico", "cdmx", "ciudad de mexico", "ciudad de méxico", "guadalajara", "monterrey", "queretaro", "querétaro",
      "jalisco", "nuevo leon", "nuevo león", "puebla", "yucatan", "yucatán", "chihuahua", "baja california", "veracruz", "michoacan", "michoacán", "oaxaca", "chiapas",
      "cancun", "cancún", "quintana roo", "campeche", "tabasco", "merida", "mérida", "guanajuato", "san luis potosi", "san luis potosí",
      "aguascalientes", "sinaloa", "sonora", "durango", "zacatecas", "colima", "morelos", "guerrero", "hidalgo", "tlaxcala", "nayarit", "tamaulipas",
      "baja california sur", "coahuila", "coahuila de zaragoza", "estado de mexico", "estado de méxico", "edomex",
      "tijuana", "ciudad juarez", "ciudad juárez", "toluca", "cuernavaca", "hermosillo", "mazatlan", "mazatlán", "tuxtla gutierrez", "tuxtla gutiérrez",
    ],
    "Colombia": [
      "colombia", "bogota", "bogotá", "medellin", "medellín", "cali", "barranquilla",
      "antioquia", "valle del cauca", "atlantico", "atlántico", "cundinamarca", "bolivar", "bolívar", "narino", "nariño", "tolima",
      "santander", "norte de santander", "caldas", "risaralda", "quindio", "quindío", "huila", "meta", "cauca", "boyaca", "boyacá", "magdalena",
      "amazonas", "arauca", "caqueta", "caquetá", "casanare", "choco", "chocó", "guainia", "guainía", "guaviare", "putumayo", "san andres y providencia", "san andrés y providencia", "sucre", "vaupes", "vaupés", "vichada",
      "cartagena", "bucaramanga", "pereira", "manizales", "ibague", "ibagué", "villavicencio", "santa marta", "armenia",
    ],
    "Perú": ["peru", "perú", "lima", "arequipa", "cusco", "la libertad", "piura", "lambayeque", "junin", "junín", "callao", "trujillo", "chiclayo", "huancayo", "iquitos", "puno", "tacna", "ica", "amazonas", "ancash", "áncash", "apurimac", "apurímac", "ayacucho", "cajamarca", "huancavelica", "huanuco", "huánuco", "madre de dios", "moquegua", "pasco", "san martin", "san martín", "tumbes", "ucayali"],
    "Uruguay": ["uruguay", "montevideo", "canelones", "maldonado", "punta del este", "salto", "paysandu", "paysandú", "artigas", "cerro largo", "colonia", "durazno", "flores", "florida", "lavalleja", "rio negro", "río negro", "rivera", "rocha", "soriano", "tacuarembo", "tacuarembó", "treinta y tres"],
    "Brasil": [
      "brasil", "brazil", "sao paulo", "são paulo", "rio de janeiro", "belo horizonte",
      "bahia", "bahía", "parana", "paraná", "rio grande do sul", "pernambuco", "ceara", "ceará", "santa catarina", "brasilia", "brasília", "curitiba", "porto alegre",
      "goias", "goiás", "amazonas", "estado do pará", "pará", "distrito federal", "minas gerais", "espirito santo", "espírito santo", "mato grosso", "mato grosso do sul", "maranhao", "maranhão",
      "piaui", "piauí", "sergipe", "alagoas", "rondonia", "rondônia", "acre", "amapa", "amapá", "tocantins", "roraima", "paraiba", "paraíba", "rio grande do norte", "florianopolis", "florianópolis", "recife", "fortaleza", "salvador", "manaus", "goiania", "goiânia", "campinas", "niteroi", "niterói",
    ],
    "Ecuador": ["ecuador", "quito", "guayaquil", "cuenca", "ambato", "loja", "manabi", "manabí", "azuay", "pichincha", "bolivar", "bolívar", "canar", "cañar", "carchi", "chimborazo", "cotopaxi", "el oro", "esmeraldas", "galapagos", "galápagos", "guayas", "imbabura", "los rios", "los ríos", "morona santiago", "napo", "orellana", "pastaza", "santa elena", "santo domingo de los tsachilas", "sucumbios", "sucumbíos", "tungurahua", "zamora chinchipe"],
    "Bolivia": ["bolivia", "la paz", "santa cruz de la sierra", "cochabamba", "sucre", "oruro", "tarija", "potosi", "potosí", "beni", "pando"],
    "Paraguay": ["paraguay", "asuncion", "asunción", "ciudad del este", "encarnacion", "encarnación", "central", "alto paraguay", "alto parana", "alto paraná", "amambay", "boqueron", "boquerón", "caaguazu", "caaguazú", "caazapa", "caazapá", "canindeyu", "canindeyú", "concepcion", "concepción", "cordillera", "guaira", "guairá", "itapua", "itapúa", "misiones", "neembucu", "ñeembucú", "paraguari", "paraguarí", "presidente hayes", "san pedro"],
    "Venezuela": ["venezuela", "caracas", "amazonas", "anzoategui", "anzoátegui", "apure", "aragua", "barinas", "bolivar", "bolívar", "carabobo", "cojedes", "delta amacuro", "falcon", "falcón", "guarico", "guárico", "lara", "merida", "mérida", "miranda", "monagas", "nueva esparta", "portuguesa", "sucre", "tachira", "táchira", "trujillo", "vargas", "yaracuy", "zulia"],
    "Panamá": ["panama", "panamá", "ciudad de panama", "ciudad de panamá", "san miguelito", "colon", "colón", "chiriqui", "chiriquí", "bocas del toro", "cocle", "coclé", "darien", "darién", "herrera", "los santos", "panama oeste", "panamá oeste", "veraguas", "guna yala", "ngabe bugle", "ngäbe buglé", "embera wounaan", "emberá wounaan"],
    "Costa Rica": ["costa rica", "san jose", "san josé", "alajuela", "heredia", "cartago", "guanacaste", "puntarenas", "limon", "limón"],
    "República Dominicana": ["republica dominicana", "república dominicana", "santo domingo", "azua", "bahoruco", "barahona", "dajabon", "dajabón", "distrito nacional", "duarte", "el seibo", "elias pina", "elías piña", "espaillat", "hato mayor", "hermanas mirabal", "independencia", "la altagracia", "la romana", "la vega", "maria trinidad sanchez", "maría trinidad sánchez", "monsenor nouel", "monseñor nouel", "monte cristi", "monte plata", "pedernales", "peravia", "puerto plata", "samana", "samaná", "san cristobal", "san cristóbal", "san jose de ocoa", "san josé de ocoa", "san juan", "san pedro de macoris", "san pedro de macorís", "sanchez ramirez", "sánchez ramírez", "santiago", "santiago rodriguez", "santiago rodríguez", "santo domingo provincia", "valverde"],
    "Guatemala": ["guatemala", "alta verapaz", "baja verapaz", "chimaltenango", "chiquimula", "el progreso", "escuintla", "guatemala departamento", "huehuetenango", "izabal", "jalapa", "jutiapa", "peten", "petén", "quetzaltenango", "quiche", "quiché", "retalhuleu", "sacatepequez", "sacatepéquez", "san marcos", "santa rosa", "solola", "sololá", "suchitepequez", "suchitepéquez", "totonicapan", "totonicapán", "zacapa"],
    "Honduras": ["honduras", "atlantida", "atlántida", "choluteca", "colon", "colón", "comayagua", "copan", "copán", "cortes", "cortés", "el paraiso", "el paraíso", "francisco morazan", "francisco morazán", "gracias a dios", "intibuca", "intibucá", "islas de la bahia", "islas de la bahía", "la paz", "lempira", "ocotepeque", "olancho", "santa barbara", "santa bárbara", "valle", "yoro"],
    "El Salvador": ["el salvador", "ahuachapan", "ahuachapán", "cabanas", "cabañas", "chalatenango", "cuscatlan", "cuscatlán", "la libertad", "la paz", "la union", "la unión", "morazan", "morazán", "san miguel", "san salvador", "san vicente", "santa ana", "sonsonate", "usulutan", "usulután"],
    "Nicaragua": ["nicaragua", "boaco", "carazo", "chinandega", "chontales", "esteli", "estelí", "granada", "jinotega", "leon", "león", "madriz", "managua", "masaya", "matagalpa", "nueva segovia", "rio san juan", "río san juan", "rivas", "region autonoma de la costa caribe norte", "region autonoma de la costa caribe sur"],
    "Cuba": ["cuba", "artemisa", "camaguey", "camagüey", "ciego de avila", "ciego de ávila", "cienfuegos", "granma", "guantanamo", "guantánamo", "holguin", "holguín", "la habana", "las tunas", "matanzas", "mayabeque", "pinar del rio", "pinar del río", "sancti spiritus", "sancti spíritus", "santiago de cuba", "villa clara", "isla de la juventud"],
    "Haití": ["haiti", "haití", "artibonite", "centre", "grand'anse", "nippes", "nord", "nord-est", "nord-ouest", "ouest", "sud", "sud-est"],
    "Belice": ["belice", "belize", "belmopan", "belize district", "cayo", "corozal", "orange walk", "stann creek", "toledo"],
    "Guyana": ["guyana", "georgetown", "barima-waini", "pomeroon-supenaam", "essequibo islands-west demerara", "demerara-mahaica", "mahaica-berbice", "east berbice-corentyne", "cuyuni-mazaruni", "potaro-siparuni", "upper takutu-upper essequibo", "upper demerara-berbice"],
    "Surinam": ["surinam", "suriname", "paramaribo", "brokopondo", "commewijne", "coronie", "marowijne", "nickerie", "para", "saramacca", "sipaliwini", "wanica"],
  };

  const EUROPE = {
    "España": [
      "espana", "españa", "spain", "madrid", "barcelona", "valencia", "sevilla", "bilbao",
      "cataluña", "cataluna", "andalucia", "andalucía", "pais vasco", "país vasco", "galicia", "aragon", "aragón", "canarias", "murcia",
      "mallorca", "palma", "baleares", "islas baleares", "santiago de compostela", "islas canarias", "canary islands", "gran canaria", "lanzarote", "fuerteventura", "la palma", "la gomera", "el hierro", "castilla y leon", "castilla y león", "castilla la mancha", "extremadura", "asturias", "cantabria", "navarra", "la rioja", "zaragoza", "malaga", "málaga", "granada", "alicante", "a coruña", "vigo", "valladolid", "toledo", "girona", "tarragona", "lleida", "ibiza", "menorca", "tenerife", "las palmas", "oviedo", "pamplona", "donostia", "san sebastian", "san sebastián",
      "alava", "álava", "albacete", "almeria", "almería", "avila", "ávila", "badajoz", "burgos", "caceres", "cáceres", "cadiz", "cádiz", "castellon", "castellón", "ceuta", "ciudad real", "cordoba", "córdoba", "cuenca", "guadalajara", "guipuzcoa", "guipúzcoa", "huelva", "huesca", "jaen", "jaén", "leon", "león", "lerida", "lérida", "lugo", "melilla", "ourense", "palencia", "pontevedra", "salamanca", "segovia", "soria", "teruel", "vizcaya", "zamora", "santa cruz de tenerife",
    ],
    "Reino Unido": ["reino unido", "united kingdom", "londres", "london", "manchester", "birmingham", "england", "scotland", "wales", "northern ireland", "edinburgh", "glasgow", "leeds", "liverpool", "bristol", "cambridge", "oxford", "cardiff", "belfast", "sheffield", "nottingham", "newcastle", "brighton"],
    "Alemania": [
      "alemania", "germany", "berlin", "berlín", "munich", "múnich", "frankfurt", "hamburgo", "hamburg",
      "baviera", "bavaria", "renania", "hesse", "hessen", "north rhine-westphalia", "baden-wurttemberg", "baden-württemberg", "saxony", "lower saxony", "cologne", "köln", "dusseldorf", "düsseldorf", "stuttgart", "dresden", "leipzig", "nuremberg", "nürnberg", "bonn", "brandenburg", "bremen", "mecklenburg-vorpommern", "niedersachsen", "rheinland-pfalz", "rheinland-palatinate", "rhineland-palatinate", "saarland", "sachsen-anhalt", "saxony-anhalt", "schleswig-holstein", "thuringia", "thüringen",
    ],
    "Francia": ["francia", "france", "paris", "parís", "lyon", "marsella", "marseille", "toulouse", "nantes", "lille", "bordeaux", "burdeos", "nice", "niza", "strasbourg", "montpellier", "provence", "ile-de-france", "île-de-france", "auvergne-rhone-alpes", "auvergne-rhône-alpes", "bourgogne-franche-comte", "bourgogne-franche-comté", "bretagne", "brittany", "centre-val de loire", "corse", "corsica", "grand est", "hauts-de-france", "normandie", "normandy", "nouvelle-aquitaine", "occitanie", "pays de la loire", "provence-alpes-cote d'azur", "provence-alpes-côte d'azur", "guayana francesa", "french guiana", "martinique", "guadeloupe", "reunion", "réunion", "mayotte"],
    "Italia": ["italia", "italy", "roma", "rome", "milan", "milán", "milano", "turin", "torino", "naples", "napoli", "bologna", "florence", "firenze", "venice", "venezia", "sicilia", "toscana", "lazio", "abruzzo", "basilicata", "calabria", "campania", "emilia-romagna", "friuli-venezia giulia", "liguria", "lombardia", "marche", "molise", "piemonte", "puglia", "sardegna", "trentino-alto adige", "umbria", "valle d'aosta", "veneto"],
    "Portugal": ["portugal", "lisboa", "lisbon", "oporto", "porto", "braga", "coimbra", "faro", "aveiro", "madeira", "algarve", "acores", "açores", "beja", "braganca", "bragança", "castelo branco", "evora", "évora", "guarda", "leiria", "portalegre", "santarem", "santarém", "setubal", "setúbal", "viana do castelo", "vila real", "viseu"],
    "Países Bajos": ["paises bajos", "países bajos", "holanda", "netherlands", "amsterdam", "ámsterdam", "rotterdam", "utrecht", "the hague", "la haya", "eindhoven", "groningen", "limburg", "north holland", "south holland", "drenthe", "flevoland", "friesland", "gelderland", "noord-brabant", "north brabant", "overijssel", "zeeland"],
    "Irlanda": ["irlanda", "ireland", "dublin", "dublín", "cork", "galway", "limerick", "leinster", "munster"],
    "Polonia": ["polonia", "poland", "varsovia", "warsaw", "cracovia", "krakow", "wroclaw", "wrocław", "gdansk", "gdańsk", "poznan", "poznań", "lodz", "łódź", "dolnoslaskie", "dolnośląskie", "kujawsko-pomorskie", "lubelskie", "lubuskie", "lodzkie", "łódzkie", "malopolskie", "małopolskie", "mazowieckie", "opolskie", "podkarpackie", "podlaskie", "pomorskie", "slaskie", "śląskie", "swietokrzyskie", "świętokrzyskie", "warminsko-mazurskie", "warmińsko-mazurskie", "wielkopolskie", "zachodniopomorskie"],
    "Bélgica": ["belgica", "bélgica", "belgium", "bruselas", "brussels", "antwerp", "amberes", "ghent", "gante", "wallonia", "flanders", "antwerp province", "limburg", "east flanders", "flemish brabant", "west flanders", "hainaut", "liege", "liège", "luxembourg province", "namur", "walloon brabant"],
    "Suiza": ["suiza", "switzerland", "zurich", "zúrich", "ginebra", "geneva", "lausanne", "basel", "berna", "bern", "ticino", "vaud", "aargau", "appenzell ausserrhoden", "appenzell innerrhoden", "basel-landschaft", "basel-stadt", "fribourg", "glarus", "graubunden", "graubünden", "jura", "lucerne", "neuchatel", "neuchâtel", "nidwalden", "obwalden", "schaffhausen", "schwyz", "solothurn", "st gallen", "thurgau", "uri", "valais", "zug"],
    "Rumania": ["rumania", "romania", "bucarest", "bucharest", "cluj-napoca", "timisoara", "timișoara", "iasi", "iași", "brasov", "brașov"],
    "Austria": ["austria", "viena", "wien", "salzburg", "graz", "innsbruck", "linz", "burgenland", "carinthia", "lower austria", "styria", "tyrol", "upper austria", "vorarlberg"],
    "Suecia": ["suecia", "sweden", "estocolmo", "stockholm", "gothenburg", "gotemburgo", "malmo", "malmö", "uppsala", "blekinge", "dalarna", "gavleborg", "gotland", "halland", "jamtland", "jonkoping", "kalmar", "kronoberg", "norrbotten", "orebro", "ostergotland", "skane", "sodermanland", "varmland", "vasterbotten", "vasternorrland", "vastmanland", "vastra gotaland"],
    "Noruega": ["noruega", "norway", "oslo", "bergen", "stavanger", "trondheim", "agder", "akershus", "buskerud", "finnmark", "innlandet", "more og romsdal", "nordland", "rogaland", "telemark", "troms", "trondelag", "vestfold", "vestland", "viken", "ostfold", "østfold"],
    "Dinamarca": ["dinamarca", "denmark", "copenhague", "copenhagen", "aarhus", "odense", "capital region of denmark", "central denmark", "north denmark", "region zealand", "region of southern denmark"],
    "Finlandia": ["finlandia", "finland", "helsinki", "tampere", "turku", "oulu", "central finland", "central ostrobothnia", "kainuu", "kanta-hame", "kymenlaakso", "lapland", "north karelia", "north ostrobothnia", "north savonia", "ostrobothnia", "päijät-häme", "pirkanmaa", "satakunta", "south karelia", "south ostrobothnia", "south savonia", "tavastia proper", "uusimaa", "varsinais-suomi"],
    "Grecia": ["grecia", "greece", "atenas", "athens", "thessaloniki", "tesalonica", "attica", "central greece", "central macedonia", "crete", "eastern macedonia and thrace", "epirus", "ionian islands", "north aegean", "peloponnese", "south aegean", "thessaly", "western greece", "western macedonia"],
    "República Checa": ["republica checa", "república checa", "czech republic", "czechia", "praga", "prague", "brno", "central bohemian", "south bohemian", "plzen", "karlovy vary", "usti nad labem", "liberec", "hradec kralove", "pardubice", "vysocina", "south moravian", "olomouc", "zlin", "moravian-silesian"],
    "Hungría": ["hungria", "hungría", "hungary", "budapest", "debrecen", "bacs-kiskun", "baranya", "bekes", "borsod-abauj-zemplen", "csongrad-csanad", "fejer", "gyor-moson-sopron", "hajdu-bihar", "heves", "jasz-nagykun-szolnok", "komarom-esztergom", "nograd", "pest", "somogy", "szabolcs-szatmar-bereg", "tolna", "vas", "veszprem", "zala"],
    "Bulgaria": ["bulgaria", "sofia", "plovdiv", "varna", "burgas", "blagoevgrad", "dobrich", "gabrovo", "haskovo", "kardzhali", "kyustendil", "lovech", "montana", "pazardzhik", "pernik", "pleven", "razgrad", "ruse", "shumen", "silistra", "sliven", "smolyan", "sofia province", "stara zagora", "targovishte", "veliko tarnovo", "vidin", "vratsa", "yambol"],
    "Croacia": ["croacia", "croatia", "zagreb", "split", "rijeka", "osijek", "bjelovar-bilogora", "brod-posavina", "dubrovnik-neretva", "istra", "karlovac", "koprivnica-krizevci", "krapina-zagorje", "lika-senj", "medimurje", "međimurje", "osijek-baranja", "pozega-slavonia", "primorje-gorski kotar", "sibenik-knin", "šibenik-knin", "sisak-moslavina", "split-dalmatia", "varazdin", "varaždin", "virovitica-podravina", "vukovar-srijem", "zadar", "zagreb county"],
    "Chipre": ["chipre", "cyprus", "nicosia", "limassol", "larnaca", "paphos", "famagusta", "kyrenia"],
    "Estonia": ["estonia", "tallinn", "tartu", "harju", "hiiu", "ida-viru", "jarva", "jogeva", "laane", "laane-viru", "parnu", "polva", "rapla", "saare", "tartu county", "valga", "viljandi", "voru"],
    "Letonia": ["letonia", "latvia", "riga", "kurzeme", "latgale", "vidzeme", "zemgale", "augšdaugava", "dienvidkurzeme", "kekava", "marupe", "olaine", "salaspils", "sigulda", "adazi"],
    "Lituania": ["lituania", "lithuania", "vilnius", "kaunas", "klaipeda", "alytus", "kaunas county", "klaipeda county", "marijampole", "panevezys", "siauliai", "taurage", "telsiai", "utena", "vilnius county"],
    "Luxemburgo": ["luxemburgo", "luxembourg", "diekirch", "grevenmacher", "capellen", "clervaux", "esch-sur-alzette", "echternach", "mersch", "redange", "remich", "vianden", "wiltz"],
    "Malta": ["malta", "valletta", "gozo", "malta region", "northern region", "southern region", "south eastern region"],
    "Eslovaquia": ["eslovaquia", "slovakia", "bratislava", "kosice", "košice", "presov", "prešov", "banska bystrica", "nitra", "trencin", "trenčín", "trnava", "zilina", "žilina"],
    "Eslovenia": ["eslovenia", "slovenia", "ljubljana", "maribor", "celje", "coastal-karst", "carinthia", "central slovenia", "drava", "gorizia", "lower sava", "mura", "southeast slovenia", "savinja", "upper carniola", "central sava", "littoral-inner carniola"],
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
    "Guatemala": ["guatemala"],
    "Honduras": ["honduras"],
    "El Salvador": ["el salvador"],
    "Nicaragua": ["nicaragua"],
    "Cuba": ["cuba"],
    "Haití": ["haiti", "haití"],
    "Belice": ["belice", "belize"],
    "Guyana": ["guyana"],
    "Surinam": ["surinam", "suriname"],
    "Bulgaria": ["bulgaria"],
    "Croacia": ["croacia", "croatia"],
    "Chipre": ["chipre", "cyprus"],
    "Estonia": ["estonia"],
    "Letonia": ["letonia", "latvia"],
    "Lituania": ["lituania", "lithuania"],
    "Luxemburgo": ["luxemburgo", "luxembourg"],
    "Malta": ["malta"],
    "Eslovaquia": ["eslovaquia", "slovakia"],
    "Eslovenia": ["eslovenia", "slovenia"],
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
  const TITLE_CASE_LOWERCASE_WORDS = new Set(["de", "del", "do", "la", "las", "los", "y", "en"]);
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

  const AMBIGUOUS_LOCALITIES = new Set(["salta", "salto", "santander", "meta", "formosa", "armenia", "lima", "santiago", "santa fe", "cordoba", "córdoba", "morelos", "guerrero", "hidalgo", "colima", "durango", "sonora", "zacatecas", "nayarit", "campeche", "tabasco", "puebla", "tlaxcala", "queretaro", "querétaro", "chiapas", "veracruz", "michoacan", "michoacán", "oaxaca", "chihuahua", "jalisco", "sinaloa", "tamaulipas", "coahuila", "sucre", "amazonas", "cauca", "caldas", "arauca", "apure", "barinas", "lara", "merida", "mérida", "miranda", "monagas", "trujillo", "carabobo", "aragua", "cojedes", "para", "pará"]);
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
      if (idx !== -1 && (!best || idx < best.index || (idx === best.index && term.length > best.term.length))) {
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
        return { country, locality: first ? first.locality : null, secondLocality: nearbyLocality(text, country, first), ambiguousLocations: [] };
      }
    }
    // “Santiago” by itself is not a country. It can mean Santiago de Chile
    // or Santiago de Compostela, Spain; never silently turn this into Chile.
    // A complete locality (Santiago de Compostela / Santiago del Estero) or
    // an explicit country above resolves the choice without a follow-up.
    const santiagoIndex = foldAccents(text).indexOf("santiago");
    if (containsWord(text, "santiago") && hasLocationContext(text, originalIndexForFolded(text, santiagoIndex), "santiago") &&
        !containsWord(text, "santiago de compostela") && !containsWord(text, "santiago del estero")) {
      return {
        country: null,
        locality: null,
        secondLocality: null,
        ambiguousLocations: [
          { country: "Chile", locality: null },
          { country: "España", locality: "Santiago de Compostela" },
        ],
      };
    }
    // Resolve the earliest location mention. If multiple countries have an
    // equally specific locality at that exact point, return choices instead
    // of guessing based on catalog order. Longer names win over prefixes
    // (Mato Grosso do Sul over Mato Grosso; Santiago de Compostela over
    // Santiago).
    const matches = [];
    for (const country of Object.keys(ALL_COUNTRIES)) {
      const match = earliestLocalityMatch(text, country);
      if (!match) continue;
      matches.push({ country, index: match.index, term: match.term, locality: match.locality });
    }
    const firstIndex = matches.length ? Math.min(...matches.map((match) => match.index)) : -1;
    const firstMention = matches.filter((match) => match.index === firstIndex);
    const longest = firstMention.length ? Math.max(...firstMention.map((match) => match.term.length)) : 0;
    const specific = firstMention.filter((match) => match.term.length === longest);
    const distinctCountries = new Set(specific.map((match) => match.country));
    if (distinctCountries.size > 1) {
      return {
        country: null,
        locality: null,
        secondLocality: null,
        ambiguousLocations: specific.map((match) => ({ country: match.country, locality: match.locality })),
      };
    }
    const best = specific[0] || null;
    return best
      ? { country: best.country, locality: best.locality, secondLocality: nearbyLocality(text, best.country, best), ambiguousLocations: [] }
      : { country: null, locality: null, secondLocality: null, ambiguousLocations: [] };
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
