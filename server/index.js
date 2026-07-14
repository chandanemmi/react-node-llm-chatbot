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

// ---------------------------------------------------------------------------
// SESSION 2 CONCEPT: Embeddings
// An embedding model turns text into a list of numbers (a vector) that
// captures MEANING, not just words. Similar meanings -> similar vectors.
// We use this to later find relevant chunks of a document for a question
// (semantic search), without needing exact keyword matches.
//
// In-memory "vector store": just an array. In a real app this would be a
// vector database (Pinecone, Weaviate, pgvector, etc.), but the underlying
// idea is identical — store text + its embedding, then compare vectors later.
// ---------------------------------------------------------------------------
let documentStore = []; // [{ id, text, embedding }]

// Splits a long document into smaller chunks. Why chunk at all? Two reasons:
// 1) Embedding models have an input size limit.
// 2) Smaller chunks give more precise retrieval later — if you embed a whole
//    10-page document as ONE vector, you lose the ability to retrieve just
//    the one paragraph that actually answers the question.
function chunkText(text, chunkSize = 500) {
  const sentences = text.split(/(?<=[.?!])\s+/); // split on sentence boundaries
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
  // featureExtraction is HF's embeddings task. This model outputs a
  // 384-number vector per input text.
  const result = await hf.featureExtraction({
    model: "sentence-transformers/all-MiniLM-L6-v2",
    inputs: text,
  });
  return result;
}

// ---------------------------------------------------------------------------
// CONCEPT 1: LLMs have NO memory between API calls.
// Every call is stateless — the model only knows what's in THIS request's
// `messages` array. That's why we send the full conversation history every
// time, not just the newest message.
// ---------------------------------------------------------------------------

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

    res.json({
      reply,
      usage: response.usage,
    });
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

// -----------------------------------------------------------------------
// Test endpoint: send raw text, get back its embedding vector.
// -----------------------------------------------------------------------
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

// -----------------------------------------------------------------------
// Add a document to our in-memory knowledge base: chunk it, embed each
// chunk, store it. This is step 1 of RAG (indexing). Step 2 (retrieval)
// comes in Session 3.
// -----------------------------------------------------------------------
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
