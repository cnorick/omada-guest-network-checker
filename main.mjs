import "dotenv/config";
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
const deviceId = "omada-guest-checker";
const sensorTopicPrefix = `${homeassistantPrefix}/sensor/${deviceId}`;
const sensorConfigTopic = `${sensorTopicPrefix}/config`;
const sensorStateTopic = `${sensorTopicPrefix}/state`;
const availabilityTopic = `${sensorTopicPrefix}/availability`;
const dataRefreshInterval = 5000;

// See https://use1-omada-northbound.tplinkcloud.com/doc.html#/00%20All/Client/getGridActiveClients
const omada = new OmadaClient({ client_id, client_secret, omadacId, baseUrl });

async function getData() {
  const clients = await omada.getAllClients(siteId);
  const numGuests = clients.filter((c) => c.ssid === guestSsidName).length;
  return { numGuests };
}

// See https://www.home-assistant.io/integrations/mqtt
function sendDiscoveryMessages() {
  console.log("sending discovery messages");

  mqttClient.publish(
    sensorConfigTopic,
    JSON.stringify({
      state_topic: sensorStateTopic,
      availability_topic: availabilityTopic,
      value_template: "{{ value_json.numGuests }}",
      unique_id: "numGuests",
      name: "Number of Clients on Guest Network",
      device: {
        identifiers: ["omada-guest-checker"],
        name: "Omada Checker",
        manufacturer: "Nathan Orick",
      },
    })
  );
}

function sendBirthMessage() {
  console.log("sending birth message");
  mqttClient.publish(availabilityTopic, "online");
}

const mqttClient = mqtt.connect(mqttBrokerAddress, {
  username: mqtt_username,
  password: mqtt_password,
  will: {
    topic: availabilityTopic,
    payload: "offline",
  },
});

mqttClient.subscribe(homeassistantStatusTopic);

mqttClient.on("error", (e) => {
  console.log("error", e);
});

mqttClient.on("message", (topic, message) => {
  console.log("received message:", topic, message.toString());
  if (topic === homeassistantStatusTopic) {
    if (message.toString() === "online") {
      console.log("home assistant online");
      setTimeout(async () => {
        sendDiscoveryMessages();
      }, 5000);
    }
  }
});

let timeout;
async function publishDataOnSchedule() {
  if (timeout) {
    clearTimeout(timeout);
    timeout = undefined;
  }

  const data = await getData();
  await mqttClient.publishAsync(sensorStateTopic, JSON.stringify(data));

  timeout = setTimeout(async () => {
    await publishDataOnSchedule();
  }, dataRefreshInterval);
}

mqttClient.on("connect", async () => {
  console.log("connected");
  setTimeout(async () => {
    sendBirthMessage();
    sendDiscoveryMessages();
    await publishDataOnSchedule();
  }, 5000);
});
