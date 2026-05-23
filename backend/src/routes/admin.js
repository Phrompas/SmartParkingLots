import express from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  publish,
  getLatestSlotStatuses,
  getLatestSlotStatus,
  getRecentStatusEvents,
} from "../mqtt.js";

const router = express.Router();

// Allowed actions
const ALLOWED_ACTIONS = new Set([
  "reserve",
  "cancel",
  "expire",
  "confirm",
]);

const SLOT_ID_RE = /^[A-Za-z0-9_-]+$/;

function sanitizeLimit(value, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(n, 200));
}

function logAdminAction(type, meta = {}) {
  console.log(`[ADMIN][${type}]`, {
    at: new Date().toISOString(),
    ...meta,
  });
}

function canSendCommand(action, snapshot) {
  // Real sensor mode only: backend must have seen a live slot status first.
  if (!snapshot) {
    return {
      ok: false,
      reason: "No live sensor status for this slot yet",
    };
  }

  const state = String(snapshot.state || "unknown").toLowerCase();

  switch (action) {
    case "confirm":
      if (
        state === "wait_confirm" ||
        state === "occupied_reserved" ||
        state === "occupied"
      ) {
        return { ok: true, reason: null };
      }
      return { ok: false, reason: `Cannot confirm while slot is ${state}` };

    case "cancel":
    case "expire":
      if (state === "reserved" || state === "wait_confirm") {
        return { ok: true, reason: null };
      }
      return { ok: false, reason: `Cannot ${action} while slot is ${state}` };

    case "reserve":
      if (state === "idle" || state === "available") {
        return { ok: true, reason: null };
      }
      return { ok: false, reason: `Cannot reserve while slot is ${state}` };

    default:
      return { ok: false, reason: "Unsupported action" };
  }
}

// GET /admin/live
router.get("/live", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const live = getLatestSlotStatuses();
    return res.json({
      ok: true,
      count: live.length,
      items: live,
    });
  } catch (err) {
    console.error("[ADMIN] live error", err);
    return res.status(500).json({ message: "Failed to load live statuses" });
  }
});

// GET /admin/events?limit=50
router.get("/events", requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = sanitizeLimit(req.query?.limit, 50);
    const items = getRecentStatusEvents(limit);
    return res.json({
      ok: true,
      count: items.length,
      items,
    });
  } catch (err) {
    console.error("[ADMIN] events error", err);
    return res.status(500).json({ message: "Failed to load recent events" });
  }
});

// POST /admin/commands
router.post("/commands", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { slotId, action, userId } = req.body || {};

    if (!slotId || typeof slotId !== "string") {
      logAdminAction("COMMAND_REJECTED", {
        reason: "Invalid slotId",
        adminUserId: req.user?.user_id || req.user?.id || null,
        action,
        slotId,
      });
      return res.status(400).json({ message: "Invalid slotId" });
    }

    const cleanSlotId = slotId.trim();
    if (!cleanSlotId || !SLOT_ID_RE.test(cleanSlotId)) {
      logAdminAction("COMMAND_REJECTED", {
        reason: "Invalid slotId format",
        adminUserId: req.user?.user_id || req.user?.id || null,
        action,
        slotId: cleanSlotId,
      });
      return res.status(400).json({ message: "Invalid slotId format" });
    }

    const cleanAction = String(action || "").trim().toLowerCase();
    if (!cleanAction || !ALLOWED_ACTIONS.has(cleanAction)) {
      logAdminAction("COMMAND_REJECTED", {
        reason: "Invalid action",
        adminUserId: req.user?.user_id || req.user?.id || null,
        action,
        slotId: cleanSlotId,
      });
      return res.status(400).json({ message: "Invalid action" });
    }

    const cleanUserId = userId ? String(userId).trim() : undefined;

    const snapshot = getLatestSlotStatus(cleanSlotId);

    if (!snapshot) {
      logAdminAction("COMMAND_REJECTED", {
        reason: "No live sensor status",
        adminUserId: req.user?.user_id || req.user?.id || null,
        action: cleanAction,
        slotId: cleanSlotId,
        sensorReady: false,
      });

      return res.status(404).json({
        message: "No live sensor status for this slot",
        slotId: cleanSlotId,
        sensorReady: false,
      });
    }

    const guard = canSendCommand(cleanAction, snapshot);
    if (!guard.ok) {
      logAdminAction("COMMAND_REJECTED", {
        reason: guard.reason,
        adminUserId: req.user?.user_id || req.user?.id || null,
        action: cleanAction,
        slotId: cleanSlotId,
        currentState: snapshot?.state || null,
        sensorReady: !!snapshot,
      });

      return res.status(409).json({
        message: guard.reason,
        slotId: cleanSlotId,
        action: cleanAction,
        currentState: snapshot?.state || null,
        sensorReady: !!snapshot,
      });
    }

    const topic = `parking/${cleanSlotId}/cmd`;

    const payload = {
      action: cleanAction,
      slotId: cleanSlotId,
      userId: cleanUserId,
      source: "backend",
      ts: Date.now(),
    };

    logAdminAction("COMMAND_SENT", {
      adminUserId: req.user?.user_id || req.user?.id || null,
      adminRole: req.user?.role || null,
      topic,
      payload,
      currentState: snapshot?.state || null,
      sensorReady: !!snapshot,
      slotSource: "sensor",
    });

    // --- Publish to MQTT ---
    const published = publish(topic, payload);

    if (!published) {
      return res.status(503).json({
        message: "MQTT unavailable",
        topic,
      });
    }

    return res.json({
      ok: true,
      topic,
      payload,
      slot: {
        id: cleanSlotId,
        name: cleanSlotId,
        source: "sensor",
      },
    });
  } catch (err) {
    logAdminAction("COMMAND_ERROR", {
      adminUserId: req.user?.user_id || req.user?.id || null,
      error: err?.message || String(err),
    });
    return res.status(500).json({ message: "Command failed" });
  }
});

export default router;
