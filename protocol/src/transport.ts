/** XMTP transport: encode/decode A2A JSON-RPC messages */

/** Encode an A2A JSON-RPC message to a string for XMTP transport */
export function encodeA2AMessage(msg: Record<string, unknown>): string {
  return JSON.stringify(msg);
}

/** Decode a raw string into a JSON-RPC object. Returns null if not valid JSON-RPC 2.0. */
export function decodeA2AMessage(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.jsonrpc !== "2.0"
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Type guard: is this a JSON-RPC request (has method)? */
export function isA2ARequest(
  msg: Record<string, unknown>,
): msg is Record<string, unknown> & { method: string } {
  return typeof msg.method === "string";
}

/** Type guard: is this a JSON-RPC response (has result or error)? */
export function isA2AResponse(
  msg: Record<string, unknown>,
): msg is Record<string, unknown> & { result?: unknown; error?: unknown } {
  return "result" in msg || "error" in msg;
}
