# react-node-llm-chatbot — Session 1: Basic Chat

A minimal React + Express app that talks to Claude. This is the foundation
we'll build on in later sessions (embeddings → semantic search → full RAG).

## Setup

### 1. Backend

```
cd server
npm install
cp .env.example .env
```

Open `.env` and paste your API keys (e.g., Anthropic, Hugging Face, or OpenAI):

```
ANTHROPIC_API_KEY=sk-ant-...
HUGGINGFACE_API_KEY=hf-...
```

Then run:

```
npm run dev
```

Server starts on http://localhost:3001

### 2. Frontend

In a new terminal:

```
cd client
npm install
npm run dev
```

Frontend starts on http://localhost:5173 — open this in your browser.

---

## What's happening under the hood

### Session 1: Basic Chat

- **Frontend**:
  - `client/src/App.jsx` — React chat UI. Keeps the full conversation in state
    and sends it to the backend on every message.
  - The `sendMessage` function sends the user's input and conversation history
    to the backend via the `/api/chat` endpoint.
- **Backend**:
  - `server/index.js` — Express route `/api/chat` that calls the Claude API.
  - Key concepts:
    1. **LLMs are stateless** — no memory between calls, so we resend the
       whole conversation each time.
    2. **Prompt engineering via system prompt** — how to set consistent
       model behavior without repeating instructions every message.

---

### Session 2: Knowledge Base (Embeddings)

- **Frontend**:
  - Users can paste text into a `textarea` and click "Add to Knowledge Base."
  - The `addDocument` function sends the text to the backend via the `/api/documents` endpoint.
  - After the backend processes the text, the `refreshDocs` function fetches the updated list of stored chunks and updates the `docs` state.
  - The stored chunks are displayed in the UI, showing the text and its unique ID.
- **Backend**:
  - The `/api/documents` endpoint:
    1. Splits the input text into smaller chunks.
    2. Generates embeddings for each chunk using an embedding model (e.g., Hugging Face or OpenAI).
    3. Stores the chunks and their embeddings in memory or a database.

---

### Session 3: Semantic Search

- **Frontend**:
  - Users can enter a search query, which is embedded and compared to the stored chunks using cosine similarity.
  - The `runSearch` function sends the query to the `/api/search` endpoint and displays the top results.
- **Backend**:
  - The `/api/search` endpoint:
    1. Embeds the search query.
    2. Computes cosine similarity between the query embedding and stored embeddings.
    3. Returns the most relevant chunks based on similarity scores.

---

## Interview talking points from this session

- "I built a chat app that calls the Claude API directly. I learned that
  LLMs don't retain memory between requests — the app itself has to manage
  conversation state and resend history."
- "I implemented a knowledge base where text is split into chunks, converted
  into embeddings, and stored. This enables semantic search over the stored
  data."
- "I used cosine similarity to compare embeddings, allowing for meaning-based
  search rather than keyword matching."
- "I can explain the tradeoff between temperature settings — lower for
  factual/consistent answers, higher for varied/creative ones."

---

## Next sessions

- **Session 2**: Add document upload, convert text into embeddings
- **Session 3**: Add semantic search over those embeddings
- **Session 4**: Combine retrieval + generation into full RAG
