// Every fixed string a person reads or hears on the page. The model writes the rest (in Spanish, by rule).

export const KINDS: Record<string, string> = {
  function: "función",
  method: "método",
  class: "clase",
  module: "módulo",
  type: "tipo",
  value: "valor",
  file: "archivo",
};

const SPANISH_KINDS = new Set(Object.values(KINDS));

/** The kind as shown: the model writes English ("method"); Spanish passes through; anything else is dropped. */
export function kindLabel(kind: unknown): string {
  const raw = typeof kind === "string" ? kind.trim().toLowerCase() : "";
  if (KINDS[raw]) return KINDS[raw]!;
  return SPANISH_KINDS.has(raw) ? raw : "";
}

export const S = {
  title: "Respuesta de Gafitas",
  puzzle: "rompecabezas",
  pieces: "Piezas, en orden",
  joints: "Uniones",
  projects: "Proyectos",
  newCode: "Código nuevo",
  idea: "Idea",
  isNew: "nuevo",
  adapt: "Adaptar…",
  note: "Nota:",
  watch: "Ojo:",
  right: "Correcto.",
  others: "Otros lugares encontrados",
  partly: "Parte de esta respuesta no se pudo dibujar. Se muestra el resto.",
  showProcess: "Ver el proceso",
  hideProcess: "Ocultar el proceso",
  thinking: "Lo que pensó Pi",
  openCode: "Abrir el código",
  reuses: "Reutiliza",
  fromScratch: "Empieza desde cero",
  effort: "Esfuerzo",
  tradeoff: "A cambio:",
  goThisWay: "Seguir por aquí",
  picked: "Elegido",
  sent: "Enviado",
  waitPi: "Podrás elegir cuando Pi termine.",
  pickOne: "Elige una",
  pickMany: "Elige las que quieras",
  go: "Seguir",
  willSend: "Se enviará:",
  pickFirst: "Elige al menos una opción.",
  somethingElse: "Escribir otra cosa…",
  columns: { tienes: "Ya tienes", falta: "Falta", decidir: "Por decidir" },
  noCodeYet: "Gafitas no encontró código tuyo para esto.",
  nothingHere: "Nada por aquí.",
  goesWith: "Va junto a",
  asked: "Ya preguntaste",
  howDoI: "¿Cómo lo hago?",
  helpDecide: "Ayúdame a decidir",
  next: "Sigue con",
  stop: "parada",
  stops: "paradas",
  of: "de",
  lines: "líneas",
  walkthrough: "recorrido",
  prevStep: "Paso anterior",
  nextStep: "Paso siguiente",
  prevStop: "Parada anterior",
  nextStop: "Parada siguiente",
  askLines: "Preguntar por estas líneas…",
  sureness: "Seguridad",
  noEquivalent: "sin equivalente en",
  sideBySide: "Ver lado a lado",
  howWould: "¿Cómo lo haría",
  explain: "Explícamelo",
  inside: "Ver por dentro",
  quizMe: "Ponme a prueba",
  quizMeMessage: "Ponme a prueba.",
  restsOn: (places: number, repos: string[]) =>
    `Se apoya en ${places === 1 ? "1 lugar" : `${places} lugares`} de tu código${repos.length ? `, en ${repos.join(" y ")}` : ""}.`,
};

export const stepOf = (n: number, count: number) => `paso ${n} de ${count}`;
export const stepsCount = (count: number) => (count === 1 ? "1 paso" : `${count} pasos`);
export const notQuite = (n: number) => `No exactamente: es la ${n}.`;
/** After the last Check of a quiz: "2 de 3 a la primera". */
export const quizScore = (right: number, of: number) => `${right} de ${of} a la primera`;
export const morePlaces = (n: number) => `Ver ${n} más`;
/** A fold in real code: "⋯ 6 líneas". */
export const hiddenLines = (n: number) => `⋯ ${n} líneas`;
export const showHidden = (n: number) => `Mostrar ${n} líneas ocultas`;
export const moreSteps = (n: number) => (n === 1 ? "y 1 paso más" : `y ${n} pasos más`);
export const alsoJoint = (a: string, b: string, label: string) => `Además, ${a} → ${b}: ${label}`;
export const adaptAria = (from: string, name: string) => (from ? `Adaptar ${from} para escribir ${name}` : `Preguntar cómo escribir ${name}`);

/** "línea 784" or "líneas 696 a 709", for VoiceOver. */
export const linesAria = (from: number, to: number) => (from === to ? `línea ${from}` : `líneas ${from} a ${to}`);
/** "adapters.py:696–709", on a tile. */
export const linesShort = (file: string, from: number, to: number) => `${file}:${from === to ? from : `${from}–${to}`}`;
export const openAria = (path: string, from: number, to: number) => `Abrir ${path}, ${linesAria(from, to)}`;

export const puzzleAria = (title: string, pieces: number, joints: number) =>
  `${title}. ${pieces} ${pieces === 1 ? "pieza" : "piezas"} y ${joints} ${joints === 1 ? "unión" : "uniones"}. Las flechas recorren los pasos.`;
