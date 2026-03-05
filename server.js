export default function handler(req, res) {
  console.log("✅ Minimal function called for:", req.url);
  res.status(200).json({ success: true, url: req.url });
}