import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

const MODEL_NAME = "gemini-1.5-flash";
const FALLBACK_MODELS = ["gemini-1.5-flash-latest"];
const FUNCTION_NAME = "map_thesis_to_markets";
const BASE_PROMPT =
  "You are a prediction market analyst. Given this thesis, identify the most relevant prediction market questions that would collectively represent this thesis as an index fund basket. Return questions from Polymarket, Kalshi, and Manifold. Thesis:";

const thesisMapperTool = {
  functionDeclarations: [
    {
      name: FUNCTION_NAME,
      description:
        "Map a plain-English thesis to a structured set of relevant prediction market questions.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          thesis: {
            type: SchemaType.STRING,
            description: "The user's plain English thesis.",
          },
          markets: {
            type: SchemaType.ARRAY,
            description:
              "Relevant prediction market questions tied to the thesis.",
            items: {
              type: SchemaType.OBJECT,
              properties: {
                platform: {
                  type: SchemaType.STRING,
                  enum: ["Polymarket", "Kalshi", "Manifold"],
                  description: "Platform where the market exists.",
                },
                question: {
                  type: SchemaType.STRING,
                  description: "Prediction market question text.",
                },
                relevance_explanation: {
                  type: SchemaType.STRING,
                  description: "Why this market maps to the thesis.",
                },
                estimated_probability: {
                  type: SchemaType.NUMBER,
                  description:
                    "Estimated probability from 0 to 1 for this market's outcome.",
                },
              },
              required: [
                "platform",
                "question",
                "relevance_explanation",
                "estimated_probability",
              ],
            },
          },
          confidence_score: {
            type: SchemaType.NUMBER,
            description:
              "Overall confidence from 0 to 1 for how well the thesis maps to existing markets.",
          },
          sub_themes: {
            type: SchemaType.ARRAY,
            description: "2-4 sub-themes the thesis breaks down into.",
            items: {
              type: SchemaType.STRING,
            },
          },
        },
        required: ["thesis", "markets", "confidence_score", "sub_themes"],
      },
    },
  ],
};

export function initGemini() {
  try {
    dotenv.config({ path: envPath });

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY in .env");
    }

    return new GoogleGenerativeAI(apiKey);
  } catch (error) {
    console.error(`[initGemini] Failed to initialize Gemini client: ${error.message}`);
    throw error;
  }
}

function isModelNotFoundError(error) {
  const message = String(error?.message ?? "");
  return message.includes("404") && message.includes("is not found");
}

function isQuotaExceededError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("429") || message.includes("quota") || message.includes("rate-limits");
}

async function generateWithModel(client, modelName, prompt) {
  const model = client.getGenerativeModel({ model: modelName });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [thesisMapperTool],
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [FUNCTION_NAME],
      },
    },
  });

  return { result, modelName };
}

function extractMappedResult(response, thesis) {
  const functionCalls = response.functionCalls?.() ?? [];
  const mappedCall = functionCalls.find((call) => call.name === FUNCTION_NAME);

  if (!mappedCall) {
    const responseText = response.text?.() || "(empty response)";
    console.error("[mapThesisToMarkets] Gemini response text:", responseText);
    throw new Error("Gemini did not return a function call for thesis mapping.");
  }

  const args = mappedCall.args ?? {};

  return {
    thesis: typeof args.thesis === "string" ? args.thesis : thesis,
    markets: Array.isArray(args.markets) ? args.markets : [],
    confidence_score:
      typeof args.confidence_score === "number" ? args.confidence_score : null,
    sub_themes: Array.isArray(args.sub_themes) ? args.sub_themes : [],
  };
}

export async function mapThesisToMarkets(thesis) {
  try {
    if (!thesis || typeof thesis !== "string") {
      throw new Error("A non-empty thesis string is required.");
    }

    const client = initGemini();
    const prompt = `${BASE_PROMPT} ${thesis}`;

    try {
      const { result } = await generateWithModel(client, MODEL_NAME, prompt);
      return extractMappedResult(result.response, thesis);
    } catch (error) {
      if (!isModelNotFoundError(error)) {
        throw error;
      }

      console.error(
        `[mapThesisToMarkets] Model ${MODEL_NAME} unavailable for this API key/version. Trying fallbacks...`
      );

      let lastError = error;

      for (const fallbackModel of FALLBACK_MODELS) {
        try {
          const { result, modelName } = await generateWithModel(client, fallbackModel, prompt);
          console.log(`[mapThesisToMarkets] Using fallback model: ${modelName}`);
          return extractMappedResult(result.response, thesis);
        } catch (fallbackError) {
          if (isQuotaExceededError(fallbackError)) {
            throw new Error(
              `Gemini quota exceeded or billing is not enabled for this API key. ${fallbackError.message}`
            );
          }

          lastError = fallbackError;
          console.error(
            `[mapThesisToMarkets] Fallback model ${fallbackModel} failed: ${fallbackError.message}`
          );
        }
      }

      throw lastError;
    }
  } catch (error) {
    console.error(`[mapThesisToMarkets] Failed to map thesis: ${error.message}`);
    throw error;
  }
}

async function main() {
  try {
    const result = await mapThesisToMarkets("AI regulation will tighten in 2025");
    console.log("[main] Full structured result:");
    console.dir(result, { depth: null });
  } catch (error) {
    console.error(`[main] Script failed: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
