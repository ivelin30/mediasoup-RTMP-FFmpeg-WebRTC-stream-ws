class Stream {
  constructor(name, router) {
    this.name = name;

    this.producerTransport = null;
    this.videoProducer = null;
    this.audioProducer = null;

    this.consumerTransports = {}; // Map of consumer transports by clientId
    this.videoConsumers = {}; // Map of video consumers by clientId
    this.audioConsumers = {}; // Map of audio consumers by clientId

    this.router = router; // Router for the stream
  }

  getRouterRtpCapabilities() {
    return this.router.rtpCapabilities;
  }

  addConsumerTransport(clientId, consumerTransport) {
    this.consumerTransports[clientId] = consumerTransport;
  }

  removeConsumerTransport(clientId) {
    if (this.consumerTransports[clientId]) {
      this.consumerTransports[clientId].close();
    }
    if (this.videoConsumers[clientId]) {
      this.videoConsumers[clientId].close();
    }
    if (this.audioConsumers[clientId]) {
      this.audioConsumers[clientId].close();
    }
    delete this.consumerTransports[clientId];
    delete this.videoConsumers[clientId];
    delete this.audioConsumers[clientId];
  }

  getConsumerTransport(clientId) {
    return this.consumerTransports[clientId];
  }

  addConsumerVA(clientId, consumer, kind) {
    if (kind === "video") {
      this.videoConsumers[clientId] = consumer;
    }
    if (kind === "audio") {
      this.audioConsumers[clientId] = consumer;
    }
  }

  getConsumerVA(clientId, kind) {
    if (kind === "video") {
      return this.videoConsumers[clientId];
    }
    if (kind === "audio") {
      return this.audioConsumers[clientId];
    }
  }

  removeConsumerVA(clientId, kind) {
    if (kind === "video" && this.videoConsumers[clientId]) {
      this.videoConsumers[clientId].close();
      delete this.videoConsumers[clientId];
    }
    if (kind === "audio" && this.audioConsumers[clientId]) {
      this.audioConsumers[clientId].close();
      delete this.audioConsumers[clientId];
    }
  }
}

module.exports = Stream;
