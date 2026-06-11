import crypto from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || join(__dirname, "..", ".data");
const dataPath = join(dataDir, "custom-offers.json");

/** @type {{ offers: CustomOffer[], clicks: CustomClick[], conversions: CustomConversion[] }} */
let state = { offers: [], clicks: [], conversions: [] };

/**
 * @typedef {Object} CustomOffer
 * @property {string} id
 * @property {string} name
 * @property {string} offerwall
 * @property {number} reward
 * @property {string} unit
 * @property {string} country
 * @property {string} targetUrl
 * @property {string} postbackSecret
 * @property {string} externalPostbackUrl
 * @property {boolean} active
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} CustomClick
 * @property {string} id
 * @property {string} offerId
 * @property {string} userId
 * @property {string} createdAt
 * @property {string} ip
 */

/**
 * @typedef {Object} CustomConversion
 * @property {string} id
 * @property {string} offerId
 * @property {string} clickId
 * @property {string} userId
 * @property {string} txid
 * @property {number} amount
 * @property {string} createdAt
 */

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

function safeNumber(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

async function save() {
  await mkdir(dirname(dataPath), { recursive: true });
  await writeFile(dataPath, JSON.stringify(state, null, 2));
}

export async function loadCustomOfferState() {
  try {
    const parsed = JSON.parse(await readFile(dataPath, "utf8"));
    state = {
      offers: Array.isArray(parsed.offers) ? parsed.offers : [],
      clicks: Array.isArray(parsed.clicks) ? parsed.clicks : [],
      conversions: Array.isArray(parsed.conversions) ? parsed.conversions : [],
    };
  } catch {
    state = { offers: [], clicks: [], conversions: [] };
  }
}

export function getCustomSource() {
  return {
    id: "custom",
    name: "Custom Offers",
    enabled: true,
    color: "#facc15",
    type: "custom-offers",
    health: {
      status: "ok",
      lastOk: null,
      lastError: null,
      count: state.offers.filter((offer) => offer.active).length,
      note: "Admin-created offers",
    },
  };
}

export function listCustomOffers() {
  return state.offers.map((offer) => ({ ...offer }));
}

export function getCustomOffer(id) {
  return state.offers.find((offer) => offer.id === id) || null;
}

export async function upsertCustomOffer(input) {
  const now = new Date().toISOString();
  const id = cleanText(input.id) || newId("offer");
  const existing = state.offers.find((offer) => offer.id === id);
  /** @type {CustomOffer} */
  const offer = {
    id,
    name: cleanText(input.name, "Custom offer"),
    offerwall: cleanText(input.offerwall, "Custom"),
    reward: safeNumber(input.reward, 0),
    unit: cleanText(input.unit, "coins"),
    country: cleanText(input.country),
    targetUrl: cleanText(input.targetUrl),
    postbackSecret: cleanText(input.postbackSecret) || existing?.postbackSecret || newId("secret"),
    externalPostbackUrl: cleanText(input.externalPostbackUrl),
    active: input.active !== false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (existing) {
    Object.assign(existing, offer);
  } else {
    state.offers.unshift(offer);
  }
  await save();
  return offer;
}

export async function deleteCustomOffer(id) {
  const before = state.offers.length;
  state.offers = state.offers.filter((offer) => offer.id !== id);
  await save();
  return state.offers.length !== before;
}

function applyMacros(template, values) {
  return String(template || "").replace(/\{(offer_id|click_id|user_id|amount|txid)\}/g, (_, key) => {
    return encodeURIComponent(String(values[key] ?? ""));
  });
}

export async function createCustomClick({ offerId, userId, ip }) {
  const offer = getCustomOffer(offerId);
  if (!offer || !offer.active) return null;
  const click = {
    id: newId("click"),
    offerId,
    userId: cleanText(userId, "guest"),
    createdAt: new Date().toISOString(),
    ip: cleanText(ip),
  };
  state.clicks.unshift(click);
  state.clicks = state.clicks.slice(0, 5000);
  await save();

  const redirectUrl = applyMacros(offer.targetUrl, {
    offer_id: offer.id,
    click_id: click.id,
    user_id: click.userId,
    amount: offer.reward,
    txid: "",
  });
  return { click, offer, redirectUrl };
}

export function buildPostbackUrl(origin, offer) {
  const url = new URL("/api/postback/custom", origin);
  url.searchParams.set("offer_id", offer.id);
  url.searchParams.set("click_id", "{click_id}");
  url.searchParams.set("user_id", "{user_id}");
  url.searchParams.set("amount", "{amount}");
  url.searchParams.set("txid", "{txid}");
  url.searchParams.set("secret", offer.postbackSecret);
  return url.toString();
}

export async function recordCustomPostback(query) {
  const offerId = cleanText(query.offer_id || query.offerId);
  const clickId = cleanText(query.click_id || query.clickId);
  const offer = getCustomOffer(offerId);
  if (!offer) {
    return { ok: false, status: 404, error: "Unknown offer_id" };
  }
  if (offer.postbackSecret && cleanText(query.secret) !== offer.postbackSecret) {
    return { ok: false, status: 403, error: "Invalid secret" };
  }

  const click = clickId ? state.clicks.find((row) => row.id === clickId) : null;
  const userId = cleanText(query.user_id || query.userId || click?.userId, "postback");
  const txid = cleanText(query.txid || query.transaction_id || query.transactionId) || newId("tx");
  const amount = safeNumber(query.amount, offer.reward);
  const duplicate = state.conversions.find(
    (row) => row.offerId === offer.id && row.txid === txid
  );
  if (duplicate) {
    return { ok: true, duplicate: true, offer, conversion: duplicate, event: null };
  }

  const conversion = {
    id: newId("conv"),
    offerId: offer.id,
    clickId,
    userId,
    txid,
    amount,
    createdAt: new Date().toISOString(),
  };
  state.conversions.unshift(conversion);
  state.conversions = state.conversions.slice(0, 5000);
  await save();

  const eventId = crypto
    .createHash("sha256")
    .update(`custom|${offer.id}|${txid}|${userId}|${amount}`)
    .digest("hex")
    .slice(0, 24);
  const event = {
    id: `custom-${eventId}`,
    source: "custom",
    sourceName: "Custom Offers",
    user: userId,
    offer: `${offer.offerwall} → ${offer.name}`,
    offerwall: offer.offerwall,
    offerName: offer.name,
    country: offer.country || null,
    isPrivate: false,
    userId,
    amount,
    unit: offer.unit || "coins",
    rawAmount: `${amount.toLocaleString()} ${offer.unit || "coins"}`,
    at: conversion.createdAt,
  };

  return { ok: true, offer, conversion, event };
}
