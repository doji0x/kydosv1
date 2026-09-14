import { secrets } from "base44:runtime";

const ACTIONS = ["IGNORE", "QUARANTINE", "REFETCH", "REBUILD", "EXCLUDE_SOURCE"];

export async function reviewAnomaly(candidate, strong = false) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secrets.get("OPENAI_API_KEY")}` },
    body: JSON.stringify({
      model: strong ? "gpt-4o" : "gpt-4o-mini",
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "market_audit_verdict", strict: true, schema: {
          type: "object", additionalProperties: false,
          properties: {
            verdict: { type: "string", enum: ["IGNORE", "BAD_DATA"] },
            confidence: { type: "number" },
            reason: { type: "string" },
            recommended_action: { type: "string", enum: ACTIONS },
            suspected_source: { type: ["string", "null"] },
            affected_from: { type: "number" },
            affected_to: { type: "number" }
          },
          required: ["verdict", "confidence", "reason", "recommended_action", "suspected_source", "affected_from", "affected_to"]
        }}
      },
      messages: [
        { role: "system", content: "You are Astra, a market-data quality reviewer. Classify only. Never invent, estimate, or return a replacement price. Recommend deterministic action. Prefer IGNORE when evidence is insufficient." },
        { role: "user", content: JSON.stringify(candidate) }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenAI review failed (${response.status})`);
  const data = await response.json();
  const verdict = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  if (!["IGNORE", "BAD_DATA"].includes(verdict.verdict) || !ACTIONS.includes(verdict.recommended_action)) throw new Error("Invalid model verdict");
  return verdict;
}