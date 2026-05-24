ต้องมีสิ่งเหล่านี้ก่อน
	•	Node.js >= 18
	•	npm
	•	PostgreSQL
	•	Mosquitto MQTT
	•	Node-RED
	•	Expo CLI
	•	Android Emulator (หรือมือถือจริง)

1.Clone Repository
  git clone https://github.com/<your-username>/SmartParkingLot.git
  cd SmartParkingLot

โครงสร้างหลัก:
  SmartParkingLot/
  ├── backend/
  ├── app/        # React Native
  ├── node-red/
  └── iot/

2.ติดตั้ง mqtt
   brew install mosquitto

3.Backend Setup (Node.js)
  cd backend
  npm install

.env/n
PORT=/n
DATABASE_URL=/n
JWT_SECRET=/n
MQTT_BROKER_URL=/n

รัน Backend
  npm run dev

4.Database (PostgreSQL)
  CREATE DATABASE smartparking;

5.Forntend(React Native / Expo)
  cd app
  npm install

MQTT Client
  app/src/mqttClient.js

WebSocket: mqtt.connect("ws://10.0.2.2:9001/mqtt");

รัน App
    npx expo start
  
