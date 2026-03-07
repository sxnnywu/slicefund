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

function tryParseJsonCandidate(candidate) {
  if (!candidate || typeof candidate !== "string") return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractFirstJsonBlob(text) {
  const normalized = stripCodeFences(text);

  const directParsed = tryParseJsonCandidate(normalized);
  if (directParsed !== null) {
    return directParsed;
  }

  const arrayMatch = normalized.match(/\[[\s\S]*\]/);
  const objectMatch = normalized.match(/\{[\s\S]*\}/);

  const options = [arrayMatch?.[0], objectMatch?.[0]].filter(Boolean);
  for (const option of options) {
    const parsed = tryParseJsonCandidate(option);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
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

function validateRange(value, min, max) {
  return typeof value === "number" && value >= min && value <= max;
}

function validateThesisResearcher(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "Output is not a JSON object." };
  }

  const markets = payload.markets;
  const confidence = getNumeric(payload, ["confidence_score", "confidence", "score"]);

  if (!Array.isArray(markets) || markets.length === 0) {
    return { ok: false, reason: "Missing non-empty 'markets' array." };
  }

  const invalidMarket = markets.find(
    (m) => !m || typeof m !== "object" || typeof m.platform !== "string" || typeof m.question !== "string"
  );
  if (invalidMarket) {
    return { ok: false, reason: "Each market must include string fields 'platform' and 'question'." };
  }

  if (!validateRange(confidence, 0, 1)) {
    return { ok: false, reason: "Missing confidence score in [0,1]." };
  }

  return { ok: true, reason: `Returned ${markets.length} markets with valid confidence.` };
}

function validateArbitrageScanner(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "Output is not a JSON object." };
  }

  const decisionRaw = String(payload.decision || "").toUpperCase();
  const spread = getNumeric(payload, ["spread", "spread_value", "spreadValue"]);
  const confidence = getNumeric(payload, ["confidence", "confidence_score", "score"]);

  if (!["CONFIRMED", "REJECTED"].includes(decisionRaw)) {
    return { ok: false, reason: "Decision must be CONFIRMED or REJECTED." };
  }

  if (spread === null) {
    return { ok: false, reason: "Missing numeric spread field." };
  }

  if (!validateRange(confidence, 0, 1)) {
    return { ok: false, reason: "Missing confidence score in [0,1]." };
  }

  return { ok: true, reason: `Decision ${decisionRaw} with spread ${spread}.` };
}

function validateIndexRebalancer(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "Output is not a JSON object." };
  }

  const candidates = [
    payload.positions,
    payload.rebalances,
    payload.instructions,
    payload.rebalance_positions,
    payload.rebalanceInstructions,
  ];
  const positions = candidates.find((value) => Array.isArray(value));

  if (!Array.isArray(positions)) {
    return { ok: false, reason: "Missing rebalancing positions/instructions array." };
  }

  const confidence = getNumeric(payload, ["urgency_score", "urgency", "score"]);
  if (confidence !== null && !validateRange(confidence, 0, 1)) {
    return { ok: false, reason: "Urgency score exists but is outside [0,1]." };
  }

  return { ok: true, reason: `Returned ${positions.length} rebalance instructions.` };
}

function validateAlertDispatcher(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, reason: "Output is not a JSON object." };
  }

  const decision = String(payload.decision || "").toUpperCase();
  const title = payload.title;
  const summary = payload.summary || payload.one_liner || payload.description;
  const spread = getNumeric(payload, ["spread", "spread_value", "spreadValue"]);
  const confidence = getNumeric(payload, ["confidence", "confidence_score", "score"]);
  const urgency = String(payload.urgency || payload.urgency_level || "").toUpperCase();

  if (!["CONFIRMED", "REJECTED"].includes(decision)) {
    return { ok: false, reason: "Missing decision field (CONFIRMED/REJECTED)." };
  }

  if (typeof title !== "string" || title.trim().length === 0) {
    return { ok: false, reason: "Missing title field." };
  }

  if (typeof summary !== "string" || summary.trim().length === 0) {
    return { ok: false, reason: "Missing summary field." };
  }

  if (spread === null) {
    return { ok: false, reason: "Missing numeric spread field." };
  }

  if (!validateRange(confidence, 0, 1)) {
    return { ok: false, reason: "Missing confidence score in [0,1]." };
  }

  if (!["LOW", "MEDIUM", "HIGH"].includes(urgency)) {
    return { ok: false, reason: "Urgency must be LOW, MEDIUM, or HIGH." };
  }

  return { ok: true, reason: `Alert '${title}' (${decision}) validated with urgency ${urgency}.` };
}

async function resolveAssistantId(agent) {
  const existing = process.env[agent.assistantEnvVar];
  if (existing && !FORCE_NEW_ASSISTANTS) {
    return { assistantId: existing, reused: true };
  }

  const assistantId = await agent.createAssistant();
  process.env[agent.assistantEnvVar] = assistantId;
  return { assistantId, reused: false };
}

function contentPreview(content) {
  if (typeof content !== "string") return "(no content)";
  return content.length > 180 ? `${content.slice(0, 180)}...` : content;
}

async function runOneAgentTest(agent) {
  const startedAt = Date.now();

  try {
    const { assistantId, reused } = await resolveAssistantId(agent);
    const threadId = await agent.createThread(assistantId);
    const response = await agent.sendMessage(threadId, agent.testMessage);
    const parsed = extractFirstJsonBlob(response?.content);
    const verdict = agent.validate(parsed);

    return {
      agent: agent.name,
      ok: verdict.ok,
      reason: verdict.reason,
      reusedAssistant: reused,
      elapsedMs: Date.now() - startedAt,
      responsePreview: verdict.ok ? undefined : contentPreview(response?.content),
    };
  } catch (error) {
    return {
      agent: agent.name,
      ok: false,
      reason: error.message,
      reusedAssistant: false,
      elapsedMs: Date.now() - startedAt,
      responsePreview: "(request failed)",
    };
  }
}

const AGENT_TESTS = [
  {
    name: "ThesisResearcher",
    assistantEnvVar: "THESIS_RESEARCHER_ASSISTANT_ID",
    createAssistant: createThesisAssistant,
    createThread: createThesisThread,
    sendMessage: sendThesisMessage,
    testMessage:
      "Thesis: AI regulation will tighten in 2025. Return ONLY valid JSON with keys: markets (array of objects with platform, question, relevance_explanation), confidence_score (0 to 1 number), sub_themes (array of strings). No markdown.",
    validate: validateThesisResearcher,
  },
  {
    name: "ArbitrageScanner",
    assistantEnvVar: "ARB_SCANNER_ASSISTANT_ID",
    createAssistant: createArbAssistant,
    createThread: createArbThread,
    sendMessage: sendArbMessage,
    testMessage:
      "Raw alert: Kalshi YES @ 0.42, Polymarket YES @ 0.58, question: Will the Fed cut rates in Q1 2025. Return ONLY valid JSON with keys: decision (CONFIRMED or REJECTED), spread (number), reasoning (string), confidence (0 to 1 number). No markdown.",
    validate: validateArbitrageScanner,
  },
  {
    name: "IndexRebalancer",
    assistantEnvVar: "INDEX_REBALANCER_ASSISTANT_ID",
    createAssistant: createRebalancerAssistant,
    createThread: createRebalancerThread,
    sendMessage: sendRebalancerMessage,
    testMessage:
      "Basket: [{ market: 'Will Fed cut rates Q1 2025', platform: 'Kalshi', target_weight: 0.25, current_weight: 0.31 }, { market: 'US recession by end 2025', platform: 'Polymarket', target_weight: 0.25, current_weight: 0.18 }]. Return ONLY valid JSON with keys: positions (array of objects with market, direction, adjustment_pct), urgency_score (0 to 1 number). No markdown.",
    validate: validateIndexRebalancer,
  },
  {
    name: "AlertDispatcher",
    assistantEnvVar: "ALERT_DISPATCHER_ASSISTANT_ID",
    createAssistant: createDispatcherAssistant,
    createThread: createDispatcherThread,
    sendMessage: sendDispatcherMessage,
    testMessage:
      "Trade analysis: decision: REJECTED, Kalshi YES @ 0.42, Polymarket YES @ 0.58, question: Will the Fed cut rates in Q1 2025, confidence: 0.87. Return ONLY valid JSON with keys: decision (CONFIRMED/REJECTED), title, summary, platforms (array of 2 strings), spread (number), confidence (0 to 1 number), actions (array of {platform, action BUY/SELL}), urgency (LOW/MEDIUM/HIGH). No markdown.",
    validate: validateAlertDispatcher,
  },
];

async function main() {
  console.log("\n=== Slidefund Agent Validation (Individual) ===");
  console.log(`Force new assistants: ${FORCE_NEW_ASSISTANTS ? "yes" : "no"}`);

  const results = [];
  for (const agent of AGENT_TESTS) {
    console.log(`\n→ Testing ${agent.name}...`);
    const result = await runOneAgentTest(agent);
    results.push(result);

    const status = result.ok ? "PASS" : "FAIL";
    console.log(`  [${status}] ${result.reason}`);
    console.log(`  Assistant reused: ${result.reusedAssistant ? "yes" : "no"}`);
    console.log(`  Duration: ${result.elapsedMs}ms`);

    if (!result.ok && result.responsePreview) {
      console.log(`  Response preview: ${result.responsePreview}`);
    }
  }

  console.log("\n=== Summary ===");
  console.table(
    results.map((r) => ({
      agent: r.agent,
      status: r.ok ? "PASS" : "FAIL",
      reusedAssistant: r.reusedAssistant,
      durationMs: r.elapsedMs,
      reason: r.reason,
    }))
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
    console.log(`\n${failed.length} agent test(s) failed.`);
    return;
  }

  console.log("\nAll individual agent tests passed.");
}

main().catch((error) => {
  console.error(`\n[runAgentTests] Failed: ${error.message}`);
  process.exit(1);
});
