/**
 * Spanish copy for the Course (source of truth; `course.en.ts` must mirror every key). Kept in its own
 * file because the course is long — `es.ts` spreads it in. Structure lives in `lib/course/modules.ts`
 * and `lib/course/lessons.ts`.
 *
 * Convention: plain label first, the real term in parentheses (see the student-terminology rule).
 * This file holds the shell, the interactive labs and setup forms, and the demos. The lesson text is
 * in `course.lessons.es.ts`; each module's header, tasks and quiz are in `course.modules.es.ts`.
 */
import { lessonsEs } from "./course.lessons.es";
import { modulesEs } from "./course.modules.es";

export const courseEs = {
  ...lessonsEs,
  ...modulesEs,
  // ── Shell ──────────────────────────────────────────────────────────
  "nav.course": "Curso",
  "mode.chat": "Chat",
  "mode.course": "Curso",
  "mode.label": "Modo de la aplicación",
  "course.subtitle":
    "Once módulos para entender y configurar una IA de verdad. Cada lección se hace aquí mismo: charlas con la IA, la configuras con formularios y compruebas lo aprendido. Muchas tareas se marcan solas al detectar tu configuración.",
  "course.progressLabel": "Progreso del curso",
  "course.progress": "{done} de {total} tareas · {percent}%",
  "course.copyReport": "Copiar informe",
  "course.reportCopied": "¡Informe copiado!",
  "course.reset": "Reiniciar progreso",
  "course.resetConfirm": "¿Seguro? Pulsa otra vez",
  "course.modulesLabel": "Módulos del curso",
  "course.group.start": "Primeros pasos",
  "course.group.talk": "Habla con la IA",
  "course.group.inside": "Cómo funciona por dentro",
  "course.group.powers": "Dale superpoderes",
  "course.moduleOf": "Módulo {n} de {total}",
  "course.checkAgain": "Comprobar de nuevo",
  "course.checking": "Comprobando…",
  "course.optionalTag": "(opcional)",
  "course.undo": "Deshacer",
  "course.task.quiz.title": "Comprueba lo que has aprendido",
  "course.manual.mark": "Ya lo he hecho",
  "course.manual.done": "Hecho ✓",
  "course.check.ok": "✓ Hecho",
  "course.check.pending": "Aún sin hacer",
  "course.quiz.check": "Comprobar",
  "course.quiz.tryAgain": "No es esa. Vuelve a leer la lección e inténtalo otra vez.",
  "course.reflect.placeholder": "Escribe aquí tu reflexión (al menos unas líneas)…",
  "course.reflect.save": "Guardar reflexión",
  "course.reflect.update": "Actualizar reflexión",
  "course.open.providers": "Abrir Proveedores",
  "course.open.mcp": "Abrir Herramientas",
  "course.open.plugins": "Abrir Cuentas",
  "course.open.library": "Abrir Biblioteca",
  "course.open.chat": "Ir al chat",
  "course.report.title": "Informe de progreso del curso",
  "course.report.summary": "Tareas completadas: {done} de {total} ({percent}%).",
  "course.start": "Empezar el curso",
  "course.continue": "Continuar donde lo dejaste",
  "course.moduleComplete": "Módulo completado ✓",
  "course.finished.title": "¡Has completado el curso!",
  "course.finished.body":
    "Has terminado todas las tareas obligatorias. Copia tu informe de progreso para adjuntarlo a tu memoria; tu avance queda guardado en este ordenador.",
  "course.shot.enlarge": "Ampliar la captura",
  "course.shot.close": "Cerrar",

  // ── Calculation tasks ──────────────────────────────────────────────
  "course.number.placeholder": "Tu resultado",
  "course.number.invalid": "Escribe un número, por ejemplo 12,5.",
  "course.number.low": "Te has quedado corto. Revisa la cuenta.",
  "course.number.high": "Te has pasado. Revisa la cuenta.",

  // ── Interactive chat (labs) ────────────────────────────────────────
  "course.lab.needProvider": "Para probarlo necesitas al menos un proveedor conectado (módulo 1).",
  "course.lab.needTwo": "Para comparar necesitas dos proveedores distintos. Añade el segundo en el módulo 1.",
  "course.lab.tryWith": "Prueba con:",
  "course.lab.pair": "Pareja {n}",
  "course.lab.placeholder": "Escribe tu mensaje y pulsa Intro…",
  "course.lab.send": "Enviar",
  "course.lab.sendSamples": "Enviar {n} veces",
  "course.lab.sendBoth": "Enviar a los dos",
  "course.lab.stop": "Parar",
  "course.lab.clear": "Limpiar",
  "course.lab.you": "Tú",
  "course.lab.ai": "IA",
  "course.lab.sample": "Respuesta {n}",
  "course.lab.prompt": "Prompt {name}",
  "course.lab.model": "Modelo {name}",
  "course.lab.answeredBy": "Respondió {who}",
  "course.lab.exhausted": "Todos tus proveedores están ocupados o han agotado su cuota. Espera unos segundos y reinténtalo.",
  "course.lab.systemLabel": "Instrucciones del sistema",
  "course.lab.systemHint": "(la IA las lee antes que tu mensaje)",
  "course.lab.temperature": "Temperatura",
  "course.lab.tempLow": "0 · precisa y repetible",
  "course.lab.tempHigh": "1 · creativa y variada",
  "course.lab.progress": "Llevas {done} de {total} mensajes.",
  "course.lab.contextTitle": "Lo que lee el modelo en cada turno",
  "course.lab.contextTurn": "Turno {n}",
  "course.lab.contextTokens": "~{tokens} tokens",
  "course.lab.contextHint": "Cada turno incluye todo lo anterior, no solo tu último mensaje. Por eso crece.",

  // ── Setup forms inside lessons ─────────────────────────────────────
  "course.setup.connected": "Conectados:",
  "course.setup.noneYet": "Aún no tienes ningún proveedor",
  "course.setup.allAdded": "Ya has conectado todos los proveedores gratuitos de la lista. ¡Perfecto!",
  "course.setup.verifyAdd": "Verificar y añadir {provider}",
  "course.setup.added": "✓ {provider} conectado. La app ya puede usarlo.",
  "course.setup.fs.make": "Crea una carpeta de pruebas con algunos archivos dentro.",
  "course.setup.fs.pick": "Pulsa el botón y elígela en el selector de tu sistema.",
  "course.setup.fs.wait": "Espera unos segundos a que el servidor de archivos arranque.",
  "course.setup.fs.running": "✓ En marcha",
  "course.setup.fs.starting": "Arrancando…",
  "course.setup.fs.notYet": "Sin conectar",
  "course.setup.fs.scoped": "La IA solo podrá ver esta carpeta: {folder}",
  "course.setup.lib.needKey": "Hace falta una clave de Gemini o de Mistral para indexar documentos (módulo 1).",
  "course.setup.lib.sample": "Usar el documento de ejemplo",
  "course.setup.lib.own": "Subir un archivo mío",
  "course.setup.lib.indexing": "Indexando…",
  "course.setup.lib.count": "✓ {n} documento(s) en la Biblioteca",
  "course.setup.lib.none": "Biblioteca vacía",
  "course.sample.doc.name": "Reglamento del club de ajedrez.txt",
  "course.sample.doc.body": [
    "REGLAMENTO DEL CLUB DE AJEDREZ DEL INSTITUTO ALBA",
    "",
    "1. Inscripción. Para apuntarse al club hay que pagar una cuota de 12 euros por trimestre. La inscripción se hace en la secretaría, de lunes a jueves, de 9:00 a 11:00.",
    "",
    "2. Horario. Las partidas libres se juegan los martes a las 17:00 en el aula 204. Los jueves, a la misma hora, hay clases con la entrenadora, Lucía Ferrer.",
    "",
    "3. Torneo. El torneo anual se celebra el segundo sábado de marzo en el gimnasio. El primer premio es un tablero de madera y una entrada gratuita para el torneo regional.",
    "",
    "4. Plazas. El club admite como máximo a 24 jugadores. Si hay más solicitudes, se hace un sorteo el primer martes de curso.",
    "",
    "5. Material. El club presta tableros y relojes. Quien rompa una pieza debe reponerla. Los móviles deben permanecer apagados durante las partidas.",
    "",
    "6. Normas de juego. Se aplica la regla de «pieza tocada, pieza movida». Las partidas rápidas duran 10 minutos por jugador; las de torneo, 25 minutos más 5 segundos por jugada.",
  ].join("\n"),

  // ── Demos: GPU memory ──────────────────────────────────────────────
  "course.vram.intro":
    "Elige el tamaño de un modelo y lo comprimido que está: verás cuánta memoria de la tarjeta gráfica (VRAM) necesita y qué tipo de equipo hace falta. Es una estimación orientativa.",
  "course.vram.params": "Tamaño del modelo (miles de millones de parámetros)",
  "course.vram.precision": "Precisión (cuánto está comprimido)",
  "course.vram.p16": "16 bits (completo)",
  "course.vram.p8": "8 bits",
  "course.vram.p4": "4 bits (comprimido)",
  "course.vram.result": "Necesitas unos {gb} GB de memoria de GPU (VRAM).",
  "course.vram.tier.laptop": "Cabe en un portátil normal o incluso solo con CPU.",
  "course.vram.tier.gamingGpu": "Necesitas una tarjeta gráfica dedicada con bastante memoria.",
  "course.vram.tier.workstation": "Necesitas una GPU profesional: no es viable en un portátil.",
  "course.vram.tier.datacenter": "Solo es viable en un centro de datos con varias GPU.",

  // ── Demos: cost ────────────────────────────────────────────────────
  "course.cost.intro":
    "Pega un texto, elige un modelo y mira cuánto costaría una pregunta suelta… y la misma conversación después de varios turnos, cuando el modelo tiene que volver a leer todo el historial.",
  "course.cost.sample":
    "Resume en cinco puntos las ventajas y los riesgos de usar inteligencia artificial para analizar documentos diplomáticos.",
  "course.cost.prompt": "Tu pregunta",
  "course.cost.answerTokens": "Longitud de cada respuesta (tokens)",
  "course.cost.turns": "Turnos de la conversación",
  "course.cost.model": "Precios de ejemplo:",
  "course.cost.free": "Capa gratuita (tus claves)",
  "course.cost.inPrice": "Entrada ($ por millón de tokens)",
  "course.cost.outPrice": "Salida ($ por millón de tokens)",
  "course.cost.priceNote":
    "Precios tomados de las diapositivas de clase; cambian con frecuencia, así que puedes editarlos.",
  "course.cost.single": "Un mensaje suelto: {tokens} tokens de entrada → {cost}",
  "course.cost.chat":
    "Una conversación de {turns} turnos envía {input} tokens de entrada en total → {cost}",
  "course.cost.insight":
    "Fíjate: el coste no crece de forma lineal, porque en cada turno se vuelve a enviar todo lo anterior.",

  // ── Demos: request inspector ───────────────────────────────────────
  "course.ri.intro":
    "Esta es la petición que viaja a {provider} cuando pulsas «enviar». Tu clave nunca se muestra: aquí aparece siempre oculta.",
  "course.ri.noProvider":
    "Aún no tienes ningún proveedor, así que esto es un ejemplo genérico y no se puede enviar. Añade uno en el módulo 1.",
  "course.ri.questionLabel": "Tu pregunta",
  "course.ri.defaultQuestion": "Explica en dos frases qué es una API REST.",
  "course.ri.send": "Enviar esta petición",
  "course.ri.requestTitle": "Lo que envía la app (petición)",
  "course.ri.responseTitle": "Lo que devuelve el servidor (respuesta)",
  "course.ri.f.url.name": "POST …/chat/completions",
  "course.ri.f.url.desc":
    "La dirección del servidor y la acción: enviar (POST) una conversación para que la complete.",
  "course.ri.f.auth.name": "Authorization: Bearer …",
  "course.ri.f.auth.desc": "Tu clave de API. Identifica quién pide y sirve para aplicar tus límites.",
  "course.ri.f.model.name": "model",
  "course.ri.f.model.desc": "Qué modelo debe responder. Cada proveedor tiene su catálogo.",
  "course.ri.f.messages.name": "messages",
  "course.ri.f.messages.desc":
    "La conversación entera: el prompt del sistema (system), tus mensajes (user) y los de la IA (assistant). Se reenvía completa en cada turno.",
  "course.ri.f.temperature.name": "temperature",
  "course.ri.f.temperature.desc": "Cuánta variedad o creatividad se permite al elegir cada palabra.",
  "course.ri.f.response.name": "choices / usage",
  "course.ri.f.response.desc":
    "La respuesta generada y el recuento de tokens usados, que es lo que algunos proveedores cobran.",

  // ── Demos: prompt builder ──────────────────────────────────────────
  "course.pb.intro":
    "Monta tu petición por piezas: rol, público, tarea, tono, formato, reglas y un ejemplo. Verás el texto que se enviaría. Escribe tus campos en el idioma que quieras.",
  "course.pb.role": "Rol (¿quién debe ser la IA?)",
  "course.pb.rolePh": "Un profesor de relaciones internacionales",
  "course.pb.audience": "Público (¿para quién es?)",
  "course.pb.audiencePh": "Estudiantes de primer curso",
  "course.pb.task": "Tarea (lo que quieres que haga)",
  "course.pb.taskPh": "Explica qué hace el Consejo de Seguridad de la ONU",
  "course.pb.tone": "Tono",
  "course.pb.tone.informative": "Informativo",
  "course.pb.tone.professional": "Profesional",
  "course.pb.tone.friendly": "Cercano",
  "course.pb.tone.persuasive": "Persuasivo",
  "course.pb.format": "Formato de la respuesta",
  "course.pb.format.paragraph": "Párrafo corto",
  "course.pb.format.bullets": "Lista de puntos",
  "course.pb.format.table": "Tabla",
  "course.pb.format.steps": "Pasos numerados",
  "course.pb.rules": "Reglas (opcional)",
  "course.pb.rulesPh": "Máximo 150 palabras, sin tecnicismos",
  "course.pb.example": "Ejemplo de lo que quieres (opcional)",
  "course.pb.examplePh": "Pega aquí un ejemplo del estilo o la estructura que buscas",
  "course.pb.preview": "Tu prompt",
  "course.pb.copy": "Copiar",
  "course.pb.copied": "¡Copiado!",
  "course.pb.useInChat": "Llevarlo al chat",
  "course.pb.tryHere": "Probar aquí",
  "course.pb.needRole": "Para que cuente en la tarea, rellena también el rol.",

  // ── Demos: key guide ───────────────────────────────────────────────
  "course.kg.getKey": "Conseguir una clave gratuita",
} as const;
