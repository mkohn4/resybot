import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

declare global {
  // eslint-disable-next-line no-var
  var prismaInstance: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) {
    return new Proxy({} as PrismaClient, {
      get() {
        throw new Error("DATABASE_URL is not set")
      },
    })
  }
  // Standard Postgres (Supabase) via the node-postgres driver adapter. Runtime
  // uses the Supavisor pooler URL (IPv4, port 6543) — see .env.local.
  const adapter = new PrismaPg({ connectionString: url })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any)
}

export const prisma: PrismaClient =
  global.prismaInstance ?? (global.prismaInstance = createPrismaClient())
