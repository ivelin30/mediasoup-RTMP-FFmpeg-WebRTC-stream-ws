const mediasoup = require("mediasoup");
const { startFfmpegStream } = require("../services/FFmpeg");

const createWorker = async (workerId, workerName) => {
  const worker = await mediasoup.createWorker({
    logLevel: "error", // Set to error in production
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
    rtcMinPort: 5000,
    rtcMaxPort: 5800,
  });

  console.log(`== Worker id: ${workerId} name: ${workerName} ==`);

  return worker;
};

const createRouter = async (id, streamName, worker) => {
  const router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters: {
          "packetization-mode": 1,
          "profile-level-id": "42e01f",
          "level-asymmetry-allowed": 1,
        },
      },
    ],
  });

  console.log(`| L Router id: ${id} stream: ${streamName} --`);

  return router;
};

const createProducerTransport = async (stream, port) => {
  stream.producerTransport = await stream.router.createPlainTransport({
    listenIp: "127.0.0.1",
    port: 5004,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    comedia: false,
    rtcpMux: true,
    maxPacketLifeTime: 5 * 1000,
    maxRetransmits: 10,
  });
  console.log(`| | L Producer Transport port: ${port} - created --`);
};

const createProducer = async (stream, ssrcV, ssrcA) => {
  const videoCodec = {
    mimeType: "video/H264",
    payloadType: 96,
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  };

  const audioCodec = {
    mimeType: "audio/opus",
    payloadType: 97,
    clockRate: 48000,
    channels: 2,
    parameters: {
      "sprop-stereo": 1,
    },
  };

  stream.videoProducer = await stream.producerTransport.produce({
    kind: "video",
    rtpParameters: {
      codecs: [videoCodec],
      encodings: [{ ssrc: ssrcV }],
    },
    appData: { type: "video" },
  });
  console.log(`| | | L Video - created --`);

  stream.audioProducer = await stream.producerTransport.produce({
    kind: "audio",
    rtpParameters: {
      codecs: [audioCodec],
      encodings: [{ ssrc: ssrcA }],
    },
    appData: { type: "audio" },
  });
  console.log(`| | | L Audio - created --`);

  startFfmpegStream(
    "rtmp://127.0.0.1:1935/live/stream",
    "rtp://127.0.0.1:5004",
    1234
  );

  stream.videoProducer.observer.on("trace", (evt) => {
    console.log("📥 Video producer trace:", evt);
  });

  stream.audioProducer.observer.on("trace", (evt) => {
    console.log("📥 Audio producer trace:", evt);
  });
};

const createConsumerTransport = async (stream) => {
  const consumerTransport = await stream.router.createWebRtcTransport({
    listenIps: [{ ip: "127.0.0.1", announcedIp: null }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  return {
    transport: consumerTransport,
    params: {
      id: consumerTransport.id,
      iceParameters: consumerTransport.iceParameters,
      iceCandidates: consumerTransport.iceCandidates,
      dtlsParameters: consumerTransport.dtlsParameters,
    },
  };
};

const createConsumer = async (
  stream,
  consumerTransport,
  rtpCapabilities,
  kind
) => {
  let consumer = null;
  let producerId = null;

  if (kind === "video") {
    if (!stream.videoProducer) {
      throw new Error("Video producer not found");
    }
    producerId = stream.videoProducer.id;
  } else if (kind === "audio") {
    if (!stream.audioProducer) {
      throw new Error("Audio producer not found");
    }
    producerId = stream.audioProducer.id;
  }

  if (
    !stream.router.canConsume({
      producerId: producerId,
      rtpCapabilities,
    })
  ) {
    console.error("can not consume");
    return;
  }

  consumer = await consumerTransport.consume({
    producerId: producerId,
    rtpCapabilities: rtpCapabilities,
    paused: kind === "video",
  });

  consumer.on("trace", (evt) => {
    console.log("📥 Consumer RTP trace event:", evt);
  });

  return {
    consumer: consumer,
    params: {
      id: consumer.id,
      producerId: producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
      appData: consumer.appData,
    },
  };
};

module.exports = {
  createWorker,
  createRouter,
  createProducerTransport,
  createProducer,
  createConsumerTransport,
  createConsumer,
};
