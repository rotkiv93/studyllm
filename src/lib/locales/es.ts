/**
 * Spanish translations — this is the source-of-truth dictionary.
 * Keys are namespaced by surface (e.g. `sidebar.*`, `onboarding.*`).
 * Placeholders use `{name}` syntax and are filled by `t(key, { name })`.
 */
export const es = {
  // ── Common / shared ────────────────────────────────────────────────
  "common.close": "Cerrar",
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "common.saving": "Guardando…",
  "common.delete": "Eliminar",
  "common.remove": "Quitar",
  "common.undo": "Deshacer",
  "common.edit": "Editar",
  "common.add": "Añadir",
  "common.loading": "Cargando…",
  "common.retry": "Reintentar",
  "common.back": "Atrás",
  "common.next": "Siguiente",
  "common.previous": "Anterior",
  "common.skip": "Omitir",
  "common.done": "Listo",
  "common.start": "Iniciar",
  "common.stop": "Detener",
  "common.yes": "Sí",
  "common.no": "No",
  "common.copy": "Copiar",
  "common.copied": "Copiado",
  "common.enabled": "Activado",
  "common.disabled": "Desactivado",

  // ── Language switcher ──────────────────────────────────────────────
  "language.title": "Idioma",
  "language.label": "Idioma de la aplicación",
  "language.hint": "Elige el idioma de la interfaz. Tu preferencia se recuerda la próxima vez que abras la app.",

  // ── Diagnostics (AppSettingsPanel) ─────────────────────────────────
  "diagnostics.title": "Diagnóstico",
  "diagnostics.crashLog": "Registro de errores",
  "diagnostics.crashLogHint":
    "Un registro local de errores de servidores MCP y fallos de la app; nada de esto sale nunca de este equipo. Útil si algo se rompe y quieres ver qué pasó.",
  "diagnostics.showLog": "Ver registro",
  "diagnostics.revealInFolder": "Mostrar en carpeta",
  "diagnostics.clear": "Borrar",
  "diagnostics.nothingLogged": "Nada registrado todavía.",

  // ── Sidebar ────────────────────────────────────────────────────────
  "sidebar.expand": "Expandir barra lateral",
  "sidebar.collapse": "Contraer barra lateral",
  "sidebar.newChat": "Nuevo chat",
  "sidebar.conversations": "Conversaciones",
  "sidebar.conversationHistory": "Historial de conversaciones",
  "sidebar.empty": "Tus conversaciones aparecerán aquí.",
  "sidebar.untitled": "Chat sin título",
  "sidebar.renameConversation": "Renombrar conversación",
  "sidebar.deleteConversation": "Eliminar conversación",
  "sidebar.library": "Biblioteca",
  "sidebar.documentLibrary": "Biblioteca de documentos",
  "sidebar.settings": "Ajustes",
  "sidebar.settingsSetup": "Ajustes y configuración",
  "sidebar.needsAttention": "Requiere atención",
  "sidebar.noActiveProviders": "No hay proveedores activos",

  // ── Navigation destinations ────────────────────────────────────────
  "nav.providers": "Proveedores",
  "nav.mcp": "Herramientas y conexiones",
  "nav.plugins": "Cuentas (Plugins)",
  "nav.explore": "Descubre cómo funciona",
  "nav.diagnostics": "Diagnóstico",

  // ── Tool call block ────────────────────────────────────────────────
  "toolCall.running": "Ejecutando…",
  "toolCall.failed": "Falló",
  "toolCall.done": "Hecho",
  "toolCall.input": "Entrada",
  "toolCall.output": "Salida",
  "toolCall.error": "Error",

  // ── Retrieved sources (RAG) ────────────────────────────────────────
  "sources.headOne": "Fuentes de tu biblioteca ({count} pasaje)",
  "sources.headOther": "Fuentes de tu biblioteca ({count} pasajes)",
  "sources.match": "{percent}% de coincidencia",

  // ── Study modes / starter prompts ──────────────────────────────────
  "study.browseAll": "Ver todo",
  "study.showFewer": "Ver menos",
  "study.topic.reading": "Lectura y análisis",
  "study.topic.writing": "Escritura y redacción",
  "study.topic.research": "Investigación y citas",
  "study.topic.study": "Estudio y repaso",

  "study.tpl.summarize.label": "Resumir un documento",
  "study.tpl.summarize.description": "Condensa un informe, tratado o lectura larga en puntos clave estructurados.",

  "study.tpl.explain-treaty.label": "Explicar un tratado o acuerdo",
  "study.tpl.explain-treaty.description": "Desglosa a qué compromete realmente un tratado o acuerdo a sus partes.",

  "study.tpl.extract-entities.label": "Extraer datos y entidades clave",
  "study.tpl.extract-entities.description": "Extrae personas, lugares, fechas y organizaciones de una fuente.",

  "study.tpl.translate-summarize.label": "Traducir y resumir una fuente",
  "study.tpl.translate-summarize.description": "Traduce una fuente en otro idioma al inglés y la resume.",

  "study.tpl.policy-brief.label": "Redactar un informe de políticas",
  "study.tpl.policy-brief.description": "Convierte tus notas en un informe de políticas o documento de posición estructurado.",

  "study.tpl.compare-positions.label": "Comparar las posturas de dos actores",
  "study.tpl.compare-positions.description": "Comparación lado a lado de la postura de dos países o actores sobre un tema.",

  "study.tpl.lit-review-outline.label": "Esquema de revisión bibliográfica",
  "study.tpl.lit-review-outline.description": "Convierte un tema y unas cuantas fuentes en un esquema estructurado de revisión bibliográfica.",

  "study.tpl.bibliography.label": "Formatear una bibliografía",
  "study.tpl.bibliography.description": "Formatea referencias en estilo APA, MLA o Chicago.",

  "study.tpl.catalog-metadata.label": "Catalogar un documento (metadatos)",
  "study.tpl.catalog-metadata.description": "Genera metadatos archivísticos descriptivos para un documento.",

  "study.tpl.flashcards.label": "Crear fichas o cuestionario",
  "study.tpl.flashcards.description": "Genera fichas de estudio o un cuestionario breve a partir de un documento o tema.",

  // ── Onboarding wizard ──────────────────────────────────────────────
  "onboarding.title": "Bienvenido a StudyLLM",
  "onboarding.skipSetup": "Omitir configuración",
  "onboarding.providerHint":
    "StudyLLM funciona con tus propias claves de API gratuitas: no necesitas ninguna suscripción. Elige un proveedor para empezar; podrás añadir más luego en Ajustes.",
  "onboarding.recommended": "Recomendado",
  "onboarding.continueWith": "Continuar con {provider}",
  "onboarding.keyHint": "Consigue una clave de API gratuita de {provider}, pégala abajo y comprobaremos que funciona.",
  "onboarding.getKeyLink": "Consigue una clave de API gratuita de {provider}",
  "onboarding.apiKey": "Clave de API",
  "onboarding.pasteKey": "Pega la clave…",
  "onboarding.verifying": "Comprobando la clave…",
  "onboarding.verified": "Clave verificada: se encontraron modelos disponibles.",
  "onboarding.verifyFailed":
    "No se pudo verificar esta clave con la lista de modelos en vivo. Revísala o continúa de todos modos si estás seguro de que es correcta.",
  "onboarding.saveFailed": "No se pudo guardar este proveedor: {error}",
  "onboarding.addAnyway": "Añadir de todos modos",
  "onboarding.verifyAndContinue": "Verificar y continuar",
  "onboarding.verifyingShort": "Verificando…",
  "onboarding.mcpHint":
    "¿Quieres que el asistente pueda leer y escribir archivos en una carpeta de este equipo? Puedes limitarlo a la carpeta que elijas, y cambiarla o quitarla más adelante.",
  "onboarding.mcpFailed": "No se pudo añadir el acceso a archivos: {error}",
  "onboarding.chooseFolder": "Elegir carpeta…",
  "onboarding.adding": "Añadiendo…",
  "onboarding.featuresHint":
    "Dos cosas que StudyLLM puede hacer más allá de un chat normal; puedes activar cada una desde las casillas justo encima del campo de mensaje, cuando las necesites:",
  "onboarding.featureResearch": "Investigación profunda",
  "onboarding.featureResearchDesc":
    "haz una pregunta amplia y el asistente busca en la web en varios pasos, lee las fuentes y escribe una respuesta con citas.",
  "onboarding.featureDocs": "Chatea con tus documentos",
  "onboarding.featureDocsDesc":
    "añade tus propios apuntes, PDFs o artículos, y el asistente responde usando solo esos, señalando los pasajes exactos que utilizó.",
  "onboarding.seeHowItWorks": "Ver cómo funciona",
  "onboarding.continue": "Continuar",
  "onboarding.doneHint": "¡Todo listo! Empieza a chatear cuando quieras.",
  "onboarding.startChatting": "Empezar a chatear",

  // ── Explore panel ──────────────────────────────────────────────────
  "explore.title": "Descubre cómo funciona",
  "explore.tab.lessons": "Lecciones",
  "explore.tab.tokens": "Tokens",
  "explore.tab.system": "Prompt del sistema",
  "explore.tab.retrieval": "Tus documentos (RAG)",
  "explore.tab.grounding": "Adivinar vs. fundamentado",
  "explore.tab.tools": "Herramientas (MCP)",
  "explore.tab.research": "Proceso de investigación",

  // ── Provider free-tier notes ───────────────────────────────────────
  "provider.freeTier.gemini": "~1.500 solicitudes/día · llamada a herramientas nativa",
  "provider.freeTier.mistral": "~1.000 M de tokens/mes · herramientas fiables",
  "provider.freeTier.groq": "muy rápido · cuota diaria baja",
  "provider.freeTier.nvidia": "1.000 créditos · las claves nuevas pueden dar 429 hasta activarse",
  "provider.freeTier.openrouter": "muchos modelos · el soporte de herramientas varía",
  "provider.freeTier.cohere": "~1.000 llamadas/mes · herramientas nativas",
  "provider.freeTier.cerebras": "rápido · algunos modelos requieren plan de pago",
  "provider.freeTier.github-models": "cuota diaria baja",
  "provider.freeTier.sambanova": "solo créditos de prueba",

  // ── Chat / main panel ──────────────────────────────────────────────
  "chat.newChat": "Nuevo chat",
  "chat.emptyTitle": "¿Con qué puedo ayudarte a estudiar?",
  "chat.you": "Tú",
  "chat.assistant": "Asistente",
  "chat.via": "vía {provider}",
  "chat.provider": "proveedor",
  "chat.copyMessage": "Copiar mensaje",
  "chat.editAndResend": "Editar y reenviar",
  "chat.retryReply": "Reintentar esta respuesta",
  "chat.export": "Exportar",
  "chat.exportConversation": "Exportar esta conversación",
  "chat.copyAsMarkdown": "Copiar como Markdown",
  "chat.saveToGoogleDocs": "Guardar en Google Docs",
  "chat.conversation": "Conversación",
  "chat.defaultDocTitle": "Conversación de StudyLLM",

  // Composer
  "composer.placeholder": "Escribe un mensaje…  (Enter para enviar, Mayús+Enter para nueva línea)",
  "composer.send": "Enviar",
  "composer.stop": "Detener generación",
  "composer.attach": "Adjuntar un archivo ({formats})",
  "composer.remove": "Quitar",
  "composer.removeNamed": "Quitar {name}",
  "composer.trimmed": "recortado",
  "composer.trimmedTitle": "{name} (recortado para que quepa)",
  "composer.deepResearch": "Investigación profunda",
  "composer.deepResearchTitle": "Investigación profunda: búsqueda web en varios pasos con un informe citado",
  "composer.setUpResearchTools": "Configurar herramientas de investigación",
  "composer.chatWithDocs": "Chatea con tus documentos",
  "composer.chatWithDocsOn": "Responder usando solo tus propios documentos (RAG)",
  "composer.chatWithDocsOff": "Añade documentos primero y después responderá a partir de ellos",
  "composer.chatLab": "Laboratorio de chat",
  "composer.chatLabTitle":
    "Define un prompt de sistema y los ajustes del modelo (temperatura, top-p, tokens máximos) para este chat",
  "composer.howDoesThisWork": "¿Cómo funciona esto?",
  "composer.yourDocuments": "Tus documentos",
  "composer.yourDocumentsCaption":
    "el asistente responde solo a partir de los archivos de tu biblioteca y cita los pasajes que utilizó.",

  // Tool approval
  "approval.title": "Una herramienta necesita tu aprobación",
  "approval.body": "{server} quiere ejecutar {tool}.",
  "approval.deny": "Denegar",
  "approval.allow": "Permitir",

  // Errors / notices
  "error.addProviderFirst": "Añade al menos un proveedor en Ajustes primero.",
  "error.responseFailed": "La respuesta del modelo falló: {message}",
  "error.somethingWentWrong": "Algo salió mal.",
  "error.toolsUnsupported":
    "Ninguno de tus modelos admite las herramientas conectadas. Elige un modelo compatible con herramientas en Proveedores, o desactiva las herramientas MCP.",
  "error.allProvidersFailed": "Todos tus proveedores fallaron. Revisa tus claves en Ajustes.",
  "error.researchToolsSetup": "No se pudieron configurar las herramientas de investigación.",
  "error.indexDocument": "No se pudo indexar ese documento.",
  "error.toolDenied": "Llamada a la herramienta denegada por el usuario.",
  "error.toolFailed": "La llamada a la herramienta falló",
  "error.maxAttachments": "Puedes adjuntar hasta {max} archivos por mensaje.",
  "error.unreadableFile": "No se puede leer «{name}» — formatos admitidos: {formats}.",
  "error.readFileFailed": "No se pudo leer «{name}».",
  "error.roomForFiles": "Solo caben {room} archivo(s) más — máximo {max} por mensaje.",
  "error.clipboardFailed": "No se pudo copiar al portapapeles.",
  "error.connectGoogleFirst": "Conecta tu cuenta de Google en Cuentas (Plugins) para guardar en Google Docs.",
  "error.createGoogleDoc": "No se pudo crear el documento de Google: {message}",
  "error.googleDocNoId": "Se creó el documento de Google pero no se pudo leer su identificador.",
  "error.googleDocAppend": "Se creó el documento, pero no se pudo añadir el texto: {message}",
  "error.exportFailed": "La exportación falló: {message}",
  "notice.researchToolsStarting":
    "Las herramientas de investigación se están iniciando — dales unos segundos la primera vez.",
  "notice.embeddingModelSaved": "Modelo de embeddings guardado.",
  "notice.librarySearchSkipped": "Búsqueda en la biblioteca omitida: {error}",
  "notice.switchedProvider": "Se cambió a {to} ({from} {reason})",
  "notice.invalidKey": "La clave de {provider} parece no válida — se ha desactivado. Revisa Ajustes.",
  "notice.transcriptCopied": "Conversación copiada como Markdown.",
  "notice.savedToGoogleDocs": "Guardado en Google Docs.",
  "notice.savedToGoogleDocsUrl": "Guardado en Google Docs — {url}",
  "mcp.defaultServerName": "servidor MCP",

  // ── Research modes ─────────────────────────────────────────────────
  "research.mode.auto.label": "Automático",
  "research.mode.auto.description": "Investigación general en varios pasos: planificar, buscar, leer y escribir una respuesta con citas.",
  "research.mode.compare.label": "Comparar",
  "research.mode.compare.description": "Sopesa dos o más opciones, posturas o actores en paralelo.",
  "research.mode.howto.label": "Cómo hacerlo",
  "research.mode.howto.description": "Crea una guía fiable paso a paso basada en fuentes actuales.",
  "research.mode.factcheck.label": "Verificar datos",
  "research.mode.factcheck.description": "Verifica una afirmación concreta contra varias fuentes independientes.",
  "research.mode.litreview.label": "Revisión bibliográfica",
  "research.mode.litreview.description": "Repasa la literatura sobre un tema, organizada por temas.",

  "notice.librarySearchFailed": "La búsqueda en la biblioteca falló: {error}",
  "error.embeddingError": "error de embeddings",
  "error.allProvidersRateLimited": "Todos tus proveedores están limitados por cuota. Inténtalo de nuevo en ~{seconds} s.",

  // Router fail-over reasons (shown inside "notice.switchedProvider")
  "router.reason.toolsUnsupported": "el modelo no puede usar herramientas",
  "router.reason.invalidKey": "clave no válida",
  "router.reason.rateLimited": "límite de cuota alcanzado",
  "router.reason.requestFailed": "la solicitud falló",

  // ── Library panel ──────────────────────────────────────────────────
  "library.title": "Tus documentos",
  "library.titleTerm": "(biblioteca)",
  "library.tab.documents": "Documentos",
  "library.tab.embedding": "Modelo de embeddings",
  "library.documentsHint":
    "Añade tus apuntes, PDFs o artículos. Cada documento se divide en pasajes y se convierte en datos de «significado» que se pueden buscar, para que el asistente extraiga las partes más relevantes cuando actives «Chatea con tus documentos» en el compositor. Las respuestas citan los pasajes que usaron.",
  "library.pickEmbeddingFirst":
    "Elige primero un modelo de embeddings en la pestaña «Modelo de embeddings»: así es como se indexan los documentos.",
  "library.addFileTitle": "Añadir un archivo ({formats})",
  "library.chooseEmbeddingFirst": "Elige primero un modelo de embeddings",
  "library.indexing": "Indexando…",
  "library.addDocuments": "Añadir documentos",
  "library.empty": "Todavía no hay documentos.",
  "library.passageOne": "{count} pasaje",
  "library.passageOther": "{count} pasajes",
  "library.chars": "{count} caracteres",
  "library.removeDocument": "Quitar documento",
  "library.noEmbeddingProvider":
    "No hay ningún proveedor con embeddings configurado. Añade un proveedor de Google Gemini o Mistral en Proveedores — ambos ofrecen modelos de embeddings gratuitos — y vuelve aquí para seleccionarlo.",
  "library.embeddingHint":
    "Los embeddings convierten tus documentos en vectores que se pueden buscar. Elige un proveedor que ya hayas configurado y el modelo de embeddings a usar. Funciona con el plan gratuito del proveedor, igual que el chat.",
  "library.provider": "Proveedor",
  "library.embeddingModel": "Modelo de embeddings",
  "library.current": "Actual: {provider} · {model}",

  // ── Plugins / accounts panel ───────────────────────────────────────
  "plugins.title": "Cuentas",
  "plugins.titleTerm": "(Plugins)",
  "plugins.hint":
    "Conecta cuentas para que el asistente pueda usarlas, como una cuenta de Google para el correo y los archivos. StudyLLM nunca ve tu contraseña de Google: inicias sesión directamente con Google.",
  "plugins.official": "Oficial",
  "plugins.connected": "Conectado",
  "plugins.connectedLower": "conectado",
  "plugins.errorLower": "error",
  "plugins.disconnect": "Desconectar",
  "plugins.connecting": "Conectando…",
  "plugins.tryAgain": "Reintentar",
  "plugins.connectGoogle": "Conectar cuenta de Google",
  "plugins.connectFailed": "No se pudo conectar. Inténtalo de nuevo.",
  "plugins.phase.openingBrowser": "Abriendo tu navegador…",
  "plugins.phase.waiting": "Esperando a que termines de iniciar sesión con Google…",
  "plugins.phase.exchanging": "Conectando…",
  "plugins.phase.connected": "¡Conectado!",
  "plugins.phase.error": "Algo salió mal.",
  "connector.google.description":
    "Conecta tu cuenta de Google para que el asistente pueda trabajar con tu Gmail, Calendar, Tasks, Drive, Docs y Sheets: leyendo y (con tu aprobación) enviando, creando y editando.",
  "plugins.setup.summary": "Cómo configurar el acceso a Google",
  "plugins.setup.intro": "Configuración única en tu {link}, y después pulsa Conectar:",
  "plugins.setup.consoleLink": "Consola de Google Cloud",
  "plugins.setup.step1":
    "En APIs y servicios → Biblioteca, activa las APIs de Gmail, Google Calendar, Google Tasks, Google Docs, Google Sheets y Google Drive.",
  "plugins.setup.step2":
    "Abre APIs y servicios → Pantalla de consentimiento de OAuth y añade estos permisos (scopes): gmail.modify, gmail.send, calendar, tasks, documents, spreadsheets y drive.readonly.",
  "plugins.setup.step3":
    "Mientras la pantalla de consentimiento esté en «Testing», añade tu dirección de Google en Usuarios de prueba para que Google te deje pasar.",
  "plugins.setup.step4": "Vuelve aquí, pulsa Conectar y aprueba los permisos en el navegador.",
  // ── Providers panel ────────────────────────────────────────────────
  "providers.title": "Proveedores",
  "providers.hint":
    "Añade tus propias claves de API gratuitas. Cuando una se queda sin solicitudes gratuitas, StudyLLM cambia automáticamente a la siguiente de la lista.",
  "providers.runSetupGuide": "Abrir la guía de configuración",
  "providers.yourProviders": "Tus proveedores",
  "providers.addProvider": "Añadir un proveedor",
  "providers.addProviderButton": "Añadir proveedor",
  "providers.none": "Aún no has añadido ningún proveedor.",
  "providers.recommended": "Recomendado",
  "providers.configured": "✓ Configurado",
  "providers.enabled": "activado",
  "providers.apiKey": "Clave de API",
  "providers.pasteKey": "Pega la clave…",
  "providers.getKeyLink": "Consigue una clave de API gratuita de {provider}",
  "providers.label": "Etiqueta",
  "providers.keepCurrentKey": "Déjalo en blanco para mantener la clave actual",
  "providers.moveUp": "Subir",
  "providers.moveDown": "Bajar",
  "providers.addFailed": "No se pudo añadir el proveedor: {error}",
  "providers.removeFailed": "No se pudo eliminar el proveedor: {error}",
  "providers.updateFailed": "No se pudo actualizar el proveedor: {error}",
  "providers.reorderFailed": "No se pudieron reordenar los proveedores: {error}",

  // Model field
  "model.label": "Modelo",
  "model.placeholder": "Escribe o elige un id de modelo…",
  "model.toolCompatibleOnly": "Solo compatibles con herramientas",
  "model.badgeTools": "✓ herramientas",
  "model.badgeNoTools": "sin herramientas",
  "model.loading": "Cargando la lista de modelos…",
  "model.loaded": "Se cargaron {count} modelos de {provider}.",
  "model.unavailableWithKey":
    "No se pudieron cargar los modelos con esta clave — se muestran sugerencias. Puedes escribir cualquier id de modelo.",
  "model.unavailable":
    "No se pudo acceder a la lista de modelos — se muestran sugerencias. Puedes escribir cualquier id de modelo.",
  "model.enterKey": "Introduce una clave de API para cargar la lista de modelos de este proveedor.",

  // ── Chat lab ───────────────────────────────────────────────────────
  "chatLab.title": "Laboratorio de chat",
  "chatLab.subtitle":
    "Dirige esta conversación como lo haría un ingeniero: una instrucción permanente y los ajustes del modelo. Se aplica a tus mensajes reales y se guarda con este chat.",
  "chatLab.close": "Cerrar el laboratorio de chat",
  "chatLab.standingInstructions": "Instrucciones permanentes",
  "chatLab.systemPromptTerm": "(prompt de sistema)",
  "chatLab.tokens": "{count} tokens",
  "chatLab.clear": "Borrar",
  "chatLab.systemPlaceholder":
    "p. ej. Eres un tutor paciente. Explica de forma sencilla y comprueba que se ha entendido.",
  "chatLab.systemExplain":
    "Instrucciones ocultas que el modelo sigue antes de ver tu mensaje: su personalidad y sus reglas.",
  "chatLab.default": "por defecto",
  "chatLab.preset.tutor": "Tutor cercano",
  "chatLab.preset.pirate": "Habla como un pirata",
  "chatLab.preset.oneWord": "Solo una palabra",
  "chatLab.preset.french": "Responde en francés",
  "chatLab.preset.eli10": "Explícamelo como si tuviera 10 años",
  "chatLab.knob.creativity": "Creatividad",
  "chatLab.knob.creativityTerm": "temperatura",
  "chatLab.knob.creativityExplain":
    "Bajo = centrado y repetible. Alto = más sorprendente y variado (y más propenso a divagar).",
  "chatLab.knob.variety": "Variedad de palabras",
  "chatLab.knob.varietyTerm": "top-p",
  "chatLab.knob.varietyExplain":
    "Limita la elección de palabras a las opciones más probables. Más bajo = más seguro y predecible.",
  "chatLab.knob.length": "Límite de longitud de respuesta",
  "chatLab.knob.lengthTerm": "tokens máximos",
  "chatLab.knob.lengthExplain":
    "Un tope estricto de cuánto puede escribir el modelo. Si lo pones bajo, las respuestas largas se cortan a mitad de frase.",

  "plugins.setup.note":
    "¿Ya te habías conectado antes? Estos permisos se han ampliado hace poco: desconecta y vuelve a conectar una vez para conceder el nuevo acceso. Las acciones que envían o eliminan (enviar un correo, mover un mensaje a la papelera, borrar un evento o una tarea) piden tu aprobación cada vez; puedes cambiarlo por herramienta en el panel de Herramientas.",

  // ── Trust tiers (shared: McpPanel + McpMarketplace) ─────────────────
  "trust.official": "Oficial",
  "trust.verified": "Verificado",
  "trust.community": "Comunidad",
  "trust.tooltip.official": "Creado y mantenido por el propio proyecto MCP.",
  "trust.tooltip.verified":
    "Hecho por una persona externa cuyo código es público, pero no auditado por StudyLLM.",
  "trust.tooltip.community":
    "Herramienta sin verificar de un desarrollador independiente: puede ejecutar código en este equipo con tus permisos.",

  // ── Tools & Connections panel (McpPanel) ───────────────────────────
  "mcp.title": "Herramientas y conexiones",
  "mcp.titleTerm": "(MCP)",
  "mcp.tab.installed": "Instaladas",
  "mcp.tab.discover": "Descubrir",
  "mcp.intro":
    "Dan al asistente herramientas extra, como leer y escribir archivos en este equipo o buscar en la web. (Su nombre técnico es «servidores MCP».) Añade solo las que te merezcan confianza. Pon una herramienta en «Preguntar siempre» para aprobar cada llamada, o en «Denegar» para ocultársela por completo al asistente. Cada llamada permitida se muestra en el chat.",
  "mcp.legend.official": "Publicado por quienes crean la herramienta.",
  "mcp.legend.verified": "De un repositorio de código público conocido.",
  "mcp.legend.community":
    "De un desarrollador independiente: se ejecuta con tus permisos, así que añádelo con cuidado.",
  "mcp.searchPlaceholder": "Buscar servidores instalados…",
  "mcp.section.pinned": "Fijados",
  "mcp.section.all": "Todos los servidores",
  "mcp.filesystem.name": "Archivos del equipo",
  "mcp.filesystem.desc":
    "Permite al asistente leer y escribir archivos en una carpeta que tú elijas.",
  "mcp.adding": "Añadiendo…",
  "mcp.addEllipsis": "Añadir…",
  "mcp.noPinnedMatch": "Ningún servidor fijado coincide con tu búsqueda.",
  "mcp.noPinned": "No hay servidores fijados.",
  "mcp.noServersMatch": "Ningún servidor coincide con tu búsqueda.",
  "mcp.noOtherServers": "No hay otros servidores instalados.",
  "mcp.start": "Iniciar",
  "mcp.starting": "Iniciando…",
  "mcp.stop": "Detener",
  "mcp.tools": "Herramientas",
  "mcp.toolsWithCount": "Herramientas ({count})",
  "mcp.toolsDisabledTitle": "Inicia el servidor para ver sus herramientas",
  "mcp.toolsTitle": "Configurar las herramientas de este servidor",
  "mcp.logs": "Registro",
  "mcp.logsWithCount": "Registro ({count})",
  "mcp.logsDisabledTitle": "El registro solo está disponible para servidores locales",
  "mcp.logsTitle": "Ver la salida de errores de este servidor",
  "mcp.autostart": "Inicio automático",
  "mcp.autostartTitle": "Iniciar este servidor automáticamente al abrir la app",
  "mcp.cachedToolsHint":
    "Mostrando la lista de herramientas de la última vez que se ejecutó este servidor: inícialo para actualizarla.",
  "mcp.noLogs":
    "Todavía no hay salida: el registro aparece cuando el servidor escribe algo.",
  "mcp.status.stopped": "detenido",
  "mcp.status.starting": "iniciando",
  "mcp.status.running": "en marcha",
  "mcp.status.error": "error",
  "mcp.perm.allow": "Permitir",
  "mcp.perm.ask": "Preguntar siempre",
  "mcp.perm.deny": "Denegar (oculta)",
  "mcp.err.addFilesystem": "No se pudo añadir el acceso a archivos: {error}",
  "mcp.err.start": "No se pudo iniciar {name}: {error}",
  "mcp.err.stop": "No se pudo detener {name}: {error}",
  "mcp.err.remove": "No se pudo quitar {name}: {error}",
  "mcp.edit.name": "Nombre",
  "mcp.edit.folder": "Carpeta",
  "mcp.edit.changeFolder": "Cambiar carpeta…",
  "mcp.edit.oauthHint": "Gestiona esta conexión desde el panel de Conexiones.",
  "mcp.edit.url": "URL",
  "mcp.edit.envVars": "Variables de entorno",
  "mcp.edit.secret": "secreto",
  "mcp.edit.willRemove": "Se eliminará al guardar",
  "mcp.edit.keepCurrent": "Déjalo en blanco para mantener el valor actual",
  "mcp.edit.value": "Valor",
  "mcp.edit.addVariable": "+ Añadir variable",

  // ── Tool marketplace (McpMarketplace) ──────────────────────────────
  "market.intro":
    "Añade herramientas extra que el asistente puede usar, como leer archivos o consultar tu correo. Añade solo herramientas de personas o proyectos en los que confíes: mira la etiqueta antes de añadirlas.",
  "market.searchPlaceholder": "Buscar una herramienta…",
  "market.searching": "Buscando…",
  "market.search": "Buscar",
  "market.cacheNotice":
    "No se pudo contactar con el directorio de herramientas{error} — mostrando lo guardado{age}.",
  "market.cacheError": " ({error})",
  "market.cacheAge": " de hace {minutes} min",
  "market.clearCache": "Borrar resultados guardados",
  "market.section.popular": "Populares",
  "market.section.all": "Todas las herramientas",
  "market.empty": "No se han encontrado herramientas.",
  "market.added": "Añadida",
  "market.add": "Añadir",
  "market.adding": "Añadiendo…",
  "market.addTitle": "Añadir {name}",
  "market.warn.community":
    "Es una herramienta de la comunidad sin verificar: puede ejecutar cualquier código en este equipo con los permisos de tu cuenta. Añádela solo si confías en quien la publica.",
  "market.warn.verified":
    "Quien publica esta herramienta tiene un repositorio público, pero StudyLLM no la ha auditado. Revísala antes de añadirla.",
  "market.ack": "Entiendo el riesgo y quiero añadir esta herramienta igualmente.",
  "market.argument": "Argumento {n}",
  "market.chooseFolder": "Elegir carpeta…",
  "market.optional": " (opcional)",

  // ── Tool explorer (McpToolExplorer) ────────────────────────────────
  "toolExplorer.noServers":
    "Todavía no hay herramientas conectadas. Abre Herramientas y conexiones (MCP) e inicia un servidor (el de archivos es el más fácil para empezar), y vuelve aquí para ver cómo las usa el modelo.",
  "toolExplorer.intro":
    "Una herramienta es solo una función que el modelo puede pedir: tiene un nombre, una descripción y unos huecos (entradas) que rellenar. Abajo están las herramientas reales que ofrece tu servidor conectado. Haz una pregunta y observa cómo el modelo elige una, rellena los huecos y lee el resultado.",
  "toolExplorer.server": "Servidor:",
  "toolExplorer.required": "obligatorio",
  "toolExplorer.noInputs": "No necesita entradas.",
  "toolExplorer.needProvider":
    "Añade un proveedor de IA en Proveedores para probar la demo en vivo.",
  "toolExplorer.placeholder": "p. ej. algo que necesitaría {name}",
  "toolExplorer.run": "Ejecutar",
  "toolExplorer.stop": "Detener",
  "toolExplorer.modelAsked": "El modelo ha pedido",
  "toolExplorer.itSent": "Ha enviado (los huecos que rellenó):",
  "toolExplorer.toolError": "La herramienta devolvió un error:",
  "toolExplorer.toolAnswered": "La herramienta respondió:",
  "toolExplorer.switched": "Se cambió de proveedor ({reason})",
  "toolExplorer.runFailed": "La ejecución ha fallado.",

  // ── Research trace (ResearchTrace) ─────────────────────────────────
  "researchTrace.stage.question": "Tu pregunta",
  "researchTrace.stage.subQuestions": "Sub-preguntas",
  "researchTrace.stage.search": "Buscar en la web",
  "researchTrace.stage.read": "Leer fuentes",
  "researchTrace.stage.synthesize": "Sintetizar",
  "researchTrace.stage.report": "Informe con fuentes",
  "researchTrace.intro":
    "Haz una pregunta amplia y observa cómo trabaja la Investigación profunda: la descompone, busca, lee fuentes y sintetiza una respuesta con citas, paso a paso. Ejecuta el proceso real sobre tus herramientas web.",
  "researchTrace.noTools": "Todavía no hay herramientas de investigación en marcha.",
  "researchTrace.settingUp": "Preparando…",
  "researchTrace.setUpTools": "Instalar las herramientas de investigación gratuitas",
  "researchTrace.toolsSuffix": "(Web Reader, Wikipedia, OpenAlex) — no hace falta cuenta.",
  "researchTrace.placeholder":
    "p. ej. ¿En qué se diferencian los enfoques de la UE y EE. UU. para regular la IA?",
  "researchTrace.run": "Investigar",
  "researchTrace.stop": "Detener",
  "researchTrace.steps": "Pasos de investigación",
  "researchTrace.stepsOf": "{done} de un máximo de {max}",
  "researchTrace.sources": "Fuentes consultadas ({count})",
  "researchTrace.chars": "{count} caracteres",
  "researchTrace.report": "Informe con fuentes",
  "researchTrace.writing": "Escribiendo…",
  "researchTrace.via": " · vía {provider} · {model}",
  "researchTrace.switched": "Se cambió a {provider} — reiniciando la investigación",
  "researchTrace.authError": "La clave de {provider} no parece válida — revísala en Proveedores.",
  "researchTrace.noToolModels":
    "Ninguno de tus modelos puede usar herramientas. Elige un modelo compatible en Proveedores.",
  "researchTrace.exhausted":
    "Todos los proveedores están limitados o fallando. Inténtalo de nuevo en un momento.",
  "researchTrace.failed": "La investigación ha fallado.",

  // ── Retrieval explorer (RetrievalExplorer) ─────────────────────────
  "retrieval.stage1.label": "Convertir tu pregunta en números",
  "retrieval.stage1.detail":
    "Convertida en una lista de {count} números (un «vector») que captura su significado",
  "retrieval.stage2.label": "Puntuar cada pasaje",
  "retrieval.stage2.detail": "Comparada con {count} pasajes",
  "retrieval.stage3.label": "Ordenar por cercanía de significado",
  "retrieval.stage3.detail":
    "Ordenados por lo cerca que están en significado («similitud del coseno»), no por palabras coincidentes",
  "retrieval.stage4.label": "Quedarse con los más cercanos",
  "retrieval.stage4.detail": "Los {count} primeros se convierten en las fuentes citadas de la respuesta",
  "retrieval.intro":
    "Escribe una pregunta y observa cómo «chatear con tus documentos» encuentra realmente los pasajes correctos — sin necesidad de chatear. Ejecuta la búsqueda real sobre tu biblioteca.",
  "retrieval.emptyLibrary": "Tu biblioteca está vacía.",
  "retrieval.addDocs": "Añade algunos documentos",
  "retrieval.emptyLibrarySuffix":
    "primero, y vuelve para explorar cómo se eligen los pasajes.",
  "retrieval.placeholder": "p. ej. ¿Qué obligaciones impone el tratado a los estados miembros?",
  "retrieval.run": "Ejecutar búsqueda",
  "retrieval.running": "Ejecutando…",
  "retrieval.failed": "La búsqueda ha fallado. Revisa tu proveedor de embeddings.",
  "retrieval.noPassages":
    "No se han encontrado pasajes en tu biblioteca. Si acabas de añadir documentos, dale un momento a la indexación e inténtalo de nuevo.",
  "retrieval.vizHint": "Pasa el ratón por una barra o un punto para compararlos —",
  "retrieval.vizHintStrong": "haz clic en cualquiera para leer el pasaje completo",
  "retrieval.match": "{percent}% de coincidencia",
  "retrieval.retrieved": "recuperado para la respuesta",
  "retrieval.notRetrieved": "no recuperado",
  "retrieval.passageAria": "Pasaje {name} #{seq}",
  "retrieval.passageCaption":
    "Este es uno de los pasajes de tu biblioteca, en la posición #{rank} de {total} por cercanía de significado con tu pregunta.",
  "retrieval.previous": "← Anterior",
  "retrieval.next": "Siguiente →",

  // ── Grounding contrast (GroundingContrast) ─────────────────────────
  "grounding.intro":
    "Haz una pregunta y verás cómo se responde dos veces: a la izquierda, solo desde la memoria del modelo; a la derecha, fundamentada en tus propios documentos. La respuesta de la izquierda puede sonar segura pero no cita nada, y puede ser inventada. La de la derecha está atada a pasajes reales con citas. Ese contraste es justo la razón de ser de «chatear con tus documentos» (RAG).",
  "grounding.emptyLibrary": "Tu biblioteca está vacía.",
  "grounding.addDoc": "Añade un documento",
  "grounding.emptyLibrarySuffix":
    "primero — elige algo que el modelo probablemente no sepa (tus apuntes, un PDF concreto) para que el contraste sea más claro.",
  "grounding.placeholder":
    "Pregunta algo que responda tu documento pero que un modelo probablemente no sepa…",
  "grounding.compare": "Comparar respuestas",
  "grounding.stop": "Detener",
  "grounding.failed": "La ejecución ha fallado.",
  "grounding.memoryOnly": "Solo memoria del modelo",
  "grounding.groundedIn": "Fundamentado en tus documentos",
  "grounding.noSources": "Sin fuentes — fíate con cautela.",
  "grounding.waiting": "esperando la primera respuesta…",
  "grounding.passagesGiven": "Pasajes que recibió:",
  "grounding.matchPercent": "{percent}% de coincidencia",
  "grounding.nothingMatched":
    "Nada de tu biblioteca ha coincidido — un modelo fundamentado debería decir que no lo sabe en vez de adivinar.",

  // ── Prompt playground (PromptPlayground) ───────────────────────────
  "prompt.intro":
    "Un chatbot nunca recibe solo tu mensaje. Detrás de cada turno hay un prompt de sistema oculto: instrucciones permanentes que el modelo sigue. Edítalo abajo, mira exactamente lo que recibe el modelo, y ejecútalo para ver cómo la misma pregunta obtiene otra respuesta.",
  "prompt.systemLabel": "Prompt de sistema",
  "prompt.systemHint": "las instrucciones ocultas",
  "prompt.systemPlaceholder": "p. ej. Eres un asistente servicial.",
  "prompt.userLabel": "Tu mensaje",
  "prompt.userPlaceholder": "Pregunta lo que quieras…",
  "prompt.run": "Ejecutar",
  "prompt.stop": "Detener",
  "prompt.inspectorHead": "Lo que el modelo recibe realmente",
  "prompt.totalTokens": "{count} tokens en total",
  "prompt.msgTokens": "{count} tokens",
  "prompt.empty": "(vacío)",
  "prompt.inspectorNote":
    "Ese es todo el prompt — el modelo no sabe nada más de ti. En un chat real, el ida y vuelta anterior también se apilaría aquí, y por eso las conversaciones largas llenan el presupuesto de tokens y los turnos antiguos acaban descartándose.",
  "prompt.needProvider":
    "Añade un proveedor de IA en Proveedores para ejecutar el prompt y ver la respuesta.",
  "prompt.failed": "La ejecución ha fallado.",
  "prompt.runSystemLabel": "Sistema:",
  "prompt.noSystem": "ninguno",
  "prompt.noSystemTitle": "(sin prompt de sistema)",
  "prompt.preset.helpful": "Asistente servicial",
  "prompt.preset.pirate": "Habla como un pirata",
  "prompt.preset.oneWord": "Solo una palabra",
  "prompt.preset.socratic": "Tutor socrático",
  "prompt.preset.json": "Solo JSON",
  "prompt.preset.french": "Siempre en francés",

  // ── Token explorer (TokenExplorer) ─────────────────────────────────
  "token.intro":
    "Un modelo nunca ve tus letras. Primero trocea el texto en tokens — los fragmentos de abajo. Escribe lo que quieras y mira cómo se divide. Fíjate en que las tres cuentas casi nunca coinciden: ese desajuste es la razón de que a un modelo le cueste «contar las letras de una palabra», y de que todo modelo tenga un límite de tokens, no de palabras.",
  "token.placeholder": "Escribe o pega lo que quieras…",
  "token.tryLabel": "Prueba:",
  "token.characters": "caracteres",
  "token.words": "palabras",
  "token.tokens": "tokens (aprox.)",
  "token.chipsAria": "El texto dividido en tokens",
  "token.whitespace": "espacio en blanco",
  "token.footnote":
    "Aproximadamente 4 caracteres forman un token en inglés. La ventana de contexto de un modelo — todo lo que puede «tener en mente» a la vez (tu pregunta, el historial del chat, los documentos) — se mide en estos tokens: los modelos pequeños admiten unos miles, los grandes más de 100.000. Esto es una aproximación didáctica de un tokenizador real, no una cuenta exacta.",
  "token.example.strawberry": "fresa",
  "token.example.strawberryText": "¿Cuántas erres tiene la palabra ferrocarril?",
  "token.example.sentence": "Una frase",
  "token.example.sentenceText": "El veloz murciélago hindú comía feliz cardillo y kiwi.",
  "token.example.numbers": "Números y código",
  "token.example.numbersText": "Factura n.º 4021 total: 1.299,00 € — pagar antes del 01-08-2026.",
  "token.example.otherLang": "Otro idioma",
  "token.example.otherLangText": "Artificial intelligence learns from a great many examples.",

  // ── Lessons (LessonsPanel) ─────────────────────────────────────────
  "lessons.intro":
    "Seis lecciones cortas y prácticas sobre cómo funciona de verdad la IA moderna — cada una abre un laboratorio en vivo con el que puedes trastear. Van bien de arriba abajo, por tu cuenta o delante de una clase. Sin programar y sin jerga sin explicar.",
  "lessons.1.title": "Lo que la IA lee en realidad",
  "lessons.1.term": "tokens",
  "lessons.1.body":
    "Un modelo de IA nunca ve tus letras: primero trocea el texto en piezas llamadas tokens. Verlo explica por qué cuenta mal las letras y por qué tiene límites de tamaño.",
  "lessons.1.cta": "Divide un texto en tokens",
  "lessons.2.title": "Cómo lo guías con instrucciones",
  "lessons.2.term": "prompt de sistema",
  "lessons.2.body":
    "Detrás de cada chatbot hay una instrucción oculta que moldea su personalidad y sus reglas. Mira el prompt exacto que recibe el modelo, cámbialo y observa cómo cambia su respuesta.",
  "lessons.2.cta": "Experimenta con un prompt de sistema",
  "lessons.3.title": "Por qué a veces se inventa cosas",
  "lessons.3.term": "alucinación",
  "lessons.3.body":
    "Por su cuenta, un modelo responde desde una memoria difusa y puede inventar datos que suenan muy convincentes. Haz una pregunta de dos formas y mira cómo una respuesta inventada se convierte en una con fuentes.",
  "lessons.3.cta": "Compara una suposición con una respuesta fundamentada",
  "lessons.4.title": "Cómo encuentra el pasaje correcto",
  "lessons.4.term": "RAG / recuperación",
  "lessons.4.body":
    "«Chatear con tus documentos» funciona convirtiendo el significado en números y buscando los pasajes más cercanos a tu pregunta. Observa la búsqueda real ordenando todos los pasajes de tu biblioteca.",
  "lessons.4.cta": "Mira cómo se ordenan tus documentos",
  "lessons.5.title": "Cómo usa herramientas reales",
  "lessons.5.term": "MCP",
  "lessons.5.body":
    "Una herramienta es solo una función que el modelo puede pedir: leer un archivo, buscar en la web. Mira las entradas de una herramienta y luego cómo el modelo elige una y rellena los huecos.",
  "lessons.5.cta": "Mira al modelo usar una herramienta",
  "lessons.6.title": "Cómo investiga una pregunta amplia",
  "lessons.6.term": "investigación agéntica",
  "lessons.6.body":
    "Dale a un modelo herramientas y un objetivo y puede trabajar por pasos: descomponer la pregunta, buscar, leer fuentes y escribir una respuesta con citas. Observa una ejecución completa en vivo.",
  "lessons.6.cta": "Ejecuta una investigación en vivo",

  // ── Visualizations (viz/*) ─────────────────────────────────────────
  "viz.embeddingSpace": "Espacio de significados",
  "viz.embeddingSpaceAria": "Mapa del espacio de significados",
  "viz.similarityRanking": "Orden por similitud",
  "viz.clickToRead": "Haz clic para leer el pasaje completo",
  "viz.embeddingCaption":
    "Tu pregunta (★) y cada pasaje, situados por significado. Más cerca significa más parecido; los puntos rellenos son los recuperados. Haz clic en cualquier punto para leer el pasaje completo.",
  "viz.rankingCaption":
    "Todos los pasajes de tu biblioteca, puntuados frente a tu pregunta. Los {count} que quedan por encima de la línea son de los que respondería el asistente. Haz clic en cualquier barra para leer el pasaje completo.",
  "viz.cutoff": "los {count} primeros · recuperados",
} as const;
