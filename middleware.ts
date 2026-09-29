import { NextResponse, type NextRequest } from "next/server";
import { rutaDirecta } from "@/lib/buscar";
import { enlace } from "@/lib/grafo";

/**
 * El atajo de `/buscar` («Ley 47-20», un RNC, un código de proceso, unas
 * siglas) como redirección HTTP. Dentro de la página, `redirect()` llega
 * después de que `app/loading.tsx` empezó a enviar la respuesta: el
 * navegador con JavaScript llegaba, pero la respuesta era un 200 sin
 * `Location`. La página conserva su propio atajo como red por si esto no
 * corre. Sin estado, sin variables de entorno: lee la URL y un JSON del
 * repositorio.
 *
 * `/empresas` hace lo mismo con un RNC de nueve cifras: va a su ficha, que,
 * si ese número no es de ninguna persona jurídica del padrón, lo dice y ofrece
 * buscarlo en el registro de proveedores. Aquí no se lee el padrón (el
 * middleware no tiene `fs`).
 */
export function middleware(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (req.nextUrl.pathname === "/empresas") {
    const cifras = q.replace(/[\s.\-/]/g, "");
    if (!/^\d{9}$/.test(cifras)) return NextResponse.next();
    return NextResponse.redirect(new URL(enlace.empresa(cifras), req.url), 307);
  }
  const destino = q ? rutaDirecta(q) : null;
  if (!destino) return NextResponse.next();
  return NextResponse.redirect(new URL(destino, req.url), 307);
}

export const config = { matcher: ["/buscar", "/empresas"] };
