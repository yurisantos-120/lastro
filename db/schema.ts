import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  color: text('color').notNull(),
  scope: text('scope').notNull().default('general'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const information = sqliteTable(
  'information',
  {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    categoryId: integer('category_id').notNull().references(() => categories.id),
    responsible: text('responsible').notNull(),
    validation: text('validation').notNull(),
    contact: text('contact').notNull(),
    notes: text('notes').notNull(),
    kind: text('kind').notNull().default('general'),
    detailsJson: text('details_json').notNull().default('{}'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_information_category_id').on(table.categoryId),
    index('idx_information_title').on(table.title),
  ],
);
