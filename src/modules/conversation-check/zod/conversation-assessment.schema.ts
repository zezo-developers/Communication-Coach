import type { z } from 'zod';

export async function getConversationAssessmentSchema() {
  const { z } = await import('zod');

  return z.object({
    scores: z.object({
      sentenceFraming: z.number().min(0).max(5),
      vocabulary: z.number().min(0).max(5),
      grammar: z.number().min(0).max(5),
      fluency: z.number().min(0).max(5),
      coherence: z.number().min(0).max(5),
      confidence: z.number().min(0).max(5),
    }),
    overallScore: z.number().min(0).max(5),
    level: z.enum(['beginner', 'intermediate', 'advanced']),
    strengths: z.array(z.string().min(1)),
    improvements: z.array(z.string().min(1)),
  });
}

export type ConversationAssessment = z.infer<
  Awaited<ReturnType<typeof getConversationAssessmentSchema>>
>;
