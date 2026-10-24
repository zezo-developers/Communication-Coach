export async function getEnhancedConversationSchema() {
  const { z } = await import('zod');

  const vocabularySchema = z.object({
    word: z.string().min(1),
    meaning: z.string().min(1),
    exampleWordInSentence: z.string().min(1),
  });

  return z.object({
    naturalSentence: z.string().min(1),
    vocabularyItems: z.array(vocabularySchema),
  });
}
