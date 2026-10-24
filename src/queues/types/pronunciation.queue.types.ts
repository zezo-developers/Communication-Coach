export interface IAnalyzePronunciationPayload {
  sessionId: string;
  userId: string;
  turnId: string;
  transcript: string;
  audioBase64: string;
  audioMimeType: string;
  audioFileName: string;
}

export interface IPronunciationExplanation {
  index: number;
  explanation: string;
}
