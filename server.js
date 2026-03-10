import express from "express";
const app = express();
app.get("/api/health", (req, res) => res.json({ ok: true }));
export default app;
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`));