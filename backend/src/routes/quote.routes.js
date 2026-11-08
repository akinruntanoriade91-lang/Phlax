import { Router } from "express";
import { createMockQuote, getQuoteMeta } from "../services/quote.service.js";
import {
  createOneClickDryQuote,
  getQuoteSourceStatus,
} from "../services/oneclick.service.js";

const router = Router();
const FORBIDDEN_CLIENT_KEYS = new Set([
  "dry",
  "dryrun",
  "depositaddress",
  "depositsubmit",
  "depositmemo",
  "chaindepositaddresses",
  "timewheninactive",
]);

function findForbiddenClientKey(value, seen = new Set()) {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;

  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_CLIENT_KEYS.has(key.toLowerCase())) {
      return key;
    }

    const nested = findForbiddenClientKey(child, seen);

    if (nested) return nested;
  }

  return null;
}

router.get("/meta", (req, res) => {
  res.status(200).json({
    success: true,
    data: getQuoteMeta(),
  });
});

router.post("/", async (req, res) => {
  try {
    const forbiddenKey = findForbiddenClientKey(req.body);

    if (forbiddenKey) {
      return res.status(400).json({
        success: false,
        message: `${forbiddenKey} is not accepted from the client. Dry mode is fixed on the server, and deposit addresses are not supported.`,
      });
    }

    const quoteSource = getQuoteSourceStatus();

    if (quoteSource.invalidSource) {
      const error = new Error(
        "Invalid QUOTE_SOURCE configuration. Use mock (default) or 1click-dry. No 1Click request was made."
      );
      error.statusCode = 503;
      error.code = "INVALID_QUOTE_SOURCE";
      throw error;
    }

    const quote =
      quoteSource.source === "1click-dry"
        ? await createOneClickDryQuote(req.body)
        : createMockQuote(req.body);

    return res.status(201).json({
      success: true,
      data: quote,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500
        ? "Unable to create a quote"
        : error.message || "Unable to create a quote";

    if (statusCode === 500) {
      console.error("Quote error:", error.message);
    }

    return res.status(statusCode).json({
      success: false,
      message,
      code: error.code,
      errors: error.errors,
    });
  }
});

export default router;
