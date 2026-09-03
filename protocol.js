/**
 * Compatibility re-export. Canonical ESM lives in protocol/index.js.
 * Radio loads radio/protocol.js (IIFE). The shipped MOC bundle inlined protocol.
 */
export * from "./protocol/index.js";
