#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
// PORT: 172.20.10.6
const char* ssid = "WiFiName";
const char* password = "WiFiPassword";

const char* mqttServer = "MQTTBroker";
const int mqttPort = 8883;

const char* mqttUsername = "SequentialMQTTBrokerUsername";
const char* mqttPassword = "SequentialMQTTBrokerPassword";

const char* slotId = "slot02";

char topicCmd[64];
char topicStatus[64];
char mqttClientId[64];

#define TRIG_PIN 32
#define ECHO_PIN 33

#define GREEN_PIN 25
#define YELLOW_PIN 26
#define RED_PIN 27

enum ParkingState {
  IDLE,
  RESERVED,
  WAIT_CONFIRM,
  OCCUPIED_RESERVED,
  ALERT_NO_RESERVATION,
  VIOLATION
};

ParkingState currentState = IDLE;

WiFiClientSecure espClient;
PubSubClient client(espClient);

char reservedUserId[64] = {0};

unsigned long waitStartTime = 0;
const unsigned long WAIT_CONFIRM_TIMEOUT = 10000;
const unsigned long ABSENT_CONFIRM_MS = 1200;

// Ultrasonic config
const float CAR_DETECT_CM = 4.6;
const unsigned long ULTRA_TIMEOUT_US = 30000;
const int ULTRA_SAMPLES = 5;

// Noise filter
const int DETECT_CONFIRM_COUNT = 4;
const int CLEAR_CONFIRM_COUNT = 4;

int detectCount = 0;
int clearCount = 0;

bool carPresent = false;
unsigned long absentSince = 0;

void buildTopics() {
  snprintf(topicCmd, sizeof(topicCmd), "parking/%s/cmd", slotId);
  snprintf(topicStatus, sizeof(topicStatus), "parking/%s/status", slotId);
  snprintf(mqttClientId, sizeof(mqttClientId), "ESP32_%s", slotId);
}

void setLight(bool g, bool y, bool r) {
  digitalWrite(GREEN_PIN, g);
  digitalWrite(YELLOW_PIN, y);
  digitalWrite(RED_PIN, r);
}

void setLightByState() {
  switch (currentState) {
    case IDLE:
      setLight(0, 0, 0);
      break;

    case RESERVED:
      setLight(1, 0, 0);
      break;

    case WAIT_CONFIRM:
    case OCCUPIED_RESERVED:
      setLight(0, 0, 1);
      break;

    case ALERT_NO_RESERVATION:
    case VIOLATION:
      setLight(0, 1, 0);
      break;
  }
}

void publishStatus(const char* state) {
  StaticJsonDocument<200> doc;

  doc["slotId"] = slotId;
  doc["state"] = state;

  if (reservedUserId[0] != '\0') {
    doc["userId"] = reservedUserId;
  }

  if (currentState == WAIT_CONFIRM) {
    unsigned long elapsed = millis() - waitStartTime;

    unsigned long remaining =
      (elapsed >= WAIT_CONFIRM_TIMEOUT)
      ? 0
      : (WAIT_CONFIRM_TIMEOUT - elapsed);

    doc["remainingMs"] = remaining;
  }

  char buffer[200];
  size_t n = serializeJson(doc, buffer, sizeof(buffer));

  client.publish(topicStatus, (const uint8_t*)buffer, n, true);

  Serial.print("MQTT publish: ");
  Serial.println(buffer);
}

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, ULTRA_TIMEOUT_US);

  if (duration == 0) {
    return -1.0;
  }

  float distance = duration * 0.0343 / 2.0;
  return distance;
}

void updateCarPresent() {
  float sum = 0.0;
  int validCount = 0;

  for (int i = 0; i < ULTRA_SAMPLES; i++) {
    float distance = readDistanceCm();

    if (distance > 0.0 && distance < 100.0) {
      sum += distance;
      validCount++;
    }

    delay(30);
  }

  if (validCount == 0) {
    clearCount++;
    detectCount = 0;

    if (clearCount >= CLEAR_CONFIRM_COUNT) {
      carPresent = false;
    }

    return;
  }

  float avgDistance = sum / validCount;

  Serial.print("Distance AVG: ");
  Serial.print(avgDistance);
  Serial.print(" cm | detectCount: ");
  Serial.print(detectCount);
  Serial.print(" | clearCount: ");
  Serial.print(clearCount);
  Serial.print(" | carPresent: ");
  Serial.println(carPresent ? "YES" : "NO");

  if (avgDistance <= CAR_DETECT_CM) {
    detectCount++;
    clearCount = 0;
  } else {
    clearCount++;
    detectCount = 0;
  }

  if (detectCount >= DETECT_CONFIRM_COUNT) {
    carPresent = true;
  }

  if (clearCount >= CLEAR_CONFIRM_COUNT) {
    carPresent = false;
  }
}

bool carLeftConfirmed() {
  if (carPresent) {
    absentSince = 0;
    return false;
  }

  if (absentSince == 0) {
    absentSince = millis();
  }

  return (millis() - absentSince >= ABSENT_CONFIRM_MS);
}

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("MQTT message arrived on topic: ");
  Serial.println(topic);

  StaticJsonDocument<256> doc;

  DeserializationError err = deserializeJson(doc, payload, length);

  if (err) {
    Serial.print("JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  const char* action = doc["action"] | "";
  const char* userId = doc["userId"] | "";

  Serial.print("Action: ");
  Serial.println(action);

  Serial.print("UserID: ");
  Serial.println(userId);

  if (strcmp(action, "reserve") == 0 && currentState == IDLE) {
    if (userId[0] == '\0') return;

    strncpy(reservedUserId, userId, sizeof(reservedUserId) - 1);
    reservedUserId[sizeof(reservedUserId) - 1] = '\0';

    currentState = RESERVED;

    setLightByState();
    publishStatus("reserved");

    return;
  }

  if (
    (
      strcmp(action, "cancel") == 0 ||
      strcmp(action, "expire") == 0
    ) &&
    currentState == RESERVED
  ) {
    reservedUserId[0] = '\0';

    currentState = IDLE;

    setLightByState();
    publishStatus("idle");

    return;
  }

  if (strcmp(action, "confirm") == 0 && currentState == WAIT_CONFIRM) {
    if (userId[0] == '\0') return;

    if (strcmp(userId, reservedUserId) == 0) {
      currentState = OCCUPIED_RESERVED;

      setLightByState();
      publishStatus("occupied_reserved");
    } else {
      publishStatus("confirm_rejected");
    }

    return;
  }
}

void reconnectWiFiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("WiFi disconnected, reconnecting");

  WiFi.disconnect();
  WiFi.begin(ssid, password);

  unsigned long start = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start < 15000
  ) {
    Serial.print(".");
    delay(500);
  }

  Serial.println();
}

void reconnectMQTT() {
  static unsigned long lastAttempt = 0;

  if (client.connected()) return;

  if (millis() - lastAttempt < 2000) return;

  lastAttempt = millis();

  Serial.print("Connecting to MQTT (TLS)...");

  if (client.connect(mqttClientId, mqttUsername, mqttPassword)) {
    Serial.println("connected");

    client.subscribe(topicCmd);

    Serial.print("Subscribed to topic: ");
    Serial.println(topicCmd);

    publishStatus(
      currentState == IDLE ? "idle" :
      currentState == RESERVED ? "reserved" :
      currentState == WAIT_CONFIRM ? "wait_confirm" :
      currentState == OCCUPIED_RESERVED ? "occupied_reserved" :
      currentState == ALERT_NO_RESERVATION ? "occupied_no_reservation" :
      "violation"
    );

  } else {
    Serial.print("failed, rc=");
    Serial.println(client.state());
  }
}

void setupOTA() {
  ArduinoOTA.setHostname("smartparking-slot01");
  ArduinoOTA.setPassword("123456");

  ArduinoOTA
    .onStart([]() {
      Serial.println("OTA Start");
    })
    .onEnd([]() {
      Serial.println("\nOTA End");
    })
    .onProgress([](unsigned int progress, unsigned int total) {
      Serial.printf(
        "OTA Progress: %u%%\r",
        (progress * 100) / total
      );
    })
    .onError([](ota_error_t error) {
      Serial.printf("OTA Error[%u]\n", error);
    });

  ArduinoOTA.begin();

  Serial.println("OTA Ready");
}

void setup() {
  Serial.begin(115200);

  buildTopics();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(GREEN_PIN, OUTPUT);
  pinMode(YELLOW_PIN, OUTPUT);
  pinMode(RED_PIN, OUTPUT);

  digitalWrite(TRIG_PIN, LOW);

  setLightByState();

  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }

  Serial.println();
  Serial.println("WiFi connected");

  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  espClient.setInsecure();

  client.setServer(mqttServer, mqttPort);
  client.setCallback(callback);

  setupOTA();
}

void loop() {
  ArduinoOTA.handle();

  reconnectWiFiIfNeeded();

  if (!client.connected()) {
    reconnectMQTT();
  }

  client.loop();

  updateCarPresent();

  switch (currentState) {
    case IDLE:
      if (carPresent) {
        currentState = ALERT_NO_RESERVATION;

        setLightByState();
        publishStatus("occupied_no_reservation");
      }
      break;

    case RESERVED:
      if (carPresent) {
        currentState = WAIT_CONFIRM;

        waitStartTime = millis();

        setLightByState();
        publishStatus("wait_confirm");
      }
      break;

    case WAIT_CONFIRM:
      if (carLeftConfirmed()) {
        currentState = IDLE;

        reservedUserId[0] = '\0';

        setLightByState();
        publishStatus("idle");

      } else if (millis() - waitStartTime >= WAIT_CONFIRM_TIMEOUT) {
        currentState = VIOLATION;

        setLightByState();
        publishStatus("violation");
      }

      break;

    case OCCUPIED_RESERVED:
    case ALERT_NO_RESERVATION:
    case VIOLATION:
      if (carLeftConfirmed()) {
        currentState = IDLE;

        reservedUserId[0] = '\0';

        setLightByState();
        publishStatus("idle");
      }

      break;
  }
}