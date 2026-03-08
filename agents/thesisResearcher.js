import axios from "axios";
import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://app.backboard.io/api";
const SYSTEM_PROMPT =
	"You are a prediction market research agent for Slidefund. When given a user thesis in plain English, return concise, scannable output in this exact plain-text format:\n\nQuick Take: <1 sentence, max 20 words>\nKey Drivers:\n- <bullet 1, max 12 words>\n- <bullet 2, max 12 words>\n- <bullet 3, max 12 words>\nRisks / Contradictions:\n- <bullet 1, max 12 words>\n- <bullet 2, max 12 words>\nBest Market Angles:\n- [Platform] <market question>\n- [Platform] <market question>\n- [Platform] <market question>\nConfidence: <0.00-1.00>\n\nRules: plain text only, no markdown, no bold, no italics, no code blocks, no numbered lists, no extra headings, no commentary outside these fields, and do not repeat section labels inside bullet text. Keep total response under 120 words.";
const TEST_MESSAGE = "Thesis: AI regulation will tighten in 2025";

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
			name: "Slidefund ThesisResearcher",
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
		const appended = `${needsLeadingNewline ? "\n" : ""}THESIS_RESEARCHER_ASSISTANT_ID=${assistantId}\nTHESIS_RESEARCHER_THREAD_ID=${threadId}\n`;

		await fs.appendFile(envPath, appended, "utf8");
		console.log("[saveIds] Saved assistant and thread IDs to .env");
	} catch (error) {
		console.error(`[saveIds] Failed to append IDs to .env: ${error.message}`);
		throw error;
	}
}

/**
 * Analyze a thesis using the ThesisResearcher agent
 * Returns the agent's response with market recommendations
 */
export async function analyzeThesis(thesis) {
	let assistantId = process.env.THESIS_RESEARCHER_ASSISTANT_ID;
	let threadId = process.env.THESIS_RESEARCHER_THREAD_ID;

	// Create or reuse assistant
	if (!assistantId) {
		assistantId = await createAssistant();
		threadId = await createThread(assistantId);
		await saveIds(assistantId, threadId);
		process.env.THESIS_RESEARCHER_ASSISTANT_ID = assistantId;
		process.env.THESIS_RESEARCHER_THREAD_ID = threadId;
	}

	// Create thread if missing
	if (!threadId) {
		threadId = await createThread(assistantId);
	}

	// Send thesis to agent
	const conciseFormatInstruction =
		"Respond in compact plain text only: Quick Take on one line, then Key Drivers (3 bullets), Risks / Contradictions (2 bullets), Best Market Angles (3 bullets), Confidence (0-1). No markdown, no bold, and do not repeat labels inside bullet text. Keep under 120 words.";
	const response = await sendMessage(
		threadId,
		`${conciseFormatInstruction}\n\nThesis: ${thesis}`
	);
	return response;
}

export async function main() {
	let assistantId = process.env.THESIS_RESEARCHER_ASSISTANT_ID;
	let threadId = process.env.THESIS_RESEARCHER_THREAD_ID;

	if (assistantId) {
		console.log(`[main] Reusing existing assistant ID: ${assistantId}`);
	} else {
		console.log("[main] No assistant ID found. Creating assistant...");
		assistantId = await createAssistant();
		console.log(`[main] Assistant created: ${assistantId}`);

		threadId = await createThread(assistantId);
		console.log(`[main] Thread created: ${threadId}`);

		await saveIds(assistantId, threadId);
		process.env.THESIS_RESEARCHER_ASSISTANT_ID = assistantId;
		process.env.THESIS_RESEARCHER_THREAD_ID = threadId;
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

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
	main().catch((error) => {
		console.error(`[main] Script failed: ${error.message}`);
		process.exit(1);
	});
}
