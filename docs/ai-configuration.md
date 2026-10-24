# AI provider configuration

Agent-powered features use the OpenAI Agents SDK with DigitalOcean's
OpenAI-compatible inference API. Configure these environment variables:

```dotenv
DIGITALOCEAN_API_KEY=your_digitalocean_inference_api_key
DIGITALOCEAN_BASE_URL=https://inference.do-ai.run/v1
DIGITALOCEAN_MODEL=llama3.3-70b-instruct
```

`DIGITALOCEAN_BASE_URL` defaults to `https://inference.do-ai.run/v1` and
`DIGITALOCEAN_MODEL` defaults to `llama3.3-70b-instruct`. Set the model to one
available to your DigitalOcean account. The Agent SDK is configured to use the
Chat Completions API rather than the OpenAI Responses API.

Roleplay question speech synthesis uses DigitalOcean's `/v1/audio/speech`
endpoint and defaults to `qwen3-tts-voicedesign`. Set `DIGITALOCEAN_TTS_MODEL`
to use a different TTS model. TTS accepts either raw audio bytes or the
DigitalOcean JSON response containing base64 audio.

The recording service uses the Google Gemini API for transcription. Set
`GOOGLE_GEMINI_API` to a Gemini API key. Audio is sent as inline data; the
endpoint accepts files up to 10 MB or one minute in duration.

Roleplay voice settings use `alloy` by default. Legacy roleplays using the
previous default voice `nova` are mapped to `alloy` for DigitalOcean TTS.

Pronunciation feedback additionally requires `PRONUNCIATION_API_BASE_URL` to
point to the Python pronunciation service. The API server posts audio and its
transcript to `/fast/pronunciation`; the Agent SDK then turns the analyzer's
phoneme-level results into learner-friendly explanations.
