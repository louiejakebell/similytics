# 🧠 Prismic AI Homework

## 🎯 Objective

You are given an already enriched article. Your job is to:

- Compare it to a list of previously enriched articles
- Find the most semantically similar one
- Explain the match
- Generate a `output.json` including this analysis
- Generate a `diff.json` comparing the new output with a previous one

---

## ✅ Tasks

1. **Read the provided enriched article** in `enriched-article.json` from the "cloud".
2. **Find the most semantically similar article**:
   - Read the existing articles in `previous-articles.json` from the "cloud"
   - Ask OpenAI with a prompt to analyze and compare the articles to find the most semantically similar one
   - Have OpenAI provide both the title of the closest match and explain the reasoning for the match
   - If none match well, set `"title": null` and have OpenAI explain why
3. **Generate the final enriched output**:
   - Create a complete article JSON structure including the `similarTo` field
   - Print a `✅ Output:` block to the console
4. **If an existing output is present**, compare it to your newly generated one:
   - Read the existing `output.json` from the "cloud"
   - Identify all differences for all fields
   - Print a `🧾 Diff:` block in the console
5. **Write your result files**:
   - Write the enriched article to `output.json` to the "cloud"
   - Write the diff result to `diff.json` to the "cloud"
   - These two writes should happen in **parallel**

---

## 📦 Provided

- `src/main.ts`: your entry point
- `.env`: prefilled with a working `OPENAI_API_KEY` so you can start right away
- `src/prismicLib/enriched-article.json`: a pre-enriched article to work from
- `src/prismicLib/previous-articles.json`: a list of previously enriched reference articles
- `src/prismicLib/readFileFromCloud.ts`: reads a file from the "cloud"
- `src/prismicLib/writeFileToCloud.ts`: writes a file to the "cloud"

> 🔒 All files in the `prismicLib` folder are read-only. You must not modify them.
> 🧱 You must use the provided read/write cloud utilities.

---

## 📤 Output requirement

After building the final enriched structure with the `similarTo` property:

- Print the result to the console
- Write the full output to a file named `output.json`

This is an example structure of the `output.json` file content:

```json
{
  "title": "Designing Dark Mode UX for Multibrand Platforms",
  "summary": "This article explores the challenges of implementing consistent dark mode themes across multiple branded products. It covers token-based design systems, accessibility contrasts, and tooling for managing visual consistency.",
  "category": "Design",
  "takeaways": [
    "Use design tokens to centralize theming logic",
    "Test contrast and legibility across brand palettes",
    "Document design rules for consistency in multi-brand UI"
  ],
  "similarTo": {
    "title": "Improving Accessibility with Semantic HTML",
    "reason": "Both articles focus on inclusive UI design decisions and the importance of accessibility in modern product development."
  }
}
```

If no article matches closely:

```json
{
  "title": "Designing Dark Mode UX for Multibrand Platforms",
  "summary": "This article explores the challenges of implementing consistent dark mode themes across multiple branded products. It covers token-based design systems, accessibility contrasts, and tooling for managing visual consistency.",
  "category": "Design",
  "takeaways": [
    "Use design tokens to centralize theming logic",
    "Test contrast and legibility across brand palettes",
    "Document design rules for consistency in multi-brand UI"
  ],
  "similarTo": {
    "title": null,
    "reason": "The article focuses on cross-brand UX theming, which is not covered by any of the examples."
  }
}
```

---

## 🧾 Diff requirement

If a previous output file named `output.json` exists:

- Compare it to your new output
- Compare all fields of `output.json`
- Print a `🧾 Diff:` block to the console showing changed fields
- Unchanged fields can be skipped
- Write the full diff result to a file named `diff.json`

This is an example structure of the `diff.json` file content:

```json
{
  "changed": {
    "title": {
      "before": "Old Title",
      "after": "New Title"
    },
    "summary": {
      "before": "Old summary.",
      "after": "New summary."
    }
  }
}
```

If the outputs are identical, your `diff.json` file should look like this:

```json
{
  "changed": {}
}
```

---

## 🔧 Required stack

- Language: **TypeScript**
- GenAI Provider: **OpenAI**
- Libraries: Additional libraries allowed

---

## 💻 Run

```bash
npm run dev
```

---

## 🧪 Evaluation criteria

| Category             | What we're looking for                                        |
| -------------------- | ------------------------------------------------------------- |
| Comparison Reasoning | Semantic reasoning for match/no match is sound and contextual |
| Prompting            | Effective prompt engineering and output formatting            |
| Diff Logic           | Clean implementation of diffing against a previous output     |
| Structuring          | Output format is respected                                    |
| Data Handling        | Thoughtful approach to type safety                            |
| Error Management     | Proper handling of potential failures                         |
| Code Quality         | Clean, readable, and well-structured TypeScript               |
| Runability           | Script runs smoothly, no setup blockers                       |

> Note: Your homework will be reviewed manually by a Prismic engineer.

---

## 📬 What to submit

Upon completion of the assignment, compress your project into a `.zip` file, include your first and last name in the folder name, and send it back to us by email for evaluation.

Your submission should include:

- All the code
- The `output.json` file of your last run
- The `diff.json` file of your last run

> ⚠️ Please do not share your work or this template publicly.
> This ensures every candidate has an equal opportunity to showcase their skills fairly.
