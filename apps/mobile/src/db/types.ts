import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * The database handle the repositories accept.
 *
 * The app runs on expo-sqlite; the tests run the same SQL against better-sqlite3
 * in memory. Both are synchronous drivers over the same Drizzle core, so a
 * single `BaseSQLiteDatabase` covers them and the repositories stay driver-
 * agnostic. Writing this as a union of the two concrete database types instead
 * would break every query builder call, because TypeScript cannot resolve
 * method overloads across a union.
 *
 * The result type differs between drivers (`void` versus better-sqlite3's
 * `RunResult`) and nothing here inspects it, so it is deliberately unconstrained.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = BaseSQLiteDatabase<'sync', any, typeof schema>;

/** Injected so tests can advance time deliberately instead of sleeping. */
export interface Clock {
  now: () => number;
}

export const systemClock: Clock = { now: () => Date.now() };
