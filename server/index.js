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
// SESSION 3 CONCEPT: Semantic search via cosine similarity.
// Two embedding vectors that point in a similar "direction" in space
// represent similar MEANING. Cosine similarity measures the angle between
// two vectors, ignoring their length — the result is a number from -1 to 1:
//   1   = identical meaning
//   0   = unrelated
//   -1  = opposite meaning (rare in practice for text)
// This is how we find "which stored chunk best answers this question?"
// without needing any matching keywords.
// ---------------------------------------------------------------------------
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

// Given a query, embed it and rank every stored chunk by similarity.
// Returns the top `topK` matches with their scores.
async function searchDocuments(query, topK = 3) {
  const queryEmbedding = await embedText(query);

  const scored = documentStore.map((doc) => ({
    id: doc.id,
    text: doc.text,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  scored.sort((a, b) => b.score - a.score); // highest similarity first
  return scored.slice(0, topK);
}

// ---------------------------------------------------------------------------
// CONCEPT 1: LLMs have NO memory between API calls.
// Every call is stateless — the model only knows what's in THIS request's
// `messages` array. That's why we send the full conversation history every
// time, not just the newest message. (This matters a lot later for RAG:
// the "memory" of your app has to be built by YOU, not the model.)
// ---------------------------------------------------------------------------

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    // messages looks like: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }, ...]

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // -----------------------------------------------------------------------
    // CONCEPT 2: Prompt engineering via the SYSTEM prompt.
    // The system prompt sets persistent behavior/role for the model, separate
    // from the conversation. This is one of the simplest, most powerful forms
    // of prompt engineering: instead of repeating instructions in every user
    // message, you set them once here.
    // -----------------------------------------------------------------------
    const systemPrompt = `You are a helpful, concise tutor assistant.
Answer clearly in plain language. Keep responses under 150 words unless asked for more detail.`;

    const response = await hf.chatCompletion({
      // Different providers host different models — hf-inference doesn't
      // host this one, but others (Together, Novita, Fireworks, etc.) do.
      // Leaving provider unset lets the SDK auto-pick one that actually
      // serves this model for your account.
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
    // The HF SDK wraps errors in specific classes that carry the real
    // request/response details — the generic err.message hides this.
    // Checking instanceof lets us print what actually went wrong.
    if (err instanceof InferenceClientProviderApiError) {
      console.error("Provider API Error:", err.message);
      console.error("Request:", err.request);
      console.error("Response:", err.response);
    } else if (err instanceof InferenceClientHubApiError) {
      console.error("Hub API Error:", err.message);
      console.error("Request:", err.request);
      console.error("Response:", err.response);
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
// Test endpoint: send raw text, get back its embedding vector. Useful to
// literally SEE what an embedding looks like — just an array of numbers.
// -----------------------------------------------------------------------
app.post("/api/embed", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    const embedding = await embedText(text);
    res.json({
      text,
      dimensions: embedding.length,
      // Only send back a preview — a 384-number array is a lot to look at.
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

// List everything currently in the knowledge base (without the full vectors
// — those are huge and not useful to look at directly).
app.get("/api/documents", (req, res) => {
  res.json({
    count: documentStore.length,
    documents: documentStore.map((d) => ({ id: d.id, text: d.text })),
  });
});

// -----------------------------------------------------------------------
// SESSION 3: Semantic search endpoint.
// Takes a natural-language query, embeds it, and returns the most
// similar stored chunks — WITHOUT requiring any matching keywords.
// This is retrieval — the "R" in RAG. Generation (feeding these results
// to the LLM to compose an answer) comes in Session 4.
// -----------------------------------------------------------------------
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

// -----------------------------------------------------------------------
// SESSION 4: Full RAG — Retrieval-Augmented Generation.
// This is the pattern that ties everything together:
//   1. RETRIEVE: embed the question, find the most relevant stored chunks
//      (exactly what Session 3 did).
//   2. AUGMENT: insert those chunks into the prompt as "context".
//   3. GENERATE: ask the LLM to answer USING ONLY that context.
//
// Why "using only that context" matters: without this constraint, the LLM
// might just answer from its own training data instead of YOUR documents —
// which defeats the purpose. This is also where hallucination mitigation
// happens: if the context doesn't contain the answer, we tell the model to
// say so instead of making something up.
// -----------------------------------------------------------------------
app.post("/api/rag", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query is required" });

    if (documentStore.length === 0) {
      return res.json({
        query,
        answer: "The knowledge base is empty — add some documents first.",
        sources: [],
      });
    }

    // Step 1: RETRIEVE
    const topChunks = await searchDocuments(query, 3);

    // Step 2: AUGMENT — build the context block from retrieved chunks
    const context = topChunks
      .map((c, i) => `[${i + 1}] ${c.text}`)
      .join("\n\n");

    const ragSystemPrompt = `You are a helpful assistant that answers questions using ONLY the provided context below. 
If the answer isn't contained in the context, say "I don't have enough information to answer that" — do not make up an answer.
Cite which numbered source(s) you used, like [1] or [2].
Context:
${context}`;

    // Step 3: GENERATE
    const response = await hf.chatCompletion({
      model: "Qwen/Qwen2.5-7B-Instruct",
      messages: [
        { role: "system", content: ragSystemPrompt },
        { role: "user", content: query },
      ],
      max_tokens: 400,
      temperature: 0.3, // lower temperature — we want grounded, factual answers here, not creative ones
    });

    const answer = response.choices?.[0]?.message?.content ?? "";

    res.json({
      query,
      answer,
      sources: topChunks.map((c) => ({
        id: c.id,
        text: c.text,
        score: c.score,
      })),
    });
  } catch (err) {
    console.error("RAG error:", err.message);
    res.status(500).json({ error: "Failed to generate RAG answer." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
