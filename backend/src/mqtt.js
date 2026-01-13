import mqtt from "mqtt";
import dotenv from "dotenv";
dotenv.config();

// Connect broker
const client = mqtt.connect(process.env.MQTT_BROKER_URL || "mqtt://test.mosquitto.org:1883");

client.on("connect", () => {
  console.log("[MQTT] connected");

  // topics ที่ backend ควรรับ
  const topics = [
    "smartparking/slot1/isParked",           // input จาก sensor
    "smartparking/slot1/reservationStatus",  // input จาก backend(app)
    "smartparking/slot1/confirmedParkID",    // input จาก app
    "smartparking/slot1/reset",              // input จาก node-red
  ];

  client.subscribe(topics, (err) => {
    if (err) console.error("[MQTT] Subscribe error:", err);
    else console.log("[MQTT] Subscribed:", topics.join(", "));
  });
});

// message handler
client.on("message", (topic, message) => {
  const value = message.toString();
  console.log(`[MQTT] Received: ${topic} => ${value}`);

  switch (topic) {
    case "smartparking/slot1/isParked":
      console.log(value === "1" ? "🚗 รถเข้าซอง" : "🟩 ซองว่าง");
      break;

    case "smartparking/slot1/reservationStatus":
      console.log("📲 App จอง userId:", value);
      break;

    case "smartparking/slot1/confirmedParkID":
      console.log("✅ ผู้ใช้ยืนยันการจอด userId:", value);
      break;

    case "smartparking/slot1/reset":
      console.log("🔄 รีเซ็ตซอง");
      break;

    default:
      console.log("📩 Unknown topic:", topic);
  }
});

// Export
export { client };

export function publish(topic, msg) {
  client.publish(topic, String(msg), {}, (err) => {
    if (err) console.error(`[MQTT] Publish error: ${topic}`, err);
    else console.log(`[MQTT] Publish: ${topic} -> ${msg}`);
  });
}