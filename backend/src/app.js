import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url) });
import express from "express";
import cors from "cors";
import morgan from "morgan";
import auth from "./routes/auth.js";
import spaces from "./routes/spaces.js";
import bookings from "./routes/bookings.js";
import users from "./routes/users.js";
import adminRoutes from "./routes/admin.js";
import { client as mqttClient } from "./mqtt.js";

const app = express();
app.locals.mqttClient = mqttClient;
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// middleware ตรวจสอบ mqtt เชื่อมต่อ
app.use((req, res, next) => {
  // Allow auth routes even if MQTT is down (so users can still login/register)
  if (req.path.startsWith("/auth")) return next();

  if (!app.locals.mqttClient?.connected) {
    return res.status(503).json({ error: "MQTT broker unavailable" });
  }
  next();
});

app.get("/", (req,res)=>res.json({ok:true, service:"smart-parking-api"}));
app.use("/admin", adminRoutes);
app.use("/auth", auth);
app.use("/users", users);
app.use("/spaces", spaces);
app.use("/bookings", bookings);

// fallback route
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(process.env.PORT, () =>
  console.log(`API running on http://localhost:${process.env.PORT}`)
);