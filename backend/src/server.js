import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import quoteRoutes from "./routes/quote.routes.js";
import { getPriceStatus } from "./services/market.service.js";
import { getQuoteSourceStatus } from "./services/oneclick.service.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDirectory, "../../.env"), quiet: true });

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const NEAR_NETWORK = process.env.NEAR_NETWORK || "testnet";

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (
    origin &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.get("/api/health", (req, res) => {
  const quoteSource = getQuoteSourceStatus();
  const priceSource = getPriceStatus();

  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      mode: "dry-run",
      network: "not-connected",
      nearNetworkPlanned: NEAR_NETWORK,
      externalCalls: quoteSource.liveRequestsEnabled
        ? "1click-dry-quote-only"
        : priceSource.liveRequestsEnabled
          ? "public-market-data-only"
          : "disabled",
      wallet: "disabled-in-demo",
      quoteSource,
      priceSource,
    },
  });
});

app.use("/api/quote", quoteRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled API error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    message: "Unexpected API error",
  });
});

app.listen(PORT, () => {
  const quoteSource = getQuoteSourceStatus();
  const priceSource = getPriceStatus();
  const sourceDetail = quoteSource.liveRequestsEnabled
    ? quoteSource.configured
      ? "mainnet dry quotes only, configured"
      : `mainnet dry quotes only, missing ${quoteSource.missingConfiguration.join(", ")}`
    : "local dry-run engine";
  const priceDetail = priceSource.liveRequestsEnabled
    ? "Coinbase public market data, read-only"
    : priceSource.priceSource === "invalid"
      ? "invalid configuration"
      : "local reference, no external calls";

  console.log(`Phlax API (dry-run) running on http://localhost:${PORT}`);
  console.log(
    `Network: not connected (NEAR ${NEAR_NETWORK} planned) | Quote source: ${quoteSource.source} (${sourceDetail}) | Price source: ${priceSource.priceSource} (${priceDetail}) | Wallet: disabled in demo`
  );
});
