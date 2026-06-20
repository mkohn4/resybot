import { PrismaClient } from "@prisma/client"

declare global {
  // eslint-disable-next-line no-var
  var prismaInstance: PrismaClient | undefined
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    // During Next.js build with no DB, return a proxy that throws on use
    return new Proxy({} as PrismaClient, {
      get() {
        throw new Error("DATABASE_URL is not set")
      },
    })
  }
  return new PrismaClient()
}

export const prisma: PrismaClient =
  global.prismaInstance ?? (global.prismaInstance = createPrismaClient() as PrismaClient)
