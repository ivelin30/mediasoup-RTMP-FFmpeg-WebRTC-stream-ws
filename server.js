require("dotenv").config();
const fs = require("fs");
const http = require("http");
const https = require("https");
const WebSocket = require("ws");
const {
  createWorker,
  createRouter,
  createProducerTransport,
  createProducer,
  createConsumerTransport,
  createConsumer,
} = require("./helpers/mediasoup_helper");
const Stream = require("./services/stream");

const allWorkers = [{ id: 1, name: "Blackjack" }];
const allStreams = [
  {
    id: 1,
    name: "Blackjack 1",
    workerId: 1,
    port: 5001,
    ssrcV: 1234,
    ssrcA: 5678,
  },
];

let server;
let wss;
let serverOptions = {};

if (process.env.USE_HTTPS === "true") {
  const privateKey = fs.readFileSync(process.env.SSL_PRIVATE_KEY);
  const certificate = fs.readFileSync(process.env.SSL_CERTIFICATE);
  serverOptions = {
    key: privateKey,
    cert: certificate,
  };
  server = https.createServer(serverOptions);
} else {
  server = http.createServer();
}

wss = new WebSocket.Server({ server });

server.listen(process.env.PORT, process.env.IP_ADDRESS, () => {
  console.log(
    `Server is listening on ${
      process.env.USE_HTTPS === "true" ? "wss" : "ws"
    }://${process.env.IP_ADDRESS}:${process.env.PORT}`
  );
});

const workers = new Map();
const streams = new Map();

const createWorkersAndStreams = async () => {
  for (const worker of allWorkers) {
    const newWorker = await createWorker(worker.id, worker.name);
    workers.set(worker.id, newWorker);

    for (const stream of allStreams) {
      if (stream.workerId === worker.id) {
        const newRouter = await createRouter(stream.id, stream.name, newWorker);
        const newStream = new Stream(stream.name, newRouter);
        streams.set(stream.id, newStream);
        await createProducerTransport(newStream, stream.port);
        await createProducer(newStream, stream.ssrcV, stream.ssrcA);
      }
    }
  }
};
createWorkersAndStreams();

wss.on("connection", (ws) => {
  const authTimeout = setTimeout(() => {
    console.error("Client did not authenticate in time. Closing connection.");
    ws.close();
  }, 1000);

  ws.once("message", (message) => {
    const data = JSON.parse(message);
    const { action, clientId, streamId } = data;
    console.log("Client connected:", clientId, action, streamId);
    if (action === "clientConnect") {
      const stream = streams.get(streamId);
      if (!stream) {
        console.error("Stream not found:", streamId);
        clearTimeout(authTimeout);
        ws.close();
        return;
      }
      ws.clientId = clientId;
      sendMessageToClient(ws, "rtpCapabilities", {
        rtpCapabilities: stream.getRouterRtpCapabilities(),
      });
      clearTimeout(authTimeout);
    } else {
      console.error("invalid action", action);
      ws.close();
    }
  });

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.action) {
      case "createConsumerTransport":
        createCTransport(streams.get(data.streamId), ws);
        break;

      case "connectConsumerTransport":
        connectCTransport(streams.get(data.streamId), ws, data.dtlsParameters);
        break;

      case "readyForConsume":
        sendMessageToClient(ws, "producers", { kind: "video" });
        //sendMessageToClient(ws, "producers", { kind: "audio" });
        break;

      case "consume":
        consume(
          ws,
          streams.get(data.streamId),
          data.rtpCapabilities,
          data.kind
        );
        break;

      case "resume":
        resume(ws, streams.get(data.streamId), data.kind);
        break;

      default:
        console.log("Unknown action:", data.action);
        break;
    }
  });
});

const createCTransport = async (stream, ws) => {
  const { transport, params } = await createConsumerTransport(stream);
  stream.addConsumerTransport(ws.clientId, transport);
  transport.observer.on("close", () => {
    console.log(`Consumer transport closed for client ${ws.clientId}`);
    stream.removeConsumerTransport(ws.clientId);
  });
  sendMessageToClient(ws, "consumerTransportCreated", {
    params,
  });
  console.log(`Consumer transport created for client ${ws.clientId}`);
};

const connectCTransport = async (stream, ws, dtlsParameters) => {
  const consumerTransport = stream.getConsumerTransport(ws.clientId);
  if (!consumerTransport) {
    console.error("Consumer transport not found for client1:", ws.clientId);
    return;
  }

  await consumerTransport.connect({ dtlsParameters });
  console.log(`Consumer transport connected for client ${ws.clientId}`);
};

const consume = async (ws, stream, rtpCapabilities, kind) => {
  const consumerTransport = stream.getConsumerTransport(ws.clientId);
  if (!consumerTransport) {
    console.error("Consumer transport not found for client:", ws.clientId);
    return;
  }
  const { consumer, params } = await createConsumer(
    stream,
    consumerTransport,
    rtpCapabilities,
    kind
  );
  stream.addConsumerVA(ws.clientId, consumer, kind);

  sendMessageToClient(ws, "consumed", { params });
  console.log(`Consumer created for client ${ws.clientId} of kind ${kind}`);
};

const resume = async (ws, stream, kind) => {
  const consumer = stream.getConsumerVA(ws.clientId, kind);
  if (!consumer) {
    console.error("Consumer not found for client:", ws.clientId);
    return;
  }

  await consumer.resume();
  console.log(`Consumer resumed for client ${ws.clientId} of kind ${kind}`);
};

const sendMessageToClient = (ws, action, message) => {
  ws.send(JSON.stringify({ action, ...message }));
};
