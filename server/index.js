import {
  InferenceClient,
  InferenceClientProviderApiError,
  InferenceClientHubApiError,
} from "@huggingface/inference";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);

let documentStore = []; // [{ id, text, embedding }]

function chunkText(text, chunkSize = 500) {
  const sentences = text.split(/(?<=[.?!])\s+/);
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence + " ";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function embedText(text) {
  const result = await hf.featureExtraction({
    model: "sentence-transformers/all-MiniLM-L6-v2",
    inputs: text,
  });
  return result;
}

// SESSION 3 CONCEPT: Semantic search via cosine similarity.
// Measures the angle between two vectors: 1 = identical meaning,
// 0 = unrelated, -1 = opposite. This is how we find which stored chunk
// best matches a question, without needing matching keywords.
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function searchDocuments(query, topK = 3) {
  const queryEmbedding = await embedText(query);
  const scored = documentStore.map((doc) => ({
    id: doc.id,
    text: doc.text,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const systemPrompt = `You are a helpful, concise tutor assistant.
Answer clearly in plain language. Keep responses under 150 words unless asked for more detail.`;

    const response = await hf.chatCompletion({
      model: "Qwen/Qwen2.5-7B-Instruct",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = response.choices?.[0]?.message?.content ?? "";
    res.json({ reply, usage: response.usage });
  } catch (err) {
    if (err instanceof InferenceClientProviderApiError) {
      console.error("Provider API Error:", err.message);
    } else if (err instanceof InferenceClientHubApiError) {
      console.error("Hub API Error:", err.message);
    } else {
      console.error("Unexpected error:", err);
    }
    res
      .status(500)
      .json({ error: "Something went wrong calling the Hugging Face API." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/embed", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    const embedding = await embedText(text);
    res.json({
      text,
      dimensions: embedding.length,
      preview: embedding.slice(0, 8),
    });
  } catch (err) {
    console.error("Embedding error:", err.message);
    res.status(500).json({ error: "Failed to generate embedding." });
  }
});

app.post("/api/documents", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    const chunks = chunkText(text);
    const added = [];

    for (const chunk of chunks) {
      const embedding = await embedText(chunk);
      const doc = { id: documentStore.length, text: chunk, embedding };
      documentStore.push(doc);
      added.push({ id: doc.id, text: chunk, dimensions: embedding.length });
    }

    res.json({ message: `Added ${chunks.length} chunk(s).`, chunks: added });
  } catch (err) {
    console.error("Document add error:", err.message);
    res.status(500).json({ error: "Failed to add document." });
  }
});

app.get("/api/documents", (req, res) => {
  res.json({
    count: documentStore.length,
    documents: documentStore.map((d) => ({ id: d.id, text: d.text })),
  });
});

app.post("/api/search", async (req, res) => {
  try {
    const { query, topK } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });

    if (documentStore.length === 0) {
      return res.json({
        query,
        results: [],
        message: "Knowledge base is empty — add some documents first.",
      });
    }

    const results = await searchDocuments(query, topK || 3);
    res.json({ query, results });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: "Failed to perform search." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
