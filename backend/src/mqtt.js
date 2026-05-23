import mqtt from "mqtt";
import dotenv from "dotenv";

// Always load backend/.env regardless of current working directory
dotenv.config({ path: new URL("../.env", import.meta.url) });

const brokerUrl = process.env.MQTT_BROKER_URL || "mqtt://test.mosquitto.org:1883";
const mqttUsername = process.env.MQTT_USERNAME || undefined;
const mqttPassword = process.env.MQTT_PASSWORD || undefined;

const defaultClientId = `backend-${Math.random().toString(16).slice(2, 10)}`;
const clientId = process.env.MQTT_CLIENT_ID || defaultClientId;

// TLS verification for mqtts/wss. Disable only in local dev if needed.
const rejectUnauthorized =
  String(process.env.MQTT_CA_REJECT_UNAUTHORIZED ?? "true").toLowerCase() !== "false";

const STATUS_TOPIC_RE = /^parking\/([^/]+)\/status$/;
const CMD_TOPIC_RE = /^parking\/([^/]+)\/cmd$/;

const MAX_RECENT_STATUS_EVENTS = Number(process.env.MQTT_MAX_EVENTS || 200);
const latestSlotStatuses = new Map();
const recentStatusEvents = [];

let mqttConnected = false;
let mqttLastConnectedAt = null;
let mqttLastError = null;

const client = mqtt.connect(brokerUrl, {
  clientId,
  username: mqttUsername,
  password: mqttPassword,
  keepalive: 30,
  reconnectPeriod: 2000,
  clean: true,
  rejectUnauthorized,
});

function normalizeSlotId(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function normalizeState(value) {
  return String(value || "unknown").trim().toLowerCase();
}

function parseJsonMessage(value) {
  if (!value) return {};

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeStatusMessage(topic, value) {
  const match = String(topic || "").match(STATUS_TOPIC_RE);
  const topicSlot = normalizeSlotId(match?.[1] || "unknown-slot");

  const data = parseJsonMessage(value);
  if (!data) {
    throw new Error("Invalid JSON status payload");
  }

  const slotId = normalizeSlotId(data?.slotId || topicSlot);
  const state = normalizeState(data?.state || data?.event || data?.type || "unknown");
  const userId = data?.userId === undefined || data?.userId === null ? "" : String(data.userId).trim();

  const remainingMsRaw = data?.remainingMs;
  const remainingMs =
    typeof remainingMsRaw === "number"
      ? remainingMsRaw
      : typeof remainingMsRaw === "string" && remainingMsRaw.trim() !== ""
      ? Number(remainingMsRaw)
      : undefined;

  return {
    slotId,
    state,
    userId,
    remainingMs: Number.isFinite(remainingMs) ? remainingMs : undefined,
    topic: String(topic),
    raw: data,
    receivedAt: new Date().toISOString(),
  };
}

function rememberStatus(snapshot) {
  if (!snapshot?.slotId) return;

  latestSlotStatuses.set(snapshot.slotId, snapshot);
  recentStatusEvents.unshift(snapshot);

  if (recentStatusEvents.length > MAX_RECENT_STATUS_EVENTS) {
    recentStatusEvents.length = MAX_RECENT_STATUS_EVENTS;
  }
}

function getSubscribeTopics() {
  const configured = (process.env.MQTT_SUB_TOPICS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return configured.length ? configured : ["parking/+/status"];
}

client.on("connect", () => {
  mqttConnected = true;
  mqttLastConnectedAt = new Date().toISOString();
  mqttLastError = null;

  console.log(`[MQTT] connected (${brokerUrl}) as ${clientId}`);

  const topics = getSubscribeTopics();
  client.subscribe(topics, (err) => {
    if (err) {
      mqttLastError = err?.message || String(err);
      console.error("[MQTT] Subscribe error:", err);
      return;
    }

    console.log("[MQTT] Subscribed:", topics.join(", "));
  });
});

client.on("reconnect", () => {
  console.log("[MQTT] reconnecting...");
});

client.on("close", () => {
  mqttConnected = false;
  console.log("[MQTT] connection closed");
});

client.on("offline", () => {
  mqttConnected = false;
  console.log("[MQTT] offline");
});

client.on("error", (err) => {
  mqttLastError = err?.message || String(err);
  console.error("[MQTT] error:", mqttLastError);
});

client.on("message", (topic, message) => {
  const value = message.toString();

  if (!STATUS_TOPIC_RE.test(String(topic))) {
    console.log("[MQTT] Unknown topic:", topic);
    return;
  }

  const topicSlot = String(topic).match(STATUS_TOPIC_RE)?.[1] || "unknown-slot";

  try {
    const snapshot = normalizeStatusMessage(topic, value);
    rememberStatus(snapshot);

    const extra = [
      snapshot.userId ? `userId=${snapshot.userId}` : null,
      snapshot.remainingMs !== undefined ? `remainingMs=${snapshot.remainingMs}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    console.log(
      `[MQTT] status ${snapshot.slotId}: ${snapshot.state}${extra ? ` (${extra})` : ""}`
    );
  } catch (e) {
    console.warn("[MQTT] status JSON parse failed; raw =", value);
    console.log(`[MQTT] status ${topicSlot}: <unparsed>`);
  }
});

export { client };

export function publish(topic, msg) {
  const cleanTopic = String(topic || "").trim();

  if (!CMD_TOPIC_RE.test(cleanTopic)) {
    console.error(`[MQTT] Refused publish to non-cmd topic: ${cleanTopic}`);
    return false;
  }

  if (!mqttConnected) {
    console.warn(`[MQTT] Publish requested while disconnected: ${cleanTopic}`);
  }

  const payload =
    typeof msg === "string" ? msg : msg === undefined ? "" : JSON.stringify(msg);

  client.publish(cleanTopic, payload, { qos: 0, retain: false }, (err) => {
    if (err) {
      mqttLastError = err?.message || String(err);
      console.error(`[MQTT] Publish error: ${cleanTopic}`, err);
      return;
    }

    console.log(`[MQTT] Publish: ${cleanTopic} -> ${payload}`);
  });

  return true;
}

export function getLatestSlotStatuses() {
  return Array.from(latestSlotStatuses.values()).sort((a, b) =>
    String(a.slotId).localeCompare(String(b.slotId))
  );
}

export function getLatestSlotStatus(slotId) {
  const key = normalizeSlotId(slotId);
  return latestSlotStatuses.get(key) || null;
}

export function getRecentStatusEvents(limit = 50) {
  const safeLimit = Math.max(0, Math.min(Number(limit) || 0, MAX_RECENT_STATUS_EVENTS));
  return recentStatusEvents.slice(0, safeLimit);
}

export function getMqttHealth() {
  return {
    connected: mqttConnected,
    brokerUrl,
    clientId,
    lastConnectedAt: mqttLastConnectedAt,
    lastError: mqttLastError,
    subscribedTopics: getSubscribeTopics(),
    cachedSlots: latestSlotStatuses.size,
    recentEvents: recentStatusEvents.length,
  };
}