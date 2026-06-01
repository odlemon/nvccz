/**
 * Estimates LLM tokens per portfolio application shortlisting (one chat/completions call).
 * Run: npx ts-node --transpile-only scripts/estimate-application-llm-tokens.ts
 */
import type { ExtractedDocumentContent } from "../src/services/DocumentTextExtractionService";

const MAX_CHAR_PER_DOCUMENT = 4000;

const DOC_TYPES = [
  "BUSINESS_PLAN",
  "PROOF_OF_CONCEPT",
  "MARKET_RESEARCH",
  "PROJECTED_CASH_FLOWS"
] as const;

function charsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function makeDocs(charsPerDoc: number[]): ExtractedDocumentContent[] {
  return DOC_TYPES.map((type, i) => {
    const len = charsPerDoc[i] ?? 0;
    const truncated = len >= MAX_CHAR_PER_DOCUMENT;
    return {
      url: `https://example.com/${type}.pdf`,
      type,
      fileName: `${type}.pdf`,
      text: "word ".repeat(Math.ceil(len / 5)).slice(0, len),
      truncated,
      contentHash: `hash-${i}`
    };
  });
}

const applicationData = {
  applicantName: "Test Applicant",
  businessName: "Test Co",
  businessDescription: "Sample business description for token estimation.".repeat(8),
  industry: "Finance",
  businessStage: "STARTUP",
  requestedAmount: 40000,
  foundingDate: new Date("2025-11-02"),
  applicantAddress: "123 Example Road, Harare"
};

// Access private prompt builder via score path: we only need prompt length — duplicate buildScoringPrompt logic inline
function estimatePromptChars(docChars: number[]): number {
  const documents = makeDocs(docChars);
  const hashCounts: Record<string, number> = {};
  documents.forEach((doc) => {
    if (doc.contentHash) {
      hashCounts[doc.contentHash] = (hashCounts[doc.contentHash] || 0) + 1;
    }
  });

  const documentInfo = documents
    .map((doc, index) => {
      const header = `### Document ${index + 1}: ${doc.type} - ${doc.fileName}`;
      const meta = doc.extractionError
        ? `Extraction Error: ${doc.extractionError}`
        : [
            `Text Length: ${doc.text.length} characters${doc.truncated ? " (truncated)" : ""}`,
            doc.contentHash ? `Content Hash: ${doc.contentHash}` : "Content Hash: N/A",
            doc.contentHash && hashCounts[doc.contentHash] > 1
              ? `Duplicate Documents: ${hashCounts[doc.contentHash]} copies detected`
              : "Duplicate Documents: none detected"
          ].join(" | ");
      const content = doc.extractionError ? "" : `\n"""${doc.text}"""`;
      return `${header}\n${meta}${content}`;
    })
    .join("\n\n");

  const prompt = `You are evaluating an investment application. Please analyze the provided documents and application data.

**Application Details:**
- Applicant Name: ${applicationData.applicantName}
- Business Name: ${applicationData.businessName}
- Business Description: ${applicationData.businessDescription}
- Industry: ${applicationData.industry}
- Business Stage: ${applicationData.businessStage}
- Requested Amount: $${applicationData.requestedAmount.toLocaleString()}
- Founding Date: ${applicationData.foundingDate || "Not provided"}
- Location: ${applicationData.applicantAddress || "Not provided"}

**Documents (extracted text provided below):**

${documentInfo}

**Note:** The text above is extracted directly from the applicant's uploaded documents. If any extraction errors are listed, consider the documents as unavailable and base your assessment on the remaining information.

**Task:**
1. Analyze the application data provided (applicant details, business information, requested amount, etc.)
2. Extract and infer applicant details from the provided information (geographical location, sector, potential demographics if inferable from business name/description)
3. Calculate an Application Score (0-100%) based on weighted criteria:
   - **Requested Budget** (15%): Score based on whether amount is within $20k-$150k band
   - **Innovation** (15%): Level of innovation and uniqueness
   - **Growth Potential** (15%): Market size and scalability potential
   - **Scalability** (15%): Ability to scale the business model
   - **Sustainability** (10%): Long-term viability and sustainability
   - **Proven Concept** (10%): Evidence of concept validation or traction
   - **Business Stage** (10%): Maturity and readiness (IDEA < STARTUP < OPERATIONAL)
   - **Strategic Parameters** (10%): 
     - Geographical location alignment
     - Sector alignment
     - Gender focus (Youth/Women/Male) - prioritize Youth and Women

3. Extract applicant details from documents (especially pitch deck) including:
   - Demographics (gender, age group if mentioned)
   - Location details
   - Any strategic alignment indicators

4. Pay close attention to potential issues:
   - If multiple documents appear identical or generic, note this explicitly and reduce the score modestly (but do not automatically fail the application).
   - If key required documents are missing, corrupted, or contain irrelevant content, explain the impact in your reasoning and factor it into the score.
   - Always balance these concerns with any strengths the application demonstrates; err on the side of giving the applicant a fair chance when there is potential.

**Important Rules:**
- If score < 50%: Application should be REJECTED_SCREENING
- If score >= 50%: Application should be SCREENING
- Be lenient and generous in your scoring - give credit for effort and potential
- Consider the strategic parameters (Youth/Women focus gets higher scores)
- Don't be too strict - if there's potential, give it a chance
- Missing some details is okay - focus on what's there and the business potential

**Response Format (JSON only):**
{
  "score": <number between 0-100>,
  "reasoning": "<detailed explanation of the score, including breakdown by criteria>",
  "applicantDetails": {
    "gender": "<if mentioned>",
    "ageGroup": "<if mentioned>",
    "location": "<extracted location details>",
    "sectorAlignment": "<sector alignment notes>",
    "strategicAlignment": "<strategic alignment notes>"
  }
}

**Important:** While the documents are available at the provided Firebase URLs, you should analyze based on the application data provided. For a production system, these documents should be downloaded and text-extracted before analysis. For now, provide the best possible score based on the available application information and typical investment criteria.`;

  return prompt.length;
}

const SYSTEM_CHARS = 180;
const OUTPUT_TYPICAL = 1200;
const OUTPUT_MAX = 2000;

const scenarios: { name: string; docChars: number[] }[] = [
  { name: "Light (4 docs ~800 chars each)", docChars: [800, 800, 800, 800] },
  { name: "Typical (4 docs ~2,500 chars each)", docChars: [2500, 2500, 2500, 2500] },
  { name: "Heavy (4 docs capped at 4,000 chars)", docChars: [4000, 4000, 4000, 4000] }
];

const PRICING = {
  "deepseek-v4-flash (default deepseek-chat)": { inputPerM: 0.14, outputPerM: 0.28 },
  "deepseek-v4-pro": { inputPerM: 0.435, outputPerM: 0.87 },
  "openai-gpt-4o list (when LLM_API_KEY set)": { inputPerM: 2.5, outputPerM: 10.0 },
  "claude-opus-4-8 (Anthropic Opus 4.8)": { inputPerM: 5.0, outputPerM: 25.0 },
  "gemini-3.5-flash (Google Standard paid)": { inputPerM: 1.5, outputPerM: 9.0 }
};

/** Stated client-facing cost per application (see docs/portfolio-application-ai-cost-comparison.md). */
const CLIENT_COST_PER_APP = {
  gpt: 0.4,
  claudeOpus48: 0.67,
  gemini35Flash: 0.49
} as const;

const VOLUME_TIERS = [100, 250, 500, 1000, 2500];

function usd(tokens: number, perM: number) {
  return (tokens / 1_000_000) * perM;
}

function costFromRates(inputTokens: number, outputTokens: number, inputPerM: number, outputPerM: number) {
  return usd(inputTokens, inputPerM) + usd(outputTokens, outputPerM);
}

console.log("=== Portfolio application — LLM token estimate (1 call per application) ===\n");
console.log("Pipeline: DocumentTextExtractionService (max 4,000 chars/doc) → ChatGPTService → LlmChatService");
console.log("Default model:", process.env.LLM_MODEL || "deepseek-chat (→ DeepSeek V4-Flash)");
console.log("max_tokens (completion cap):", 2000);
console.log("");

for (const s of scenarios) {
  const userChars = estimatePromptChars(s.docChars);
  const systemTokens = charsToTokens(SYSTEM_CHARS);
  const userTokens = charsToTokens(userChars);
  const inputTokens = systemTokens + userTokens;

  console.log(`--- ${s.name} ---`);
  console.log(`  Input:  ~${inputTokens.toLocaleString()} tokens (${userChars.toLocaleString()} user chars)`);
  console.log(`  Output: ~${OUTPUT_TYPICAL.toLocaleString()} typical / ${OUTPUT_MAX.toLocaleString()} max`);
  console.log(`  Total:  ~${(inputTokens + OUTPUT_TYPICAL).toLocaleString()} tokens per application (typical)`);

  for (const [label, p] of Object.entries(PRICING)) {
    const cost =
      usd(inputTokens, p.inputPerM) + usd(OUTPUT_TYPICAL, p.outputPerM);
    console.log(`  Cost (${label}): $${cost.toFixed(5)} USD`);
  }
  console.log("");
}

console.log("Note: The API does not persist usage.* from the provider; these are estimates.");
console.log("Retries on DB timeout can re-run scoring (up to 3 attempts) — rare extra cost.");

// --- Client comparison (heavy / max workload) — aligns with docs/portfolio-application-ai-cost-comparison.md ---
const heavy = scenarios.find((s) => s.name.includes("Heavy"))!;
const heavyUserChars = estimatePromptChars(heavy.docChars);
const heavyInputTokens = charsToTokens(SYSTEM_CHARS) + charsToTokens(heavyUserChars);
const heavyOutputTokens = OUTPUT_MAX;
const heavyTotalTokens = heavyInputTokens + heavyOutputTokens;

const gptPerApp = CLIENT_COST_PER_APP.gpt;
const claudePerApp = CLIENT_COST_PER_APP.claudeOpus48;
const geminiPerApp = CLIENT_COST_PER_APP.gemini35Flash;

console.log("\n=== Multi-model client comparison (stated rates, ~7,200 tokens/app) ===\n");
console.log(`  Input ~${heavyInputTokens.toLocaleString()} | Output ~${heavyOutputTokens.toLocaleString()} | Total ~${heavyTotalTokens.toLocaleString()} tokens per application\n`);

const models = [
  { label: "GPT (OpenAI)", modelId: "(production GPT)", perApp: gptPerApp },
  { label: "Claude Opus 4.8", modelId: "claude-opus-4-8", perApp: claudePerApp },
  { label: "Gemini 3.5 Flash", modelId: "gemini-3.5-flash", perApp: geminiPerApp }
];

console.log("  Per application:");
for (const m of models) {
  console.log(`    ${m.label} (${m.modelId}): $${m.perApp.toFixed(2)}`);
}

console.log("\n  Volume (USD, stated rates):");
console.log("    Applications | GPT @ $0.40 | Claude @ $0.67 | Gemini @ $0.49");
for (const n of VOLUME_TIERS) {
  console.log(
    `    ${String(n).padStart(12)} | $${(n * gptPerApp).toFixed(0).padStart(6)} | $${(n * claudePerApp).toFixed(0).padStart(15)} | $${(n * geminiPerApp).toFixed(0).padStart(17)}`
  );
}

console.log("\n  What $50 buys (applications):");
for (const m of models) {
  const count = Math.floor(50 / m.perApp);
  console.log(`    ${m.label}: ${count.toLocaleString()} applications`);
}
