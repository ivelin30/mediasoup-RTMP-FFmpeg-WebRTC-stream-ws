const { spawn } = require("child_process");

const startFfmpegStream = (inputStreamUrl, outputStreamUrl, ssrc) => {
  const ffmpeg = spawn("ffmpeg", [
    "-re", // За да чете в реално време
    "-i",
    inputStreamUrl,
    "-map",
    "0:v:0",
    "-c:v",
    "libx264",
    "-b:v",
    "4000k", // задава битрейта на видео
    "-maxrate",
    "4000k",
    "-bufsize",
    "8000k",
    "-pix_fmt",
    "yuv420p",
    "-g",
    "60",
    "-f",
    "rtp",
    "-payload_type",
    "96",
    "-ssrc",
    ssrc.toString(),
    "-max_muxing_queue_size",
    "1024", // Поправя проблеми с NAL
    "-fps_mode",
    "passthrough", // Използване на fps_mode без -r
    outputStreamUrl,
  ]);

  ffmpeg.stdout.on("data", (data) => {
    console.log(`FFmpeg stdout: ${data}`);
  });

  ffmpeg.stderr.on("data", (data) => {
    console.error(`FFmpeg stderr: ${data}`);
  });

  ffmpeg.on("close", (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
  });
};

module.exports = {
  startFfmpegStream,
};
