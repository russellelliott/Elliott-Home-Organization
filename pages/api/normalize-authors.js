import { GoogleGenerativeAI } from "@google/generative-ai";
import { adminDb } from "../../lib/firebase-admin";

const NORMALIZE_PROMPT = `You are a data normalization assistant. You will be provided with a list of author names that may contain duplicates, inconsistent formatting, varying levels of detail, or extraneous metadata.
Your goal is to return a list of unique individuals, selecting one canonical form for each based on these rules:
1. Prioritize Completeness: If multiple versions of the same name exist, select the version that includes the most information (e.g., full middle names or middle initials over just first and last names).
2. Strip Clutter: Ignore and remove non-name details such as lifespans/years, professional roles (e.g., "Editor," "Translator"), or academic titles (e.g., "M.D.", "Ph.D.") during the comparison and in the final output.
3. Merge Variations: Treat names as a match if one is a more specific version of the other or if they differ only by formatting/punctuation. Merge these into the most complete canonical version.
4. Standardize Capitalization: Convert all output names to Title Case. Ensure names originally provided in ALL CAPS or lowercase are corrected to standard capitalization, while respecting culturally specific casing (e.g., "van," "de," "di").
5. Strict Source Adherence: Do not invent new names. Use the strings provided in the input, applying only the necessary normalization (capitalization and clutter removal) to the existing text.
Input:
[INSERT LIST HERE]
Return only a JSON object with a single field authors containing an array of the canonical names:
JSON
{
  "authors": ["Name One", "Name Two"]
}`;

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function getAuthorLists(data) {
  const lists = [];

  if (data.authors !== undefined) {
    lists.push(toStringArray(data.authors));
  }

  if (data.author !== undefined) {
    lists.push(toStringArray(data.author));
  }

  return lists.filter((list) => list.length > 0);
}

function getAuthorsForPrompt(lists) {
  return lists.flatMap((list) => list);
}

function shouldNormalizeAuthors(lists) {
  return lists.some((list) => list.length > 2 || list.some((entry) => entry.includes(",")));
}

function parseGeminiJson(text) {
  const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleanText);
}

function normalizeResultAuthors(value) {
  return toStringArray(value).map((name) => name.replace(/\s+/g, " ").trim());
}

function sameArray(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

async function normalizeAuthorsWithGemini(model, authors) {
  const inputPrompt = NORMALIZE_PROMPT.replace("[INSERT LIST HERE]", JSON.stringify(authors));
  const result = await model.generateContent(inputPrompt);
  const response = await result.response;
  const rawText = response.text();
  const parsed = parseGeminiJson(rawText);

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.authors)) {
    throw new Error("Gemini response missing authors array");
  }

  const normalized = normalizeResultAuthors(parsed.authors);
  if (normalized.length === 0) {
    throw new Error("Gemini response returned empty authors list");
  }

  return normalized;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ message: "GEMINI_API_KEY is not configured" });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

    const snapshot = await adminDb.collection("books").get();

    let checked = 0;
    let matched = 0;
    let updated = 0;
    let unchanged = 0;
    const errors = [];

    for (const doc of snapshot.docs) {
      checked += 1;
      const data = doc.data();
      const authorLists = getAuthorLists(data);
      const authors = getAuthorsForPrompt(authorLists);

      if (authors.length === 0 || !shouldNormalizeAuthors(authorLists)) {
        continue;
      }

      matched += 1;

      try {
        const cleanedAuthors = await normalizeAuthorsWithGemini(model, authors);

        if (sameArray(authors, cleanedAuthors)) {
          unchanged += 1;
          continue;
        }

        await adminDb.collection("books").doc(doc.id).update({
          authors: cleanedAuthors,
          updatedAt: new Date().toISOString()
        });

        updated += 1;
      } catch (error) {
        errors.push({
          id: doc.id,
          title: data.title || null,
          authors,
          error: String(error?.message || error)
        });
      }
    }

    return res.status(200).json({
      checked,
      matched,
      updated,
      unchanged,
      errors
    });
  } catch (error) {
    console.error("normalize-authors error", error);
    return res.status(500).json({
      message: "Server error",
      error: String(error?.message || error)
    });
  }
}