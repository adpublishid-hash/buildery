import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/zod";
import { rateLimitShared } from "@/lib/rate-limit";
import { resolveSystemRole } from "@/lib/super-admin";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const googleAuthEnabled = Boolean(googleClientId && googleClientSecret);

export const authOptions: NextAuthOptions = {
  // Cast bridges the @auth/core Adapter type to next-auth v4's. The
  // adapter is inert here anyway — JWT sessions + a credentials provider
  // don't touch it — but it's kept for future OAuth providers.
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(googleAuthEnabled
      ? [
          GoogleProvider({
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: {
                prompt: "select_account",
                access_type: "offline",
                response_type: "code",
              },
            },
            profile(profile) {
              return {
                id: profile.sub,
                name: profile.name,
                email: profile.email,
                image: profile.picture,
                role: "CUSTOMER" as Role,
                emailVerified: profile.email_verified ? new Date() : null,
              };
            },
          }),
        ]
      : []),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { password } = parsed.data;
        const email = parsed.data.email.toLowerCase().trim();

        // Throttle credential checks per account — 8 attempts / 5 minutes.
        const limit = await rateLimitShared(
          `login:${email.toLowerCase()}`,
          8,
          5 * 60 * 1000
        );
        if (!limit.ok) {
          throw new Error("Too many login attempts. Try again shortly.");
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || user.deletedAt || !user.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: resolveSystemRole(user.email, user.role),
          emailVerified: user.emailVerified,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (user.email) {
        const existing = await prisma.user.findUnique({ where: { email: user.email }, select: { deletedAt: true } });
        if (existing?.deletedAt) return false;
      }
      if (
        account?.provider === "google" &&
        user.email &&
        (profile as { email_verified?: boolean } | undefined)?.email_verified
      ) {
        await prisma.user.updateMany({
          where: { email: user.email },
          data: { emailVerified: new Date() },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = resolveSystemRole(
          (user as { email?: string | null }).email,
          (user as { role: Role }).role
        );
        token.emailVerified =
          (user as { emailVerified?: Date | null }).emailVerified ?? null;
      }
      // Refresh on every authenticated server request so quarantined accounts
      // lose access even when they still hold a JWT cookie.
      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true, role: true, emailVerified: true, deletedAt: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = resolveSystemRole(token.email, dbUser.role);
          token.emailVerified = dbUser.emailVerified;
          token.disabled = Boolean(dbUser.deletedAt);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.disabled = Boolean(token.disabled);
      }
      return session;
    },
  },
};

export function auth() {
  return getServerSession(authOptions);
}
