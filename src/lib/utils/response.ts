import { NextResponse } from "next/server";
import { AppError } from "./errors";

export interface ResponseMeta {
  trust_level?: string;
  freshness?: number;
  suggested_contributions?: string[];
  welcome?: boolean;
  graph_stats?: Record<string, unknown>;
}

/**
 * Wrap successful data in a standard response envelope.
 */
export function successResponse<T>(data: T, meta?: ResponseMeta): NextResponse {
  return NextResponse.json({ data, meta });
}

/**
 * Convert an AppError into a properly-statused JSON response.
 */
export function errorResponse(error: AppError): NextResponse {
  return NextResponse.json(error.toJSON(), { status: error.status });
}
