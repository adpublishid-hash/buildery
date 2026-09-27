ALTER TABLE "CustomerMembership" DROP CONSTRAINT IF EXISTS "CustomerMembership_planId_fkey";
ALTER TABLE "CustomerMembership" ADD CONSTRAINT "CustomerMembership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipGrant" DROP CONSTRAINT IF EXISTS "MembershipGrant_membershipId_fkey";
ALTER TABLE "MembershipGrant" ADD CONSTRAINT "MembershipGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CustomerMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipEvent" DROP CONSTRAINT IF EXISTS "MembershipEvent_membershipId_fkey";
ALTER TABLE "MembershipEvent" ADD CONSTRAINT "MembershipEvent_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CustomerMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
