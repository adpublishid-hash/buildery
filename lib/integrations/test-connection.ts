import "server-only";

import type { LoadedConnection } from "./connections";
import type { TestResult } from "./http";
import { testEmailConnection } from "./email/send";
import { testPaymentConnection } from "./payments/gateway";

/**
 * Runs the provider's own "is this set up right?" check. Each category adds
 * its checks here as adapters exist for it.
 */
export async function testConnection(connection: LoadedConnection, context: { operatorEmail: string }): Promise<TestResult> {
  switch (connection.provider.category) {
    case "EMAIL":
      return testEmailConnection(connection, context.operatorEmail);
    case "PAYMENT":
      return testPaymentConnection(connection);
    default:
      return { ok: false, error: `Testing ${connection.provider.name} isn't available yet.` };
  }
}
