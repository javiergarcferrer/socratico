"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

/**
 * El cliente de TanStack Query de la plataforma: toda lectura que el
 * navegador hace a una ruta propia (`/api/*`, `/data/*`) pasa por aquí, con
 * las piezas de `lib/consultas.ts`.
 *
 * Lo que resuelve y antes se escribía a mano en cada buscador: cancelar la
 * petición vieja al teclear, no pisar la respuesta nueva con una tardía,
 * pedir una sola vez lo que dos componentes quieren a la vez, guardar lo leído
 * mientras se navega y conservar la lista anterior en pantalla mientras llega
 * la siguiente.
 *
 * No es una base de datos ni guarda nada fuera de la memoria de la pestaña:
 * la invariante (sin DB, sin claves) no se toca. Las mismas reglas que
 * `lib/pedir.ts` en el servidor: un reintento, y nada más.
 *
 * Se crea con `useState` y no en el módulo: en el servidor, un cliente de
 * módulo se compartiría entre peticiones de lectores distintos.
 */
export default function ProveedorConsultas({ children }: { children: React.ReactNode }) {
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Las rutas propias ya cachean con `revalidate`; un minuto en el
            // navegador basta para que volver atrás no repita la lectura.
            staleTime: 60_000,
            retry: 1,
            // Volver a la pestaña no es pedir los datos otra vez: la página
            // dice de cuándo es lo que muestra.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={cliente}>
      {children}
      {/* Solo en desarrollo: en producción el paquete exporta un componente vacío. */}
      <ReactQueryDevtools buttonPosition="bottom-left" />
    </QueryClientProvider>
  );
}
