import express from "express";

console.log("🔥 Minimal server starting...");

const app = express();
const PORT = process.env.PORT || 4000;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
});

export default app;