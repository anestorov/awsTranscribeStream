navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

let audioStream;

if (navigator.getUserMedia) {
    navigator.getUserMedia({ audio: true }, function (stream) {
        audioStream = stream;
    }, function (error) {
        alert('Error capturing audio.');
    });
}
else {
    alert('getUserMedia not supported in this browser.');
}

// creates the an instance of audioContext
const context = window.AudioContext || window.webkitAudioContext;
const audioContext = new context();

// retrieve the current sample rate of microphone the browser is using
const sampleRate = audioContext.sampleRate;

// creates a gain node
const volume = audioContext.createGain();

// creates an audio node from the microphone incoming stream
const audioInput = audioContext.createMediaStreamSource(audioStream);

// connect the stream to the gain node
audioInput.connect(volume);

/* From the spec: This value controls how frequently the audioprocess event is
dispatched and how many sample-frames need to be processed each call.
Lower values for buffer size will result in a lower (better) latency.
Higher values will be necessary to avoid audio breakup and glitches */
const bufferSize = 2048;
const recorder = (audioContext.createScriptProcessor || audioContext.createJavaScriptNode).call(audioContext, bufferSize, 1, 1);

const leftChannel = [];
let recordingLength = 0;

recorder.onaudioprocess = function (event) {
    const samples = event.inputBuffer.getChannelData(0);

    // we clone the samples
    leftChannel.push(new Float32Array(samples));

    recordingLength += bufferSize;

    const PCM32fSamples = mergeBuffers(leftChannel, recordingLength);

    const PCM16iSamples = [];

    for (let i = 0; i < PCM32fSamples.length; i++) {
        let val = Math.floor(32767 * PCM32fSamples[i]);
        val = Math.min(32767, val);
        val = Math.max(-32768, val);

        PCM16iSamples.push(val);
    }
};

// we connect the recorder
volume.connect(recorder);

// start recording
recorder.connect(audioContext.destination);

function mergeBuffers(channelBuffer, recordingLength) {
    let result = new Float32Array(recordingLength);
    let offset = 0;

    for (let i = 0; i < channelBuffer.length; i++) {
        result.set(channelBuffer[i], offset);
        offset += channelBuffer[i].length;
    }

    return Array.prototype.slice.call(result);
}

