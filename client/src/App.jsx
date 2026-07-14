import { useState, useRef, useEffect } from "react";

// In dev, Vite's proxy forwards "/api" to localhost:3001 (see vite.config.js).
// In production, there's no such proxy — we need the real deployed backend
// URL, injected at build time via an environment variable.
const API_BASE = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // --- Session 2 additions: knowledge base state ---
  const [docText, setDocText] = useState("");
  const [docs, setDocs] = useState([]);
  const [docLoading, setDocLoading] = useState(false);

  async function refreshDocs() {
    const res = await fetch(`${API_BASE}/api/documents`);
    const data = await res.json();
    setDocs(data.documents || []);
  }

  useEffect(() => {
    refreshDocs();
  }, []);

  async function addDocument() {
    if (!docText.trim() || docLoading) return;
    setDocLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: docText }),
      });
      const data = await res.json();
      if (!data.error) {
        setDocText("");
        await refreshDocs();
      }
    } finally {
      setDocLoading(false);
    }
  }
  // --- end Session 2 additions ---

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
      } else {
        setMessages([
          ...newMessages,
          { role: "assistant", content: data.reply },
        ]);
      }
    } catch (err) {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Failed to reach server." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") sendMessage();
  }

  return (
    <>
      <div className="chat-container">
        <div className="chat-header">LLM Tutor App — Session 1: Basic Chat</div>
        <div className="chat-messages">
          {messages.length === 0 && (
            <div style={{ color: "#999", fontSize: 14 }}>
              Ask anything. This is a stateless chat calling an LLM — no
              documents, no memory beyond this conversation.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && <div className="message assistant">Thinking...</div>}
          <div ref={bottomRef} />
        </div>
        <div className="chat-input">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading}>
            Send
          </button>
        </div>
      </div>

      <div className="chat-container" style={{ marginTop: 20, height: "auto" }}>
        <div className="chat-header">
          Session 2: Knowledge Base (Embeddings)
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 14, color: "#666", marginTop: 0 }}>
            Paste any text below. It gets split into chunks, and each chunk is
            converted into an embedding vector and stored. This is the
            "indexing" half of RAG — retrieval comes in Session 3.
          </p>
          <textarea
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            placeholder="Paste a paragraph or two of text here..."
            rows={5}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #ddd",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={addDocument}
            disabled={docLoading}
            style={{
              marginTop: 10,
              padding: "10px 18px",
              background: "#1d9e75",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {docLoading ? "Embedding..." : "Add to Knowledge Base"}
          </button>

          <h4 style={{ marginTop: 24, marginBottom: 8 }}>
            Stored chunks ({docs.length})
          </h4>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {docs.map((d) => (
              <div
                key={d.id}
                style={{
                  background: "#f7f7f7",
                  padding: 10,
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <strong>#{d.id}</strong> {d.text}
              </div>
            ))}
            {docs.length === 0 && (
              <div style={{ color: "#999", fontSize: 13 }}>No chunks yet.</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
