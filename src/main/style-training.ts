import store from "./store";
import { getGroqClient } from "./groq-client";

const MAX_EXAMPLES = 5;

export function addStyleExample(text: string): void {
  const examples = store.get("writingStyleExamples") as string[];
  examples.push(text);
  if (examples.length > MAX_EXAMPLES) {
    examples.splice(0, examples.length - MAX_EXAMPLES);
  }
  store.set("writingStyleExamples", examples);
}

export function removeStyleExample(index: number): void {
  const examples = store.get("writingStyleExamples") as string[];
  if (index >= 0 && index < examples.length) {
    examples.splice(index, 1);
    store.set("writingStyleExamples", examples);
  }
}

export function getStyleExamples(): string[] {
  return store.get("writingStyleExamples") as string[];
}

export async function generateStylePrompt(examples: string[]): Promise<string> {
  if (examples.length === 0) return "";

  const client = getGroqClient();
  const samplesText = examples.map((e, i) => `Sample ${i + 1}:\n${e}`).join("\n\n");

  const response = await client.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "system",
        content:
          "Analyze the following writing samples and describe the writing style in terms of tone, sentence structure, vocabulary level, and formatting preferences. Be specific and concise (2-3 sentences). This description will be used as a prompt to reproduce the style.",
      },
      { role: "user", content: samplesText },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  const prompt = response.choices[0]?.message?.content?.trim() ?? "";
  store.set("writingStylePrompt", prompt);
  return prompt;
}

export function getStyleConfig(): { examples: string[]; prompt: string } {
  return {
    examples: store.get("writingStyleExamples") as string[],
    prompt: store.get("writingStylePrompt") as string,
  };
}
