import type { NextConfig } from "next";

/*
  Rendimiento percibido, no solo medido.

  · `staleTimes`: el router del cliente reutiliza durante 30 s la respuesta
    de una ruta dinámica ya visitada (volver de una ficha al listado no
    vuelve a esperar al SIL) y 5 min la de una estática. Es la caché de
    navegación, no la de datos: cada dato sigue con su propia ventana.
  · Las instantáneas de `public/data` (nómina, fiscal, deuda) solo cambian
    con un despliegue: el navegador las guarda una hora y las renueva en
    segundo plano una vez pasada.
  · Sin cabecera `x-powered-by`: no aporta nada y pesa en cada respuesta.
  · El índice del buscador (`public/data/busqueda`: el índice ya construido
    con el corpus por columnas, vectores y modelo, ~97 MB) se lee con `fs`
    desde `lib/busqueda.ts`. Se declara aquí para que el trazado de archivos
    lo meta en la función de las rutas que lo usan y solo en ellas, sin
    depender de que adivine la ruta. `corpus.json` (47 MB) no viaja: es de lo
    que se construye el índice, y el servidor no lo lee.
*/
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // DuckDB (`lib/grafo-sql.ts`, solo en `/api/sql`) es un binario nativo: se
  // carga de node_modules tal cual, sin pasar por el empaquetado.
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  outputFileTracingIncludes: {
    "/buscar": ["./public/data/busqueda/**"],
    "/api/buscar": ["./public/data/busqueda/**"],
    "/proveedores": ["./public/data/busqueda/**"],
    // El padrón de empresas (~16 MB: filas en gzip, índice por palabra) lo
    // leen solo sus dos rutas; la clave casa también «/empresas/[rnc]». La
    // ficha de proveedor y /fuentes leen únicamente su meta.json, por ruta
    // literal, y no arrastran el resto.
    "/empresas": ["./public/data/empresas/**", "./datos/grafo/ld/**"],
    // El registro de decretos (~13 MB en un archivo por año, `lib/decretos.ts`)
    // se abre por un nombre que se arma en la consulta. Hoy el trazado lo
    // incluye solo; se declara para no depender de que lo siga adivinando en
    // las rutas que lo leen: la ficha de una persona y sus decretos firmados, y
    // la ficha de un decreto.
    // Toda ficha que es un nodo del grafo incrusta su schema.org, ya compilado
    // (`lib/grafo-ld.ts`): lleva `datos/grafo/ld/` y nada más del grafo.
    "/funcionarios": ["./public/data/decretos/**", "./public/data/wikidata.json", "./datos/grafo/ld/**"],
    "/normativa": ["./public/data/decretos/**", "./public/data/wikidata.json", "./datos/grafo/ld/**"],
    // El grafo semántico lee cada nodo del grafo compilado (`datos/grafo/`,
    // `lib/grafo-compilado.ts`), no las instantáneas de las que sale; busca
    // personas y bancos en su índice de nombres, y un camino recorre su índice
    // de vecinos. Del resto solo lleva el padrón: busca una empresa por RNC y
    // describe la que el compilado no trae. La clave casa también con
    // «/grafo/camino» y «/api/grafo».
    "/grafo": [
      "./datos/grafo/meta.json",
      "./datos/grafo/nodos/**",
      "./datos/grafo/vecinos/**",
      "./datos/grafo/nombres.json.br",
      "./public/data/empresas/**",
      "./public/data/wikidata.json",
    ],
    // VoID cuenta las clases del grafo y sus enlaces a Wikidata: los cuenta el compilador.
    "/.well-known": ["./datos/grafo/meta.json"],
    // El servidor MCP (`lib/mcp.ts`) busca en el índice y lee el grafo
    // compilado: los nodos, sus vecinos, lo publicado por institución, el
    // índice de nombres y los decretos de cada firma —de ahí y no de
    // `funcionarios.json`, `banca.json` ni del registro de decretos—. Lleva
    // además el padrón (empresas por nombre o RNC), la historia de las
    // compras desde 2015 (`lib/historico.ts`, que abre un archivo por el
    // último dígito del RPE) y las dos tablas que ordena
    // (`lib/tablas-compras.ts`: los procesos y el cruce de proveedores con
    // el RNC). No lleva DuckDB: `query` llama a `/api/sql`.
    "/mcp": [
      "./public/data/procesos.json",
      "./public/data/rnc/**",
      "./public/data/busqueda/**",
      "./public/data/historico/**",
      "./public/data/empresas/**",
      "./public/data/wikidata.json",
      "./datos/grafo/meta.json",
      "./datos/grafo/nodos/**",
      "./datos/grafo/vecinos/**",
      "./datos/grafo/compras.json",
      "./datos/grafo/nombres.json.br",
      "./datos/grafo/firmados/**",
    ],
    // SQL sobre las tablas del grafo (`lib/grafo-sql.ts`): el proceso hijo que
    // corre el motor (se carga de disco, sin empaquetar), los Parquet y la
    // biblioteca de DuckDB, que `duckdb.node` enlaza por su cuenta y el
    // trazado no ve.
    "/api/sql": ["./lib/sql-hijo.cjs", "./public/tablas/*.parquet", "./node_modules/@duckdb/node-bindings-linux-x64/**"],
    "/instituciones": ["./public/data/wikidata.json", "./datos/grafo/ld/**"],
    "/banca": ["./public/data/wikidata.json", "./datos/grafo/ld/**"],
    "/provincias": ["./public/data/wikidata.json", "./datos/grafo/ld/**"],
    // Las fichas de proceso, de proveedor, de obra y de iniciativa son nodos del grafo: incrustan su schema.org.
    "/procesos": ["./datos/grafo/ld/**"],
    "/proveedores/": ["./datos/grafo/ld/**"],
    "/obras": ["./datos/grafo/ld/**"],
    // La ficha de una iniciativa: los corchetes casan con la ruta tal cual, no con las otras de
    // /congreso; como subcadena casan también con /api/feed/congreso/[id], que la excluye abajo.
    "/congreso/[id]": ["./datos/grafo/ld/**"],
  },
  // Las instantáneas que solo lee `scripts/build-busqueda.py` no viajan en
  // ninguna función: su contenido ya está en el corpus (los procesos, además,
  // en `/mcp`, que los incluye arriba). Tampoco el corpus mismo, que ya está
  // en `indice.bin`, ni el volcado del grafo: se sirven como archivo, de la
  // CDN.
  // Las claves casan como subcadena: «/proveedores» también es
  // «/proveedores/[rpe]» y «/api/proveedores», que no usan el índice.
  outputFileTracingExcludes: {
    "*": ["./public/data/{congreso,sentencias}.json", "./public/data/busqueda/corpus.json", "./public/data/grafo/grafo.{nt,trig}.gz"],
    // Vercel corre sobre glibc: la versión musl de DuckDB (~74 MB) sobra.
    "/api/sql": ["./node_modules/@duckdb/node-bindings-linux-x64-musl/**"],
    // Las fichas del grafo leen instantáneas por nombre variable y el trazado
    // les mete `public/data` entero; los procesos (~11 MB) solo los lee `/mcp`.
    // Las claves casan como subcadena: «/grafo» es también «/api/grafo».
    "/grafo": ["./public/data/procesos.json"],
    "/.well-known": ["./public/data/procesos.json"],
    "/empresas": ["./public/data/procesos.json"],
    "/banca": ["./public/data/procesos.json"],
    "/normativa": ["./public/data/procesos.json"],
    "/funcionarios": ["./public/data/procesos.json"],
    "/instituciones": ["./public/data/procesos.json"],
    "/provincias": ["./public/data/procesos.json"],
    "/proveedores/*": ["./public/data/busqueda/**"],
    "/api/proveedores": ["./public/data/busqueda/**"],
    // Los RSS no leen el grafo; el de una iniciativa casa con la clave «/congreso/[id]» de arriba.
    "/api/feed": ["./datos/grafo/**"],
  },
  experimental: {
    staleTimes: { dynamic: 30, static: 300 },
  },
  /*
    Negociación de contenido del grafo semántico: la dirección de una ficha
    nombra una cosa (`…/funcionarios/x#id`), y quien la pide en RDF —con
    `Accept: text/turtle`, `application/ld+json` o `application/n-triples` y
    sin `text/html`— recibe un 303 a su descripción (`/api/grafo`), como
    manda «Cool URIs for the Semantic Web» (W3C). Un navegador siempre pide
    HTML y nunca entra aquí. Es una regla del enrutador: no despierta ninguna
    función ni cambia la caché de la página. `/ontologia` hace lo mismo hacia
    su Turtle, su JSON-LD o sus N-Triples.
  */
  async redirects() {
    const formatos = [
      { formato: "ttl", acepta: "(?!.*text/html).*(?:text/turtle|application/x-turtle).*" },
      { formato: "jsonld", acepta: "(?!.*text/html).*application/ld\\+json.*" },
      { formato: "nt", acepta: "(?!.*text/html).*application/n-triples.*" },
    ];
    // Una ficha se pide también con el grafo de cada triple: TriG y N-Quads (la ontología no los tiene).
    const conGrafos = [
      { formato: "trig", acepta: "(?!.*text/html).*application/trig.*" },
      { formato: "nq", acepta: "(?!.*text/html).*application/n-quads.*" },
    ];
    const fichas = [
      "/funcionarios/:slug",
      "/instituciones/:id",
      "/banca/:slug",
      "/empresas/:rnc",
      "/normativa/decreto/:numero",
      "/normativa/ley/:numero",
      "/normativa/resolucion/:numero",
      "/provincias/:slug",
      "/proveedores/:rpe(\\d+)",
      "/procesos/:codigo",
      "/obras/:snip(\\d+)",
      "/congreso/:id(\\d+)",
    ];
    return [
      ...[...formatos, ...conGrafos].flatMap(({ formato, acepta }) =>
        fichas.map((ficha) => ({
          source: ficha,
          has: [{ type: "header" as const, key: "accept", value: acepta }],
          // El destino nombra los parámetros sin su patrón: `/proveedores/:rpe`.
          destination: `/api/grafo?nodo=${ficha.replace(/\([^)]*\)/g, "")}&formato=${formato}`,
          statusCode: 303 as const,
        })),
      ),
      ...formatos.map(({ formato, acepta }) => ({
        source: "/ontologia",
        has: [{ type: "header" as const, key: "accept", value: acepta }],
        destination: `/ontologia.${formato}`,
        statusCode: 303 as const,
      })),
      /*
        Los IRIs persistentes del vocabulario (`lib/rdf.ts`, W3ID): w3id.org
        manda `https://w3id.org/socratico/<ruta>` a `<este sitio>/<ruta>`, y
        aquí se resuelve. El núcleo y el módulo dominicano (con su versión o
        sin ella) son el mismo documento y se sirven por `Accept`; las formas
        SHACL y el perfil de Fabric IQ, siempre en Turtle.
      */
      ...formatos.map(({ formato, acepta }) => ({
        source: "/def/:modulo(core|do)/:version?",
        has: [{ type: "header" as const, key: "accept", value: acepta }],
        destination: `/ontologia.${formato}`,
        statusCode: 303 as const,
      })),
      { source: "/def/:modulo(core|do)/:version?", destination: "/ontologia", statusCode: 303 as const },
      { source: "/def/formas", destination: "/ontologia.shacl.ttl", statusCode: 303 as const },
      // Los grafos con nombre (`…/fuente/padron/2026-09-19`, `…/derivado/pep/…`): lo que se
      // dice de cada uno viaja en el TriG; quien sigue el IRI llega a la página de las fuentes.
      { source: "/:clase(fuente|derivado)/:ruta*", destination: "/fuentes", statusCode: 303 as const },
      { source: "/def/fabric", destination: "/ontologia.fabric.ttl", statusCode: 303 as const },
    ];
  },
  async headers() {
    return [
      {
        source: "/:dir(data|tablas)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
