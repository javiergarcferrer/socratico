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
  · El índice del buscador (`public/data/busqueda`: corpus, vectores, modelo
    e índice por palabra ya construido, ~98 MB) se lee con `fs` desde
    `lib/busqueda.ts`. Se declara aquí para que
    el trazado de archivos lo meta en la función de las tres rutas que lo usan
    y solo en ellas, sin depender de que adivine la ruta.
*/
const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/buscar": ["./public/data/busqueda/**"],
    "/api/buscar": ["./public/data/busqueda/**"],
    "/proveedores": ["./public/data/busqueda/**"],
    // El padrón de empresas (~16 MB: filas en gzip, índice por palabra) lo
    // leen solo sus dos rutas; la clave casa también «/empresas/[rnc]». La
    // ficha de proveedor y /fuentes leen únicamente su meta.json, por ruta
    // literal, y no arrastran el resto.
    "/empresas": ["./public/data/empresas/**"],
    // El registro de decretos (~13 MB en un archivo por año, `lib/decretos.ts`)
    // se abre por un nombre que se arma en la consulta. Hoy el trazado lo
    // incluye solo; se declara para no depender de que lo siga adivinando en
    // las rutas que lo leen: la ficha de una persona y sus decretos firmados, y
    // la ficha de un decreto.
    "/funcionarios": ["./public/data/decretos/**", "./public/data/wikidata.json"],
    "/normativa": ["./public/data/decretos/**", "./public/data/wikidata.json"],
    // El grafo semántico (`lib/grafo-rdf.ts`) describe cualquier nodo: lee las
    // instantáneas de personas, decretos, bancos, empresas, medidas,
    // declaraciones y los QID de Wikidata. La clave casa también con
    // «/grafo/camino» y «/api/grafo». Las fichas que incrustan su JSON-LD
    // leen además `wikidata.json`.
    "/grafo": [
      "./public/data/decretos/**",
      "./public/data/empresas/**",
      "./public/data/{funcionarios,declaraciones,sanciones,banca,wikidata}.json",
    ],
    // El servidor MCP (`lib/mcp.ts`) busca en el índice y describe nodos del
    // grafo: lleva lo de `/buscar` y lo de `/grafo`, y la historia de las
    // compras desde 2015 (`lib/historico.ts`, que abre un archivo por el
    // último dígito del RPE) para `contracting_history`.
    "/mcp": [
      "./public/data/busqueda/**",
      "./public/data/historico/**",
      "./public/data/decretos/**",
      "./public/data/empresas/**",
      "./public/data/{funcionarios,declaraciones,sanciones,banca,wikidata}.json",
    ],
    "/instituciones": ["./public/data/wikidata.json"],
    "/banca": ["./public/data/wikidata.json"],
    "/provincias": ["./public/data/wikidata.json"],
  },
  // Las instantáneas que solo lee `scripts/build-busqueda.py` no viajan en
  // ninguna función: su contenido ya está en el corpus.
  // Las claves casan como subcadena: «/proveedores» también es
  // «/proveedores/[rpe]» y «/api/proveedores», que no usan el índice.
  outputFileTracingExcludes: {
    "*": ["./public/data/{procesos,congreso,sentencias}.json"],
    "/proveedores/*": ["./public/data/busqueda/**"],
    "/api/proveedores": ["./public/data/busqueda/**"],
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
    const fichas = [
      "/funcionarios/:slug",
      "/instituciones/:id",
      "/banca/:slug",
      "/empresas/:rnc",
      "/normativa/decreto/:numero",
      "/provincias/:slug",
    ];
    return [
      ...formatos.flatMap(({ formato, acepta }) =>
        fichas.map((ficha) => ({
          source: ficha,
          has: [{ type: "header" as const, key: "accept", value: acepta }],
          destination: `/api/grafo?nodo=${ficha}&formato=${formato}`,
          statusCode: 303 as const,
        })),
      ),
      ...formatos.map(({ formato, acepta }) => ({
        source: "/ontologia",
        has: [{ type: "header" as const, key: "accept", value: acepta }],
        destination: `/ontologia.${formato}`,
        statusCode: 303 as const,
      })),
    ];
  },
  async headers() {
    return [
      {
        source: "/data/:path*",
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
