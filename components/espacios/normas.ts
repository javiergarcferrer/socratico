/**
 * Las normas de la conversación (docs/INFRAESTRUCTURA.md §10). Una sola lista:
 * la acepta quien va a comentar por primera vez y la publica `/comunidad/normas`.
 * Están escritas para lo que esta plataforma arriesga: hablar de personas con
 * nombre y apellido que manejan dinero público.
 */
export const NORMAS: { titulo: string; texto: string }[] = [
  {
    titulo: "Discute el registro, no a la persona",
    texto: "Critica decisiones, montos, plazos y procesos. No insultes, no amenaces, no te burles de nadie.",
  },
  {
    titulo: "Afirma solo lo que puedas sostener",
    texto: "Si afirmas un hecho, di de dónde sale: enlaza la ficha o el documento. Una opinión se dice como opinión.",
  },
  {
    titulo: "Nada de datos personales",
    texto: "Ni teléfonos, ni direcciones, ni cédulas, ni la vida privada de nadie, sea funcionario o no.",
  },
  {
    titulo: "Sin propaganda",
    texto: "Ni campañas, ni ventas, ni el mismo mensaje en muchas conversaciones.",
  },
  {
    titulo: "Firmas lo que escribes, con tu nombre",
    texto: "Es público y lleva tu nombre de firma, que sale en todos tus comentarios (si lo cambias, cambia en todos). No te hagas pasar por otra persona, medio o institución. Solo comentan personas con cédula registrada: responde por lo que dices.",
  },
  {
    titulo: "Se modera después, y a la vista",
    texto: "Tres reportes de personas distintas con cédula registrada ocultan un comentario hasta que se revise. Lo retirado queda marcado como tal. Romper estas normas puede suspenderte: la suspensión es de tu cédula, no solo de tu cuenta.",
  },
];
