import express from "express";
const app = express();
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.json({ message: "Hello" }));
export default app;