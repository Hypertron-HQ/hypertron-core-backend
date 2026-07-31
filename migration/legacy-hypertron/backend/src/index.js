/**
 * Backend orchestrator for Soroban Escrow.
 * - Payment link creation (persisted IDs)
 * - Optional: invoke Soroban contracts via RPC, webhook handling.
 */

import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PAYMENT_LINKS = new Map(); // In production: use DB

app.post("/api/payment-link", (req, res) => {
  const { amount, memo } = req.body || {};
  if (!amount) {
    return res.status(400).json({ error: "amount required" });
  }
  const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const baseUrl = process.env.APP_URL || "http://localhost:3001";
  const url = `${baseUrl}/pay/${id}?amount=${encodeURIComponent(amount)}${memo ? `&memo=${encodeURIComponent(memo)}` : ""}`;
  PAYMENT_LINKS.set(id, { amount, memo: memo || null, createdAt: new Date().toISOString() });
  res.json({ url, id });
});

app.get("/api/payment-link/:id", (req, res) => {
  const data = PAYMENT_LINKS.get(req.params.id);
  if (!data) return res.status(404).json({ error: "not found" });
  res.json(data);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Soroban Escrow backend listening on http://localhost:${PORT}`);
});
