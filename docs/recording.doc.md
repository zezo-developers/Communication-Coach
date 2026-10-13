# Communication Coach — Recording API Documentation

Complete reference for every endpoint exposed by `RecordingController` ([src/modules/recording/controllers/recording.controller.ts](../src/modules/recording/controllers/recording.controller.ts)).

---

## Architecture

```mermaid
flowchart TB
  Client["Client"] -->|REST API| RecordingApi["/recording"]
  subgraph RecordingApi
    Presign["POST /recording/batch-presign-url"]
    Complete["POST /recording/complete-recording"]
    Abort["POST /recording/abort-recording"]
    Question["POST /recording/generate-question"]
    Transcribe["POST /recording/speech-to-text"]
  end
```

**Swagger UI URL:** `{BASE_URL}/api/docs`

**Standard Headers:**

```json
{
  "Authorization": "Bearer <user-access-token>",
  "Content-Type": "multipart/form-data"
}
```

### Overview:

| Path                         | Method  | Purpose                                                  |
|------------------------------|---------|----------------------------------------------------------|
| `/recording/batch-presign-url` | POST    | Generate presigned S3 upload links for audio recording.  |
| `/recording/complete-recording` | POST    | Complete multipart uploads and retrieve MP3 link.        |
| `/recording/speech-to-text`   | POST    | Upload recording chunks for AI speech parsing            |