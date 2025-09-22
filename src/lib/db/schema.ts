import { sqliteTable, text, integer, blob, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export type ItemType = 'TEXT' | 'IMAGE' | 'FILE';

export const clipboardItems = sqliteTable(
  'ClipboardItem',
  {
    id: text('id').primaryKey(),
    type: text('type').$type<ItemType>().notNull(),
    content: text('content'),
    fileName: text('fileName'),
    fileSize: integer('fileSize'),
    // Larger value means higher priority in ordering
    sortWeight: integer('sortWeight').default(0).notNull(),
    contentType: text('contentType'),
    inlineData: blob('inlineData').$type<Buffer | null>(),
    filePath: text('filePath'),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => ({
    createdIdx: index('clipboard_created_idx').on(table.createdAt, table.id),
    sortIdx: index('clipboard_sort_idx').on(table.sortWeight, table.createdAt, table.id),
  })
);

export const shareLinks = sqliteTable(
  'ShareLink',
  {
    token: text('token').primaryKey(),
    itemId: text('itemId').notNull().references(() => clipboardItems.id, { onDelete: 'cascade' }),
    expiresAt: integer('expiresAt', { mode: 'timestamp' }),
    maxDownloads: integer('maxDownloads'),
    downloadCount: integer('downloadCount').default(0).notNull(),
    revoked: integer('revoked', { mode: 'boolean' }).default(false).notNull(),
    passwordHash: text('passwordHash'),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => ({
    itemIdx: index('share_item_idx').on(table.itemId),
    createdIdx: index('share_created_idx').on(table.createdAt),
  })
);
