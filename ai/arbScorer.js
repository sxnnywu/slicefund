import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

const MODEL_NAME = "gemini-2.5-flash-lite";
const FALLBACK_MODELS = ["gemini-2.5-flash"];
const FUNCTION_NAME = "score_arb_opportunity";
const BASE_PROMPT =
  "You are a prediction market arbitrage analyst. You have detected a price discrepancy on the same underlying question across two platforms. Analyze whether this is a genuine arbitrage opportunity or if the price difference has a legitimate explanation such as recent news, liquidity differences, or platform-specific factors.";

const arbScorerTool = {
  functionDeclarations: [
    {
      name: FUNCTION_NAME,
      description:
        "Score whether an arbitrage alert is exploitable after estimated fees/slippage and risk considerations.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          decision: {
            type: SchemaType.STRING,
            enum: ["EXPLOIT", "IGNORE"],
            description: "Final decision for this opportunity.",
          },
          confidence: {
            type: SchemaType.NUMBER,
            description: "Confidence from 0 to 1 in the decision.",
          },
          spread: {
            type: SchemaType.NUMBER,
            description: "Raw price difference between platform prices.",
          },
          adjusted_spread: {
            type: SchemaType.NUMBER,
            description:
              "Spread after estimated fees and slippage, assuming 2% total.",
          },
          reasoning: {
            type: SchemaType.STRING,
            description:
              "Plain English explanation of why this is or is not exploitable.",
          },
          risk_flags: {
            type: SchemaType.ARRAY,
            description:
              "Reasons to be cautious even when the decision is EXPLOIT.",
            items: {
              type: SchemaType.STRING,
            },
          },
          urgency: {
            type: SchemaType.STRING,
            enum: ["LOW", "MEDIUM", "HIGH"],
            description: "Time sensitivity of the opportunity.",
          },
        },
        required: [
          "decision",
          "confidence",
          "spread",
          "adjusted_spread",
          "reasoning",
          "risk_flags",
          "urgency",
        ],
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
    tools: [arbScorerTool],
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [FUNCTION_NAME],
      },
    },
  });

  return { result, modelName };
}

function extractScoredResult(response) {
  const functionCalls = response.functionCalls?.() ?? [];
  const scoredCall = functionCalls.find((call) => call.name === FUNCTION_NAME);

  if (!scoredCall) {
    const responseText = response.text?.() || "(empty response)";
    console.error("[scoreArbOpportunity] Gemini response text:", responseText);
    throw new Error("Gemini did not return a function call for arbitrage scoring.");
  }

  const args = scoredCall.args ?? {};

  return {
    decision: typeof args.decision === "string" ? args.decision : null,
    confidence: typeof args.confidence === "number" ? args.confidence : null,
    spread: typeof args.spread === "number" ? args.spread : null,
    adjusted_spread:
      typeof args.adjusted_spread === "number" ? args.adjusted_spread : null,
    reasoning: typeof args.reasoning === "string" ? args.reasoning : "",
    risk_flags: Array.isArray(args.risk_flags) ? args.risk_flags : [],
    urgency: typeof args.urgency === "string" ? args.urgency : null,
  };
}

export async function scoreArbOpportunity(
  question,
  platformA,
  priceA,
  platformB,
  priceB
) {
  try {
    if (!question || typeof question !== "string") {
      throw new Error("question must be a non-empty string.");
    }

    if (!platformA || typeof platformA !== "string") {
      throw new Error("platformA must be a non-empty string.");
    }

    if (!platformB || typeof platformB !== "string") {
      throw new Error("platformB must be a non-empty string.");
    }

    if (typeof priceA !== "number" || Number.isNaN(priceA)) {
      throw new Error("priceA must be a valid number.");
    }

    if (typeof priceB !== "number" || Number.isNaN(priceB)) {
      throw new Error("priceB must be a valid number.");
    }

    const client = initGemini();
    const prompt = `${BASE_PROMPT} Question: ${question}. Platform A: ${platformA} at ${priceA}. Platform B: ${platformB} at ${priceB}. Assume 2% total fees and slippage when calculating adjusted_spread.`;

    try {
      const { result } = await generateWithModel(client, MODEL_NAME, prompt);
      return extractScoredResult(result.response);
    } catch (error) {
      if (!isModelNotFoundError(error)) {
        throw error;
      }

      console.error(
        `[scoreArbOpportunity] Model ${MODEL_NAME} unavailable for this API key/version. Trying fallbacks...`
      );

      let lastError = error;

      for (const fallbackModel of FALLBACK_MODELS) {
        try {
          const { result, modelName } = await generateWithModel(client, fallbackModel, prompt);
          console.log(`[scoreArbOpportunity] Using fallback model: ${modelName}`);
          return extractScoredResult(result.response);
        } catch (fallbackError) {
          if (isQuotaExceededError(fallbackError)) {
            throw new Error(
              `Gemini quota exceeded or billing is not enabled for this API key. ${fallbackError.message}`
            );
          }

          lastError = fallbackError;
          console.error(
            `[scoreArbOpportunity] Fallback model ${fallbackModel} failed: ${fallbackError.message}`
          );
        }
      }

      throw lastError;
    }
  } catch (error) {
    console.error(`[scoreArbOpportunity] Failed to score arbitrage opportunity: ${error.message}`);
    throw error;
  }
}

async function main() {
  try {
    const result = await scoreArbOpportunity(
      "Will the Fed cut rates in Q1 2025",
      "Kalshi",
      0.42,
      "Polymarket",
      0.58
    );

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
