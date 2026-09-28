import "server-only";

import type { LoadedConnection } from "./connections";
import type { TestResult } from "./http";
import { testEmailConnection } from "./email/send";
import { testInboxConnection } from "./inbox/channels";
import { testPaymentConnection } from "./payments/gateway";
import { testShippingConnection } from "./shipping/test";

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
    case "INBOX":
      return testInboxConnection(connection);
    case "SHIPPING":
      return testShippingConnection(connection);
    default:
      return { ok: false, error: `Testing ${connection.provider.name} isn't available yet.` };
  }
}
