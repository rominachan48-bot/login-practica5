
import OpenAI from "openai";
import dotenv from "dotenv";
import { StitchToolClient } from "@google/stitch-sdk";

dotenv.config();

// 1. Configurar OpenRouter
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// 2. Configurar Stitch MCP
const stitchClient = new StitchToolClient({
  apiKey: process.env.STITCH_API_KEY,
});

// 3. Instrucciones del agente
const mensajes = [
  {
    role: "system",
    content: `Eres un Ingeniero Frontend y Experto en UX/UI.
Tu objetivo es traducir los requerimientos del usuario
en interfaces funcionales usando las herramientas de Stitch.

Reglas:
1. Analiza el requerimiento y decide qué herramientas usar.
2. Si una herramienta falla, lee el error y vuelve a intentarlo
   con parámetros corregidos.
3. Informa al usuario de tus acciones de forma concisa.`,
  },
  {
    role: "user",
    content: `Crea un proyecto nuevo en Stitch y genera
una pantalla de inicio de sesión moderna y profesional.

La pantalla debe tener:
- Campo para usuario o correo electrónico.
- Campo para contraseña.
- Botón de iniciar sesión de color azul oscuro.
- Opción para registrarse.
- Enlace de olvidé mi contraseña.
- Casilla para recordar sesión siempre.

Utiliza un diseño limpio, moderno y responsivo.`,
  },
];

async function iniciarAgente() {
  console.log("🔌 Conectando con Stitch MCP...");

  if (!process.env.OPENROUTER_API_KEY ||
      !process.env.STITCH_API_KEY) {
    throw new Error("Faltan claves en el archivo .env");
  }

  try {
    // 4. Obtener las herramientas de Stitch
    const resultado = await stitchClient.listTools();

    const herramientas = resultado.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.inputSchema,
      },
    }));

    console.log(
      `✅ Conexión exitosa. ${herramientas.length} herramientas.`
    );

    // 5. Bucle autónomo del agente
    let tareaCompletada = false;
    let iteraciones = 0;

    while (!tareaCompletada && iteraciones < 10) {
      iteraciones++;

      const respuesta = await openai.chat.completions.create({
        model: "openrouter/free",
        messages: mensajes,
        tools: herramientas,
      });

      const mensaje = respuesta.choices[0].message;
      mensajes.push(mensaje);

      if (mensaje.tool_calls?.length) {
        for (const llamada of mensaje.tool_calls) {
          console.log(
            `🛠️ Ejecutando: ${llamada.function.name}`
          );

          let contenido;

          try {
            const argumentos = JSON.parse(
              llamada.function.arguments
            );

            const resultado = await stitchClient.callTool(
              llamada.function.name,
              argumentos
            );

            contenido = JSON.stringify(resultado);
            console.log("✅ Herramienta ejecutada.");
          } catch (error) {
            contenido = `Error: ${error.message}`;
            console.error("⚠️", contenido);
          }

          mensajes.push({
            role: "tool",
            tool_call_id: llamada.id,
            content: contenido,
          });
        }
      } else {
        console.log("\n🎉 Respuesta del agente:");
        console.log(mensaje.content);
        tareaCompletada = true;
      }
    }

    if (!tareaCompletada) {
      console.log("Se alcanzó el límite de iteraciones.");
    }
  } finally {
    await stitchClient.close();
  }
}

iniciarAgente().catch((error) => {
  console.error("❌ Error:", error.message);
});
