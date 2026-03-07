import axios from "axios";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://app.backboard.io/api";
const SYSTEM_PROMPT =
  "You are an index rebalancing agent for Slidefund. You receive an ETF basket object containing a list of prediction market positions, their target weights, and their current weights based on live prices. Your job is to determine if any position has drifted more than 5% from its target weight and if so return a structured rebalance instruction. Return: a list of positions that need rebalancing, the direction for each (increase or decrease), the size of the adjustment as a percentage, and an overall rebalance urgency score from 0-1.";
const TEST_MESSAGE =
  "Basket: [{ market: 'Will Fed cut rates Q1 2025', platform: 'Kalshi', target_weight: 0.25, current_weight: 0.31 }, { market: 'US recession by end 2025', platform: 'Polymarket', target_weight: 0.25, current_weight: 0.18 }]";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

dotenv.config({ path: envPath });

const apiKey = process.env.BACKBOARD_API_KEY;

if (!apiKey) {
  console.error("[startup] Missing BACKBOARD_API_KEY in .env");
  process.exit(1);
}

const http = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  },
});

function logAxiosError(scope, error) {
  const status = error.response?.status;
  const statusText = error.response?.statusText;
  const responseData = error.response?.data;

  console.error(`[${scope}] Request failed.`);

  if (status) {
    const statusLine = statusText ? `${status} ${statusText}` : `${status}`;
    console.error(`[${scope}] Status: ${statusLine}`);
  }

  if (responseData) {
    console.error(`[${scope}] Response body:`, responseData);
  } else {
    console.error(`[${scope}] Error: ${error.message}`);
  }
}

function pickId(data, kind) {
  const directKindValue = data?.[kind];
  const nestedKindValue = data?.data?.[kind];

  if (typeof directKindValue === "string") {
    return directKindValue;
  }

  if (typeof nestedKindValue === "string") {
    return nestedKindValue;
  }

  return (
    data?.id ??
    data?._id ??
    data?.[`${kind}Id`] ??
    data?.[`${kind}_id`] ??
    data?.[kind]?.id ??
    data?.[kind]?._id ??
    data?.data?.id ??
    data?.data?._id ??
    data?.data?.[`${kind}Id`] ??
    data?.data?.[`${kind}_id`] ??
    data?.data?.[kind]?.id ??
    data?.data?.[kind]?._id ??
    null
  );
}

export async function createAssistant() {
  try {
    const response = await http.post("/assistants", {
      name: "IndexRebalancer",
      systemPrompt: SYSTEM_PROMPT,
    });

    const assistantId = pickId(response.data, "assistant");

    if (!assistantId) {
      console.error("[createAssistant] Unexpected response body:", response.data);
      throw new Error("Assistant ID missing in createAssistant response");
    }

    return assistantId;
  } catch (error) {
    logAxiosError("createAssistant", error);
    throw error;
  }
}

export async function createThread(assistantId) {
  try {
    const response = await http.post(`/assistants/${assistantId}/threads`);
    const threadId = pickId(response.data, "thread");

    if (!threadId) {
      console.error("[createThread] Unexpected response body:", response.data);
      throw new Error("Thread ID missing in createThread response");
    }

    return threadId;
  } catch (error) {
    logAxiosError("createThread", error);
    throw error;
  }
}

export async function sendMessage(threadId, content) {
  try {
    const response = await http.post(`/threads/${threadId}/messages`, {
      content,
      stream: false,
    });

    return response.data;
  } catch (error) {
    logAxiosError("sendMessage", error);
    throw error;
  }
}

export async function saveIds(assistantId, threadId) {
  try {
    let existing = "";

    try {
      existing = await fs.readFile(envPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
    const appended = `${needsLeadingNewline ? "\n" : ""}INDEX_REBALANCER_ASSISTANT_ID=${assistantId}\nINDEX_REBALANCER_THREAD_ID=${threadId}\n`;

    await fs.appendFile(envPath, appended, "utf8");
    console.log("[saveIds] Saved assistant and thread IDs to .env");
  } catch (error) {
    console.error(`[saveIds] Failed to append IDs to .env: ${error.message}`);
    throw error;
  }
}

export async function main() {
  let assistantId = process.env.INDEX_REBALANCER_ASSISTANT_ID;
  let threadId = process.env.INDEX_REBALANCER_THREAD_ID;

  if (assistantId) {
    console.log(`[main] Reusing existing assistant ID: ${assistantId}`);
  } else {
    console.log("[main] No assistant ID found. Creating assistant...");
    assistantId = await createAssistant();
    console.log(`[main] Assistant created: ${assistantId}`);

    threadId = await createThread(assistantId);
    console.log(`[main] Thread created: ${threadId}`);

    await saveIds(assistantId, threadId);
    process.env.INDEX_REBALANCER_ASSISTANT_ID = assistantId;
    process.env.INDEX_REBALANCER_THREAD_ID = threadId;
  }

  if (!threadId) {
    console.log("[main] No thread ID found. Creating thread...");
    threadId = await createThread(assistantId);
    console.log(`[main] Thread created: ${threadId}`);
  }

  const response = await sendMessage(threadId, TEST_MESSAGE);
  console.log("[main] Full Backboard response:");
  console.dir(response, { depth: null });
}

main().catch((error) => {
  console.error(`[main] Script failed: ${error.message}`);
  process.exit(1);
});
