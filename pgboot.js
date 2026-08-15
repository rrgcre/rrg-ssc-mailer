'use strict';
/*
 * DEPRECATED / UNUSED.
 *
 * This file was the synchronous boot-loader for the earlier "Postgres as source of
 * truth" design (an execSync child that loaded the whole DB into memory at startup).
 * That design was fragile in-container — a single slow connection at boot could make
 * the app fall back to disk — so it was replaced by the disk-first backup-replica model
 * in pgstore.js. Nothing requires this file anymore; it is kept only to avoid a dangling
 * reference in older deploys and can be removed.
 */
module.exports = {};
