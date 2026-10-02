import type { EstadoConversacion } from "@/lib/espacios-cliente";
import { formatFecha } from "@/lib/format";

/**
 * Por qué este lector no puede votar, dicho antes del toque (docs/INFRAESTRUCTURA.md §11,
 * ergonomía §6). `null` si puede. La comparten la ficha y el feed.
 */
export function porQueNoVota(yo: EstadoConversacion | null): string | null {
  if (!yo) return null;
  if (yo.suspendido_hasta) return `Tu cuenta está suspendida hasta el ${formatFecha(yo.suspendido_hasta)}.`;
  if (!yo.correo) return "Verifica tu correo para votar.";
  return null;
}
