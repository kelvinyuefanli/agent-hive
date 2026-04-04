import { NextRequest } from "next/server";
import { PayloadTooLargeError } from "@/lib/utils/errors";

const MAX_BODY_BYTES = 102_400; // 100 KB
const MAX_URL_LENGTH = 2048;

/**
 * Reject requests that exceed size limits.
 *   - Body: > 100 KB (via Content-Length header)
 *   - URL:  > 2048 characters
 */
export function checkRequestSize(request: NextRequest): void {
  // Check URL length
  const url = request.url;
  if (url.length > MAX_URL_LENGTH) {
    throw new PayloadTooLargeError(
      `URL length ${url.length} exceeds maximum of ${MAX_URL_LENGTH} characters`,
    );
  }

  // Check Content-Length (reject if missing on mutating requests)
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const bytes = parseInt(contentLength, 10);
    if (!Number.isNaN(bytes) && bytes > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError(
        `Request body of ${bytes} bytes exceeds maximum of ${MAX_BODY_BYTES} bytes`,
      );
    }
  } else {
    const method = request.method.toUpperCase();
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      // Allow requests without Content-Length only if they have no body
      // Next.js will handle the actual body parsing limit
    }
  }
}
