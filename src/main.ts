import "dotenv/config";
import OpenAI from "openai";
import { readFileFromCloud } from "./prismicLib/readFileFromCloud.js";
import { writeFileToCloud } from "./prismicLib/writeFileToCloud.js";

/**
 * Article structure without the similarTo field
 */
interface Article {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly takeaways: readonly string[];
}

/**
 * Complete enriched article structure with similarTo field
 */
interface EnrichedArticle extends Article {
  readonly similarTo: {
    readonly title: string | null;
    readonly reason: string;
  };
}

/**
 * Diff structure showing changes between two outputs
 */
interface Diff {
  readonly changed: Record<
    string,
    | { readonly before: unknown; readonly after: unknown }
    | Record<string, { readonly before: unknown; readonly after: unknown }>
  >;
}

/**
 * OpenAI response for article similarity
 */
interface SimilarityAnalysis {
  readonly title: string | null;
  readonly reason: string;
}

/**
 * Retries an async operation with exponential backoff.
 * Handles partial data by validating JSON parsing.
 */
const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 1000,
  validator?: (result: T) => boolean
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await operation();

      if (validator && !validator(result)) {
        throw new Error("Invalid or partial data received");
      }

      return result;
    } catch (error) {
      lastError = error as Error;
      const isLastAttempt = attempt === maxRetries - 1;

      if (isLastAttempt) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(
        `Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `Operation failed after ${maxRetries} attempts: ${lastError?.message}`
  );
};

/**
 * Validates that a string is valid JSON and can be parsed
 */
const isValidJson = (data: string): boolean => {
  try {
    JSON.parse(data);
    return true;
  } catch {
    return false;
  }
};

/**
 * Reads and parses a JSON file from the cloud with retry logic
 */
const readJsonFromCloud = async <T>(path: string): Promise<T> => {
  const data = await retryWithBackoff(
    () => readFileFromCloud(path),
    5,
    1000,
    isValidJson
  );
  return JSON.parse(data) as T;
};

/**
 * Writes JSON data to the cloud with retry logic
 */
const writeJsonToCloud = async (
  path: string,
  data: unknown
): Promise<void> => {
  const jsonString = JSON.stringify(data, null, 2);
  await retryWithBackoff(() => writeFileToCloud(path, jsonString), 5, 1000);
};

/**
 * Uses OpenAI to find the most semantically similar article
 */
const findSimilarArticle = async (
  article: Article,
  previousArticles: readonly Article[],
  openai: OpenAI
): Promise<SimilarityAnalysis> => {
  const prompt = `You are an expert at analyzing semantic similarity between articles.

Given this NEW article:
Title: "${article.title}"
Summary: ${article.summary}
Category: ${article.category}
Takeaways: ${article.takeaways.join(", ")}

And these PREVIOUS articles:
${previousArticles
  .map(
    (prev, idx) => `
${idx + 1}. Title: "${prev.title}"
   Summary: ${prev.summary}
   Category: ${prev.category}
   Takeaways: ${prev.takeaways.join(", ")}`
  )
  .join("\n")}

Analyze the semantic similarity between the new article and each previous article. Consider:
- Core topics and themes
- Target audience and use cases
- Technical concepts and domains
- Practical applications

Find the MOST semantically similar article. If none match well (similarity < 40%), return null for the title.

Respond in JSON format with:
{
  "title": "exact title of most similar article or null",
  "reason": "detailed explanation of why they are similar, or why none match"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a semantic analysis expert. Respond only with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  return JSON.parse(content) as SimilarityAnalysis;
};

/**
 * Generates a diff between two enriched articles
 */
const generateDiff = (
  oldOutput: EnrichedArticle,
  newOutput: EnrichedArticle
): Diff => {
  const changed: Diff["changed"] = {};

  const primitiveFields = ["title", "summary", "category"] as const;
  for (const field of primitiveFields) {
    if (oldOutput[field] !== newOutput[field]) {
      changed[field] = {
        before: oldOutput[field],
        after: newOutput[field],
      };
    }
  }

  const oldTakeaways = oldOutput.takeaways;
  const newTakeaways = newOutput.takeaways;
  if (
    oldTakeaways.length !== newTakeaways.length ||
    !oldTakeaways.every((val, idx) => val === newTakeaways[idx])
  ) {
    changed.takeaways = {
      before: oldTakeaways,
      after: newTakeaways,
    };
  }

  const oldSimilar = oldOutput.similarTo;
  const newSimilar = newOutput.similarTo;

  const similarToChanges: Record<
    string,
    { readonly before: unknown; readonly after: unknown }
  > = {};

  if (oldSimilar.title !== newSimilar.title) {
    similarToChanges.title = {
      before: oldSimilar.title,
      after: newSimilar.title,
    };
  }

  if (oldSimilar.reason !== newSimilar.reason) {
    similarToChanges.reason = {
      before: oldSimilar.reason,
      after: newSimilar.reason,
    };
  }

  if (Object.keys(similarToChanges).length > 0) {
    changed.similarTo = similarToChanges;
  }

  return { changed };
};

async function main(): Promise<void> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    console.log("🔍 Reading enriched article from cloud...");
    const article = await readJsonFromCloud<Article>(
      "src/prismicLib/enriched-article.json"
    );

    console.log("📚 Reading previous articles from cloud...");
    const previousArticles = await readJsonFromCloud<readonly Article[]>(
      "src/prismicLib/previous-articles.json"
    );

    console.log("🤖 Analyzing semantic similarity with OpenAI...");
    const similarityAnalysis = await findSimilarArticle(
      article,
      previousArticles,
      openai
    );

    const enrichedOutput: EnrichedArticle = {
      ...article,
      similarTo: {
        title: similarityAnalysis.title,
        reason: similarityAnalysis.reason,
      },
    };

    console.log("✅ Output:");
    console.log(JSON.stringify(enrichedOutput, null, 2));

    let diff: Diff = { changed: {} };
    try {
      console.log("\n🔍 Checking for existing output...");
      const existingOutput = await readJsonFromCloud<EnrichedArticle>(
        "output.json"
      );
      diff = generateDiff(existingOutput, enrichedOutput);
      console.log("\n🧾 Diff:");
      console.log(JSON.stringify(diff, null, 2));
    } catch {
      console.log("ℹ️  No existing output found, skipping diff generation.");
      console.log("\n🧾 Diff:");
      console.log(JSON.stringify(diff, null, 2));
    }

    console.log("\n💾 Writing output files to cloud in parallel...");
    await Promise.all([
      writeJsonToCloud("output.json", enrichedOutput),
      writeJsonToCloud("diff.json", diff),
    ]);

    console.log("✨ Done! Files written successfully.");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
