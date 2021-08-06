

import { TranscribeStreamingClient, StartStreamTranscriptionCommand, AudioEvent, AudioStream } from "@aws-sdk/client-transcribe-streaming"
import {CognitoIdentityClient} from "@aws-sdk/client-cognito-identity"
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";

const player = document.getElementById('player');

const awsTranscribeClient = new TranscribeStreamingClient({
    region: "eu-central-1",
    credentials:fromCognitoIdentityPool({
        client: new CognitoIdentityClient({ region: "eu-central-1" }),
        identityPoolId: "eu-central-1:4e20f92b-5754-430d-808c-c8e343c115cd" // IDENTITY_POOL_ID,
    })
});

const handleSuccess = function (stream) {

    if (window.URL) {
        player.srcObject = stream;
      } else {
        player.src = stream;
      }
    

    // creates the an instance of audioContext
    const context = window.AudioContext || window.webkitAudioContext;
    const audioContext = new context();

    // retrieve the current sample rate of microphone the browser is using
    const sampleRate = audioContext.sampleRate;
    const downsampleFactor = 2;

    // creates a gain node
    const volumeNode = audioContext.createGain();

    // creates an audio node from the microphone incoming stream
    const audioInput = audioContext.createMediaStreamSource(stream);

    // connect the stream to the gain node
    audioInput.connect(volumeNode);

    /* From the spec: This value controls how frequently the audioprocess event is
    dispatched and how many sample-frames need to be processed each call.
    Lower values for buffer size will result in a lower (better) latency.
    Higher values will be necessary to avoid audio breakup and glitches */
    const bufferSize = 4096;
    const recorder = (audioContext.createScriptProcessor || audioContext.createJavaScriptNode).call(audioContext, bufferSize, 1, 1);

    const asyncIterableAudio = {
        async*[Symbol.asyncIterator]() {
            while (true) {
                let chunk = await getAudioChunk();

                yield { AudioEvent: { AudioChunk: chunk } }
            }
        }
    }

    function getAudioChunk() {
        return new Promise((resolve) => {
            recorder.onaudioprocess = function (event) {
                const samples = event.inputBuffer.getChannelData(0);
                // we clone the samples
                const samplesCopy = new Float32Array(samples);

                const PCM16iSamples = new Int8Array(samplesCopy.length  * 2 / downsampleFactor);

                for (let i = 0; i < samplesCopy.length; i += downsampleFactor) {
                    let val = Math.floor(32767 * samplesCopy[i]);
                    val = Math.min(32767, val);
                    val = Math.max(-32768, val);

                    PCM16iSamples[i * 2 / downsampleFactor  + 1] = val >> 8;
                    PCM16iSamples[i * 2 / downsampleFactor] = val % 256;
                }

                //console.log(samplesCopy);
                //console.log(PCM16iSamples);

                resolve(PCM16iSamples);
                //return event;
            };
        });
    }

    const command = new StartStreamTranscriptionCommand({
        AudioStream: asyncIterableAudio,
        LanguageCode: "en-US",
        MediaEncoding: "pcm",//"ogg-opus",
        MediaSampleRateHertz: sampleRate / downsampleFactor,
        Specialty: "General",
        Type: "DICTATION",

        //When you transcribe a real-time stream using the StartStreamTranscription operation or a WebSocket request, make sure that your stream is encoded in:
        // - PCM 16-bit signed little endian
        // - FLAC
        // - OPUS encoded audio in the Ogg container
        //For best results:
        //Use a lossless format, such as FLAC or PCM encoding.
        //Use a sample rate of 8000 Hz for telephone audio.
    });

    let resText = "";
    let btn1 = document.querySelector("#btn1");
    let btn2 = document.querySelector("#btn2");
    let resArea = document.querySelector("#resArea");
    let status = document.querySelector("#status");
    btn1.addEventListener("click", async (e) => {
        try {
            // we connect the recorder
            volumeNode.connect(recorder);
            //volumeNode.connect(audioContext.destination);

            // start recording
            recorder.connect(audioContext.destination);

            const data = await awsTranscribeClient.send(command);
            let resLast = "";

            status.innerHTML = "Transcribe is ON";
            status.style.color = "green";

            for await (const transcript of data.TranscriptResultStream) {

                if(transcript.TranscriptEvent.Transcript.Results[0]){
                    resLast = transcript.TranscriptEvent.Transcript.Results[0].Alternatives[0].Transcript;
                    if(transcript.TranscriptEvent.Transcript.Results[0].IsPartial === false) {
                        resText += resLast+"\r\n";
                        resLast = "";
                    }
                    resArea.value = resText+resLast;
                    resArea.scrollTop = resArea.scrollHeight;
                }
                /*if (transcript.TranscriptEvent.Transcript.Results instanceof Array) {
                    transcript.TranscriptEvent.Transcript.Results.forEach(result => {
                        if (result.Alternatives instanceof Array) {
                            result.Alternatives.forEach(alternative => {
                                console.table(alternative.Items);
                            })
                        }
                        //ChannelId: undefined
                        //EndTime: 2.97
                        //IsPartial: true
                        //ResultId: "efaa269f-0c3f-4dbb-9b32-e42fbd66ee91"
                        //StartTime: 1.3
                        //console.log(result);
                    });

                }
                console.log(transcript);*/

            }/**/
        } catch (e) {
            volumeNode.disconnect();
            recorder.disconnect();
            awsTranscribeClient.destroy();
            console.error(e);
            status.innerHTML = "Transcribe is OFF";
            status.style.color = "red";
        }
    });
    btn2.addEventListener("click", async (e) => {
        try {
            volumeNode.disconnect();
            recorder.disconnect();
            awsTranscribeClient.destroy();
            status.innerHTML = "Transcribe is OFF";
            status.style.color = "red";
        } catch (e) {
            console.error(e);
            status.innerHTML = "Transcribe is OFF";
            status.style.color = "red";
        }
    });


};

navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(handleSuccess);
/*
navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;

if (navigator.getUserMedia) {
    navigator.getUserMedia({ audio: true }, function (stream) {
        audioStream = stream;
    }, function (error) {
        alert('Error capturing audio.');
    });
}
else {
    alert('getUserMedia not supported in this browser.');
}*/



