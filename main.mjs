import "dotenv/config";
import os from 'os';
import getMac from "getmac";
import mqtt from "mqtt";
import { OmadaClient } from "./omada-client.mjs";

const client_id = process.env.OMADA_CLIENT_ID;
const client_secret = process.env.OMADA_CLIENT_SECRET;
const omadacId = process.env.OMADACID;
const baseUrl = process.env.OMADA_API_BASE_URL;
const siteId = process.env.OMADA_SITE_URL;
const guestSsidName = process.env.GUEST_SSID_NAME;

const mqtt_username = process.env.MQTT_USERNAME;
const mqtt_password = process.env.MQTT_PASSWORD;
const mqttBrokerAddress = process.env.MQTT_BROKER_ADDRESS;

const homeassistantPrefix = "homeassistant";
const homeassistantStatusTopic = `${homeassistantPrefix}/status`;
const deviceId = `power-outage-checker-${getMac().replaceAll(':', '')}`;
const sensorTopicPrefix = `${homeassistantPrefix}/sensor/${deviceId}`;
const sensorConfigTopic = `${sensorTopicPrefix}/config`;
const sensorStateTopic = `${sensorTopicPrefix}/state`;
const availabilityTopic = `${sensorTopicPrefix}/availability`;
const hostname = os.hostname() || getMac();
const dataRefreshInterval = 5000;

// See https://use1-omada-northbound.tplinkcloud.com/doc.html#/00%20All/Client/getGridActiveClients
const omada = new OmadaClient({ client_id, client_secret, omadacId, baseUrl });

async function getData() {
  const clients = await omada.getAllClients(siteId);
  const numGuests = clients.filter((c) => c.ssid === guestSsidName).length;
  return { numGuests };
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// See https://www.home-assistant.io/integrations/mqtt
async function sendDiscoveryMessages() {
  console.log("sending discovery messages");

  await mqttClient.publishAsync(
    sensorConfigTopic,
    JSON.stringify(
      {
        state_topic: sensorStateTopic,
        availability_topic: availabilityTopic,
        value_template: "{{ value_json.numGuests }}",
        unique_id: `${deviceId}-omada-checker`,
        name: "Number of Clients on Guest Network",
        device: {
          identifiers: [`${deviceId}-omada-checker`],
          name: `Omada Checker - ${hostname}`,
          manufacturer: "Nathan Orick",
          model: "Omada Checker",
        },
      },
      {
        retain: true,
      }
    )
  );
}

async function sendBirthMessage() {
  console.log("sending birth message");
  await mqttClient.publishAsync(availabilityTopic, "online", { retain: true });
}

const mqttClient = mqtt.connect(mqttBrokerAddress, {
  username: mqtt_username,
  password: mqtt_password,
  will: {
    topic: availabilityTopic,
    payload: "offline",
    retain: true
  },
});

mqttClient.on("error", (e) => {
  console.log("error", e);
});

mqttClient.on("message", async (topic, message) => {
  console.log("received message:", topic, message.toString());
  if (topic === homeassistantStatusTopic) {
    if (message.toString() === "online") {
      await delay(Math.floor(Math.random() * 10_000));
      console.log("home assistant online");
      await sendDiscoveryMessages();
      await sendBirthMessage();
      publishDataOnSchedule();
    }
    if (message.toString() === 'offline') {
      console.log('home assistant offline')
    }
  }
});

let timeout;
async function publishDataOnSchedule() {
  if (timeout) {
    clearTimeout(timeout);
    timeout = undefined;
  }

  console.log('getting data');
  const data = await getData();
  console.log('data: ', data);
  await mqttClient.publishAsync(sensorStateTopic, JSON.stringify(data));

  timeout = setTimeout(async () => {
    await publishDataOnSchedule();
  }, dataRefreshInterval);
}

mqttClient.on("connect", async () => {
  console.log("connected");
  mqttClient.subscribe(homeassistantStatusTopic);
});
