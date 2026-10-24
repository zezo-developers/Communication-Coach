import { OpenAIProvider, setDefaultModelProvider } from '@openai/agents';

const DEFAULT_DIGITALOCEAN_BASE_URL = 'https://inference.do-ai.run/v1';
const DEFAULT_DIGITALOCEAN_MODEL = 'llama3.3-70b-instruct';

let configuredApiKey: string | undefined;
let configuredBaseUrl: string | undefined;

export function getDigitalOceanBaseURL(): string {
  return process.env.DIGITALOCEAN_BASE_URL || DEFAULT_DIGITALOCEAN_BASE_URL;
}

export function configureDigitalOceanAgent(): string {
  const apiKey = process.env.DIGITALOCEAN_API_KEY;
  if (!apiKey) {
    throw new Error('DIGITALOCEAN_API_KEY is not configured');
  }

  const baseURL = getDigitalOceanBaseURL();
  const model = process.env.DIGITALOCEAN_MODEL || DEFAULT_DIGITALOCEAN_MODEL;
  if (apiKey !== configuredApiKey || baseURL !== configuredBaseUrl) {
    setDefaultModelProvider(
      new OpenAIProvider({
        apiKey,
        baseURL,
        useResponses: false,
      }),
    );
    configuredApiKey = apiKey;
    configuredBaseUrl = baseURL;
  }

  return model;
}
