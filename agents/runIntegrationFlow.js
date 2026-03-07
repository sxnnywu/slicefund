import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAssistant as createThesisAssistant,
  createThread as createThesisThread,
  sendMessage as sendThesisMessage,
} from "./thesisResearcher.js";
import {
  createAssistant as createArbAssistant,
  createThread as createArbThread,
  sendMessage as sendArbMessage,
} from "./arbitrageScanner.js";
import {
  createAssistant as createRebalancerAssistant,
  createThread as createRebalancerThread,
  sendMessage as sendRebalancerMessage,
} from "./indexRebalancer.js";
import {
  createAssistant as createDispatcherAssistant,
  createThread as createDispatcherThread,
  sendMessage as sendDispatcherMessage,
} from "./alertDispatcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
dotenv.config({ path: envPath });

const FORCE_NEW_ASSISTANTS = process.env.AGENTS_FORCE_NEW_ASSISTANTS === "1";

function stripCodeFences(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseStructuredContent(text) {
  const normalized = stripCodeFences(text);
  try {
    return JSON.parse(normalized);
  } catch {
    const objectMatch = normalized.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function getNumeric(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

async function resolveAssistantId(envVar, createAssistantFn) {
  const existing = process.env[envVar];
  if (existing && !FORCE_NEW_ASSISTANTS) {
    return { assistantId: existing, reused: true };
  }

  const assistantId = await createAssistantFn();
  process.env[envVar] = assistantId;
  return { assistantId, reused: false };
}

async function callAgent({ envVar, createAssistant, createThread, sendMessage, message }) {
  const { assistantId } = await resolveAssistantId(envVar, createAssistant);
  const threadId = await createThread(assistantId);
  return sendMessage(threadId, message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runThesisToRebalanceFlow() {
  console.log("\n=== Flow A: ThesisResearcher -> IndexRebalancer ===");

  const thesisMessage =
    "Thesis: AI regulation will tighten in 2025. Return ONLY valid JSON object with keys: markets (array of objects with platform, question, relevance_explanation), confidence_score (number 0..1), sub_themes (array). No markdown.";

  const thesisResponse = await callAgent({
    envVar: "THESIS_RESEARCHER_ASSISTANT_ID",
    createAssistant: createThesisAssistant,
    createThread: createThesisThread,
    sendMessage: sendThesisMessage,
    message: thesisMessage,
  });

  const thesisPayload = parseStructuredContent(thesisResponse?.content);
  assert(thesisPayload && typeof thesisPayload === "object", "ThesisResearcher did not return parseable JSON.");
  assert(Array.isArray(thesisPayload.markets) && thesisPayload.markets.length > 0, "ThesisResearcher returned no markets.");

  const selected = thesisPayload.markets.slice(0, 3);
  const baseWeight = Number((1 / selected.length).toFixed(2));

  const basket = selected.map((market, index) => ({
    market: market.question,
    platform: market.platform,
    target_weight: baseWeight,
    current_weight:
      index === 0
        ? Number((baseWeight + 0.08).toFixed(2))
        : index === 1
          ? Number((Math.max(baseWeight - 0.07, 0.01)).toFixed(2))
          : baseWeight,
  }));

  const rebalanceMessage =
    `Basket: ${JSON.stringify(basket)}. Return ONLY valid JSON object with keys: positions (array of {market, direction, adjustment_pct}), urgency_score (number 0..1). No markdown.`;

  const rebalanceResponse = await callAgent({
    envVar: "INDEX_REBALANCER_ASSISTANT_ID",
    createAssistant: createRebalancerAssistant,
    createThread: createRebalancerThread,
    sendMessage: sendRebalancerMessage,
    message: rebalanceMessage,
  });

  const rebalancePayload = parseStructuredContent(rebalanceResponse?.content);
  assert(rebalancePayload && typeof rebalancePayload === "object", "IndexRebalancer did not return parseable JSON.");

  const positions =
    rebalancePayload.positions ||
    rebalancePayload.rebalances ||
    rebalancePayload.instructions ||
    rebalancePayload.rebalance_positions ||
    rebalancePayload.rebalanceInstructions;

  assert(Array.isArray(positions), "IndexRebalancer output missing positions/instructions array.");

  console.log(`PASS: ThesisResearcher returned ${thesisPayload.markets.length} markets.`);
  console.log(`PASS: IndexRebalancer returned ${positions.length} rebalance instructions.`);

  return {
    marketsFound: thesisPayload.markets.length,
    rebalanceInstructions: positions.length,
  };
}

async function runArbToDispatchFlow() {
  console.log("\n=== Flow B: ArbitrageScanner -> AlertDispatcher ===");

  const rawAlert =
    "Raw alert: Kalshi YES @ 0.20, Polymarket YES @ 0.80, question: Will the Fed cut rates in Q1 2025. Return ONLY valid JSON with keys: decision (CONFIRMED/REJECTED), spread (number), reasoning (string), confidence (number 0..1). No markdown.";

  const scannerResponse = await callAgent({
    envVar: "ARB_SCANNER_ASSISTANT_ID",
    createAssistant: createArbAssistant,
    createThread: createArbThread,
    sendMessage: sendArbMessage,
    message: rawAlert,
  });

  const scannerPayload = parseStructuredContent(scannerResponse?.content);
  assert(scannerPayload && typeof scannerPayload === "object", "ArbitrageScanner did not return parseable JSON.");

  const decision = String(scannerPayload.decision || "").toUpperCase();
  const spread = getNumeric(scannerPayload, ["spread", "spread_value", "spreadValue"]);
  const confidence = getNumeric(scannerPayload, ["confidence", "confidence_score", "score"]);

  assert(["CONFIRMED", "REJECTED"].includes(decision), "ArbitrageScanner decision is invalid.");
  assert(spread !== null, "ArbitrageScanner spread is missing.");
  assert(confidence !== null, "ArbitrageScanner confidence is missing.");

  const dispatchInput =
    `Trade analysis: decision: ${decision}, Kalshi YES @ 0.20, Polymarket YES @ 0.80, question: Will the Fed cut rates in Q1 2025, spread: ${spread}, confidence: ${confidence}. Return ONLY valid JSON with keys: decision (CONFIRMED/REJECTED), title, summary, platforms (array of 2 strings), spread (number), confidence (number 0..1), actions (array of {platform, action BUY/SELL}), urgency (LOW/MEDIUM/HIGH). No markdown.`;

  const dispatcherResponse = await callAgent({
    envVar: "ALERT_DISPATCHER_ASSISTANT_ID",
    createAssistant: createDispatcherAssistant,
    createThread: createDispatcherThread,
    sendMessage: sendDispatcherMessage,
    message: dispatchInput,
  });

  const dispatcherPayload = parseStructuredContent(dispatcherResponse?.content);
  assert(dispatcherPayload && typeof dispatcherPayload === "object", "AlertDispatcher did not return parseable JSON.");

  const dispatcherDecision = String(dispatcherPayload.decision || "").toUpperCase();
  const title = dispatcherPayload.title;
  const summary = dispatcherPayload.summary || dispatcherPayload.one_liner || dispatcherPayload.description;
  const urgency = String(dispatcherPayload.urgency || dispatcherPayload.urgency_level || "").toUpperCase();

  assert(["CONFIRMED", "REJECTED"].includes(dispatcherDecision), "AlertDispatcher decision is invalid.");
  assert(dispatcherDecision === decision, "AlertDispatcher decision does not match scanner decision.");
  assert(typeof title === "string" && title.trim().length > 0, "AlertDispatcher title missing.");
  assert(typeof summary === "string" && summary.trim().length > 0, "AlertDispatcher summary missing.");
  assert(["LOW", "MEDIUM", "HIGH"].includes(urgency), "AlertDispatcher urgency is invalid.");

  console.log(`PASS: ArbitrageScanner decision=${decision}, spread=${spread}, confidence=${confidence}.`);
  console.log(`PASS: AlertDispatcher emitted '${title}' (${dispatcherDecision}) with urgency ${urgency}.`);

  return {
    scannerDecision: decision,
    scannerSpread: spread,
    scannerConfidence: confidence,
    dispatcherDecision,
    dispatcherTitle: title,
    dispatcherUrgency: urgency,
  };
}

async function main() {
  console.log("\n=== Slidefund Agent Integration Validation ===");
  console.log(`Force new assistants: ${FORCE_NEW_ASSISTANTS ? "yes" : "no"}`);

  const flowA = await runThesisToRebalanceFlow();
  const flowB = await runArbToDispatchFlow();

  console.log("\n=== Integration Summary ===");
  console.table([
    {
      flow: "ThesisResearcher -> IndexRebalancer",
      marketsFound: flowA.marketsFound,
      rebalanceInstructions: flowA.rebalanceInstructions,
      status: "PASS",
    },
    {
      flow: "ArbitrageScanner -> AlertDispatcher",
      decision: flowB.scannerDecision,
      dispatcherDecision: flowB.dispatcherDecision,
      spread: flowB.scannerSpread,
      urgency: flowB.dispatcherUrgency,
      status: "PASS",
    },
  ]);

  console.log("\nAll integration flow checks passed.");
}

main().catch((error) => {
  console.error(`\n[runIntegrationFlow] FAIL: ${error.message}`);
  process.exit(1);
});
