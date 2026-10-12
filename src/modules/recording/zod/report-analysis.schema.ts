export async function getReportAnalysisSchema() {
  const { z } = await import('zod');

  const scoreSchema = z.object({
    score: z.number().min(0).max(5),
    feedback: z.string().min(1),
  });

  const starSectionSchema = z.object({
    situation: scoreSchema,
    task: scoreSchema,
    action: scoreSchema,
    result: scoreSchema,
    overallScore: z.number().min(0).max(5),
  });

  return z.object({
    summary: z.string().min(1),
    strengths: z.array(z.string()).default([]),
    growthPoints: z.array(z.string()).default([]),
    tones: z.array(z.string()).default([]),
    overallScore: z.number().min(0).max(5),
    activeListening: scoreSchema,
    conciseness: scoreSchema,
    star: starSectionSchema,
  });
}
