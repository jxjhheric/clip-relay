import { PrismaClient } from '@prisma/client'
import path from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const isProd = process.env.NODE_ENV === 'production'

// Provide a sensible default when DATABASE_URL is not set (SQLite under ./data/custom.db)
const defaultDbPath = path.join(process.cwd(), 'data', 'custom.db').replace(/\\/g, '/')
const defaultDbUrl = `file:${defaultDbPath}`
const effectiveDbUrl = process.env.DATABASE_URL ?? defaultDbUrl

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? [] : ['query'],
    datasources: {
      db: { url: effectiveDbUrl },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
