import { GRUPOS, repartoDelMes, type Tenedores } from "@/lib/tenedores";
import { formatMes } from "@/lib/format";
import { BarraApilada, BarrasHorizontales, CATEGORICA, OTROS, type Segmento } from "@/components/graficos";
import { parte, pesosDeMillones } from "./formato";

/**
 * Quién tiene los bonos internos del Estado, en el último mes publicado: una
 * barra al 100 % con las familias de tenedores (las cinco mayores en la
 * categórica, en orden fijo de tamaño; el resto en «Otros»), y debajo, en la
 * forma completa, cada familia con su monto, su parte y los tipos de
 * tenedor que la forman, con el nombre que publica Crédito Público.
 *
 * La agrupación en familias es de Socrático (`lib/tenedores.ts`) y se dice.
 */
export function RepartoTenedores({ t, compacto = false }: { t: Tenedores; compacto?: boolean }) {
  const i = t.meses.length - 1;
  const reparto = repartoDelMes(t, i);
  const total = t.total[i];
  const mayores = reparto.slice(0, 5);
  const resto = reparto.slice(5);
  const segmentos: Segmento[] = [
    ...mayores.map((g, n) => ({
      clave: g.grupo,
      etiqueta: GRUPOS[g.grupo].nombre,
      valor: g.valor,
      clase: CATEGORICA[n].bg,
      cifra: parte(g.parte),
    })),
    ...(resto.length
      ? [
          {
            clave: "otros",
            etiqueta: `Otros (${resto.map((g) => GRUPOS[g.grupo].nombre.toLowerCase()).join(", ")})`,
            valor: resto.reduce((s, g) => s + g.valor, 0),
            clase: OTROS.bg,
            cifra: parte(resto.reduce((s, g) => s + g.parte, 0)),
          },
        ]
      : []),
  ];

  return (
    <div>
      <BarraApilada
        segmentos={segmentos}
        etiqueta={`Bonos internos del Estado por tipo de tenedor, ${formatMes(t.meses[i])}, sobre ${pesosDeMillones(total)}`}
        className="mt-4"
      />
      {!compacto && (
        <BarrasHorizontales
          etiqueta={`Monto en bonos internos por familia de tenedores, ${formatMes(t.meses[i])}`}
          filas
          className="-mx-5 mt-5 border-y border-hairline sm:-mx-6"
          barras={reparto.map((g) => ({
            clave: g.grupo,
            etiqueta: GRUPOS[g.grupo].nombre,
            titulo: `${GRUPOS[g.grupo].nombre}: ${pesosDeMillones(g.valor)}, ${parte(g.parte)}`,
            valor: g.valor,
            cifra: (
              <span className="whitespace-nowrap">
                {pesosDeMillones(g.valor)} <span className="text-ink-soft">· {parte(g.parte)}</span>
              </span>
            ),
            detalle: (
              <>
                {GRUPOS[g.grupo].explicacion}{" "}
                <span>
                  En el archivo: {g.filas.map((f) => `${f.nombre} (${pesosDeMillones(f.valor)})`).join("; ")}.
                </span>
              </>
            ),
          }))}
        />
      )}
    </div>
  );
}
