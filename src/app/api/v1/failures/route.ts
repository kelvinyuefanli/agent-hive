import { NextResponse } from "next/server";
import { withSafety } from "@/lib/safety/middleware";
import { createFailureSchema, type CreateFailureInput } from "@/lib/schemas/failures";
import { db } from "@/lib/db";
import { failureReports } from "@/lib/db/schema";
import { SecretDetectedError } from "@/lib/utils/errors";
import { scanForSecrets } from "@/lib/safety/secret-scanner";

export const POST = withSafety<CreateFailureInput>({
  schema: createFailureSchema,
  requireAuth: true,
})(async ({ body, agent }) => {
  // Secret scan the message field
  const scanResult = scanForSecrets(body.message);
  if (scanResult.found) {
    throw new SecretDetectedError(
      `Failure report rejected: secret material detected in message (${scanResult.patterns.join(", ")})`,
    );
  }

  const [failure] = await db
    .insert(failureReports)
    .values({
      agentId: agent!.id,
      errorType: body.error_type,
      service: body.service,
      message: body.message,
      environment: body.environment ?? null,
    })
    .returning();

  return NextResponse.json({ data: failure }, { status: 201 });
});
