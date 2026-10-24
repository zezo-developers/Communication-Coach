import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class DigitalOceanService {
  private readonly client: OpenAI;

  constructor(private readonly configService: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('DIGITALOCEAN_API_KEY'),
      baseURL: 'https://inference.do-ai.run/v1',
    });
  }

  async testModel(prompt: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.configService.getOrThrow<string>('DIGITALOCEAN_MODEL'),
        messages: [{ role: 'user', content: prompt }],
      });

      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      console.error('DigitalOcean model error:', error);
      throw new InternalServerErrorException(
        'Failed to generate response from DigitalOcean',
      );
    }
  }
}
