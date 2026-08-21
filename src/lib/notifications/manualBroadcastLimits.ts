/**
 * Manual broadcast title/body length limits -- deliberately a plain,
 * directive-free module (no `"server-only"`/`"use server"`) so BOTH the
 * server-side engine (`engine/manualBroadcast.ts`, which validates against
 * these) and the client composer component (which disables the send
 * button / shows a live character count against the SAME numbers) import
 * one shared source of truth instead of two numbers that could drift.
 */
export const BROADCAST_TITLE_MAX_LENGTH = 80;
export const BROADCAST_BODY_MAX_LENGTH = 500;
