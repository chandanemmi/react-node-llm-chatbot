import { useState, useRef, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function App() {
  const [activeTab, setActiveTab] = useState("session1");

  // --- Session 1: chat state ---
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // --- Session 2: knowledge base state ---
  const [docText, setDocText] = useState("");
  const [docs, setDocs] = useState([]);
  const [docLoading, setDocLoading] = useState(false);

  // --- Session 3: semantic search state ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");

  // Session 3 tab is locked until at least one document has been added in
  // Session 2 — there's nothing meaningful to search otherwise.
  const session3Unlocked = docs.length > 0;
  const session4Unlocked = docs.length > 0;

  // --- Session 4: RAG state ---
  const [ragQuery, setRagQuery] = useState("");
  const [ragAnswer, setRagAnswer] = useState("");
  const [ragSources, setRagSources] = useState([]);
  const [ragLoading, setRagLoading] = useState(false);

  async function runRag() {
    if (!ragQuery.trim() || ragLoading) return;
    setRagLoading(true);
    setRagAnswer("");
    setRagSources([]);
    try {
      const res = await fetch(`${API_BASE}/api/rag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ragQuery }),
      });
      const data = await res.json();
      if (data.error) {
        setRagAnswer(`Error: ${data.error}`);
      } else {
        setRagAnswer(data.answer);
        setRagSources(data.sources || []);
      }
    } catch (err) {
      setRagAnswer("Failed to reach server.");
    } finally {
      setRagLoading(false);
    }
  }

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

  async function runSearch() {
    if (!searchQuery.trim() || searchLoading) return;
    setSearchLoading(true);
    setSearchMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, topK: 3 }),
      });
      const data = await res.json();
      if (data.error) {
        setSearchMessage(data.error);
        setSearchResults([]);
      } else {
        setSearchResults(data.results || []);
        setSearchMessage(data.message || "");
      }
    } catch (err) {
      setSearchMessage("Failed to reach server.");
    } finally {
      setSearchLoading(false);
    }
  }

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
        setMessages([...newMessages, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.reply }]);
      }
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: "Failed to reach server." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") sendMessage();
  }

  function selectTab(tab) {
    if ((tab === "session3" && !session3Unlocked) || (tab === "session4" && !session4Unlocked)) return; // locked
    setActiveTab(tab);
  }

  const tabs = [
    { id: "session1", label: "Session 1: Chat" },
    { id: "session2", label: "Session 2: Knowledge Base" },
    { id: "session3", label: "Session 3: Semantic Search", locked: !session3Unlocked },
    { id: "session4", label: "Session 4: Full RAG", locked: !session4Unlocked },
  ];

  return (
    <div style={{ maxWidth: 640, margin: "40px auto" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            disabled={tab.locked}
            title={tab.locked ? "Add a document in Session 2 first" : ""}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 8,
              border: "none",
              cursor: tab.locked ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: 13,
              background: activeTab === tab.id ? "#1d9e75" : tab.locked ? "#eee" : "#f0f0f0",
              color: activeTab === tab.id ? "white" : tab.locked ? "#aaa" : "#333",
            }}
          >
            {tab.label}
            {tab.locked ? " 🔒" : ""}
          </button>
        ))}
      </div>

      {activeTab === "session1" && (
        <div className="chat-container" style={{ margin: 0 }}>
          <div className="chat-header">Session 1: Basic Chat</div>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div style={{ color: "#999", fontSize: 14 }}>
                Ask anything. This is a stateless chat calling an LLM — no documents, no memory beyond this conversation.
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
      )}

      {activeTab === "session2" && (
        <div className="chat-container" style={{ margin: 0, height: "auto" }}>
          <div className="chat-header">Session 2: Knowledge Base (Embeddings)</div>
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 14, color: "#666", marginTop: 0 }}>
              Paste any text below. It gets split into chunks, and each chunk is
              converted into an embedding vector and stored. This is the
              "indexing" half of RAG. Add at least one document to unlock
              Session 3.
            </p>
            <textarea
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
              placeholder="Paste a paragraph or two of text here..."
              rows={5}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd", fontFamily: "inherit" }}
            />
            <button
              onClick={addDocument}
              disabled={docLoading}
              style={{ marginTop: 10, padding: "10px 18px", background: "#1d9e75", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
            >
              {docLoading ? "Embedding..." : "Add to Knowledge Base"}
            </button>

            <h4 style={{ marginTop: 24, marginBottom: 8 }}>Stored chunks ({docs.length})</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 200, overflowY: "auto" }}>
              {docs.map((d) => (
                <div key={d.id} style={{ background: "#f7f7f7", padding: 10, borderRadius: 8, fontSize: 13 }}>
                  <strong>#{d.id}</strong> {d.text}
                </div>
              ))}
              {docs.length === 0 && <div style={{ color: "#999", fontSize: 13 }}>No chunks yet.</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === "session3" && session3Unlocked && (
        <div className="chat-container" style={{ margin: 0, height: "auto" }}>
          <div className="chat-header">Session 3: Semantic Search</div>
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 14, color: "#666", marginTop: 0 }}>
              Ask a question below. It gets embedded the same way as your stored
              chunks, then compared using cosine similarity — no matching
              keywords required, just similar meaning.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Ask something related to what you added above..."
                style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
              />
              <button
                onClick={runSearch}
                disabled={searchLoading}
                style={{ padding: "10px 18px", background: "#1d9e75", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </div>

            {searchMessage && <div style={{ marginTop: 12, color: "#999", fontSize: 13 }}>{searchMessage}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
              {searchResults.map((r) => (
                <div key={r.id} style={{ background: "#f7f7f7", padding: 10, borderRadius: 8, fontSize: 13 }}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>#{r.id}</strong>{" "}
                    <span style={{ color: "#1d9e75", fontWeight: 600 }}>
                      similarity: {r.score.toFixed(3)}
                    </span>
                  </div>
                  {r.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "session4" && session4Unlocked && (
        <div className="chat-container" style={{ margin: 0, height: "auto" }}>
          <div className="chat-header">Session 4: Full RAG</div>
          <div style={{ padding: 20 }}>
            <p style={{ fontSize: 14, color: "#666", marginTop: 0 }}>
              This combines Sessions 2 and 3: your question is embedded,
              matched against stored chunks, and the top matches are given
              to the LLM as context so it can compose a real answer — instead
              of just showing raw chunks.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runRag()}
                placeholder="Ask a question about what you added..."
                style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
              />
              <button
                onClick={runRag}
                disabled={ragLoading}
                style={{ padding: "10px 18px", background: "#1d9e75", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                {ragLoading ? "Thinking..." : "Ask"}
              </button>
            </div>

            {ragAnswer && (
              <div style={{ marginTop: 16, padding: 14, background: "#eefaf5", borderRadius: 8, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {ragAnswer}
              </div>
            )}

            {ragSources.length > 0 && (
              <>
                <h4 style={{ marginTop: 20, marginBottom: 8, fontSize: 13, color: "#666" }}>Sources used</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ragSources.map((s, i) => (
                    <div key={s.id} style={{ background: "#f7f7f7", padding: 8, borderRadius: 6, fontSize: 12, color: "#555" }}>
                      <strong>[{i + 1}] similarity: {s.score.toFixed(3)}</strong> — {s.text}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
