import "dotenv/config";
import OpenAI from "openai";
import { readFileFromCloud } from "./prismicLib/readFileFromCloud.js";
import { writeFileToCloud } from "./prismicLib/writeFileToCloud.js";

interface Article {
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly takeaways: readonly string[];
}

interface EnrichedArticle extends Article {
  readonly similarTo: {
    readonly title: string | null;
    readonly reason: string;
  };
}

interface Diff {
  readonly changed: Record<
    string,
    | { readonly before: unknown; readonly after: unknown }
    | Record<string, { readonly before: unknown; readonly after: unknown }>
  >;
}

interface SimilarityAnalysis {
  readonly title: string | null;
  readonly reason: string;
}

const retryWithBackoff = async <T>({
  operation,
  maxRetries = 5,
  baseDelay = 1000,
  validator,
}: {
  operation: () => Promise<T>;
  maxRetries?: number;
  baseDelay?: number;
  validator?: (result: T) => boolean;
}): Promise<T> => {
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
        `Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(
    `Operation failed after ${maxRetries} attempts: ${lastError?.message}`,
  );
};

const isValidJson = (data: string): boolean => {
  try {
    JSON.parse(data);
    return true;
  } catch {
    return false;
  }
};

const readJsonFromCloud = async <T>(path: string): Promise<T> => {
  const data = await retryWithBackoff({
    operation: () => readFileFromCloud(path),
    validator: isValidJson,
  });
  return JSON.parse(data) as T;
};

const writeJsonToCloud = async (path: string, data: unknown): Promise<void> => {
  const jsonString = JSON.stringify(data, null, 2);
  await retryWithBackoff({
    operation: () => writeFileToCloud(path, jsonString),
  });
};

const findSimilarArticle = async ({
  article,
  previousArticles,
  openai,
}: {
  readonly article: Article;
  readonly previousArticles: readonly Article[];
  readonly openai: OpenAI;
}): Promise<SimilarityAnalysis> => {
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
   Takeaways: ${prev.takeaways.join(", ")}`,
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

const generateDiff = ({
  output,
  newOutput,
}: {
  output: EnrichedArticle;
  newOutput: EnrichedArticle;
}): Diff => {
  const changed: Diff["changed"] = {};

  const primitiveFields = ["title", "summary", "category"] as const;
  for (const field of primitiveFields) {
    if (output[field] !== newOutput[field]) {
      changed[field] = {
        before: output[field],
        after: newOutput[field],
      };
    }
  }

  const { takeaways } = output;
  const { takeaways: newTakeaways } = newOutput;
  if (
    takeaways.length !== newTakeaways.length ||
    !takeaways.every((val, idx) => val === newTakeaways[idx])
  ) {
    changed.takeaways = {
      before: takeaways,
      after: newTakeaways,
    };
  }

  const {
    similarTo: { title, reason },
  } = output;
  const {
    similarTo: { title: newTitle, reason: newReason },
  } = newOutput;

  const similarToChanges: Record<
    string,
    { readonly before: unknown; readonly after: unknown }
  > = {};

  if (title !== newTitle) {
    similarToChanges.title = {
      before: title,
      after: newTitle,
    };
  }

  if (reason !== newReason) {
    similarToChanges.reason = {
      before: reason,
      after: newReason,
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

    console.log("📘 Reading enriched article...");
    const article = await readJsonFromCloud<Article>(
      "src/prismicLib/enriched-article.json",
    );

    console.log("📚 Reading previous articles...");
    const previousArticles = await readJsonFromCloud<readonly Article[]>(
      "src/prismicLib/previous-articles.json",
    );

    console.log("🤖 Analyzing similarity...");
    const similarityAnalysis = await findSimilarArticle({
      article,
      previousArticles,
      openai,
    });

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
      console.log("\n👀 Checking for existing output...");
      const existingOutput =
        await readJsonFromCloud<EnrichedArticle>("output.json");
      diff = generateDiff({
        output: existingOutput,
        newOutput: enrichedOutput,
      });
      console.log("\n🧾 Diff:");
      console.log(JSON.stringify(diff, null, 2));
    } catch {
      console.log("ℹ⏭️ No existing output, skipping diff generation.");
      console.log("\n🧾 Diff:");
      console.log(JSON.stringify(diff, null, 2));
    }

    console.log("\n💾 Writing output files to cloud in parallel...");
    await Promise.all([
      writeJsonToCloud("output.json", enrichedOutput),
      writeJsonToCloud("diff.json", diff),
    ]);

    console.log("✅ Files written successfully.");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
