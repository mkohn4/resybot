import { PrismaClient } from "@prisma/client"
import { PrismaNeonHttp } from "@prisma/adapter-neon"

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaNeonHttp(url, {} as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new PrismaClient({ adapter } as any)
}

export const prisma: PrismaClient =
  global.prismaInstance ?? (global.prismaInstance = createPrismaClient())
