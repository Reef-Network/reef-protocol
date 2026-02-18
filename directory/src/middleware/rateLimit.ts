import rateLimit from "express-rate-limit";

/** Rate limiter for registration: 60 requests per minute per IP */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many registrations. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Rate limiter for search: 60 requests per minute per IP */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many search requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Rate limiter for heartbeat: 60 requests per minute per IP */
export const heartbeatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many heartbeat requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Rate limiter for read endpoints: 120 requests per minute per IP */
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Too many requests. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
