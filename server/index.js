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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
