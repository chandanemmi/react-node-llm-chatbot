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

Open `.env` and paste your Anthropic API key (get one at console.anthropic.com):

```
ANTHROPIC_API_KEY=sk-ant-...
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

## What's happening under the hood

- `client/src/App.jsx` — React chat UI. Keeps the full conversation in state
  and sends it to the backend on every message.
- `server/index.js` — Express route `/api/chat` that calls the Claude API.
  Read the comments in this file — they explain two core concepts:
  1. **LLMs are stateless** — no memory between calls, so we resend the
     whole conversation each time.
  2. **Prompt engineering via system prompt** — how to set consistent
     model behavior without repeating instructions every message.

## Interview talking points from this session

- "I built a chat app that calls the Claude API directly. I learned that
  LLMs don't retain memory between requests — the app itself has to manage
  conversation state and resend history."
- "I used a system prompt to set consistent behavior (tone, response length)
  separately from the user's actual question — that's prompt engineering
  in practice."
- "I can explain the tradeoff between temperature settings — lower for
  factual/consistent answers, higher for varied/creative ones."

## Next sessions

- **Session 2**: Add document upload, convert text into embeddings
- **Session 3**: Add semantic search over those embeddings
- **Session 4**: Combine retrieval + generation into full RAG
