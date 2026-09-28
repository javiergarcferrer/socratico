"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { hrefCongreso, type FiltrosCongreso } from "./filtros";

const TODOS = "__todos";

/**
 * El tema de las iniciativas: los 15 grupos de la taxonomía del SIL.
 *
 * Quince enlaces serían cuatro filas de botones en el teléfono antes de la
 * primera iniciativa; en un `Select` es un control, y al elegir navega igual
 * que un enlace. Cambiar de tema conserva la búsqueda, el tipo y el estado, y
 * vuelve a la primera página.
 */
export default function SelectorTema({
  filtros,
  temas,
}: {
  filtros: FiltrosCongreso;
  temas: { id: number; nombre: string }[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  return (
    <div>
      <Label htmlFor="selector-tema" className="text-xs text-ink-soft">
        Tema
      </Label>
      <Select
        value={filtros.tema ? String(filtros.tema) : TODOS}
        onValueChange={(v) =>
          startTransition(() =>
            router.push(hrefCongreso({ ...filtros, tema: v === TODOS ? null : Number(v) })),
          )
        }
        disabled={pendiente}
      >
        <SelectTrigger id="selector-tema" className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS} ayuda="El registro entero, de todos los tipos y estados.">
            Todos los temas
          </SelectItem>
          {temas.map((t) => (
            <SelectItem key={t.id} value={String(t.id)}>
              {t.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
