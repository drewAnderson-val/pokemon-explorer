import { FinishReason, GoogleGenAI } from '@google/genai'

export type GeneratedImage = { base64: string; mimeType: string }

export type ImageGenerator = (prompt: string) => Promise<GeneratedImage>

// Thrown when the model's safety filters refuse the prompt or the result.
export class ImageBlockedError extends Error {}

const BLOCKED: ReadonlySet<string> = new Set([
  FinishReason.BLOCKLIST,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
  FinishReason.IMAGE_SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SAFETY,
  FinishReason.SPII
])

// Nano Banana on Vertex AI. No API key: it authenticates as the Cloud Run
// service account (locally, `gcloud auth application-default login`).
export function createVertexImageGenerator({
  model,
  project
}: {
  model: string
  project: string
}): ImageGenerator {
  // The newer image models are served from the global endpoint only.
  const ai = new GoogleGenAI({ location: 'global', project, vertexai: true })

  return async prompt => {
    const response = await ai.models.generateContent({
      config: {
        imageConfig: { aspectRatio: '1:1' },
        responseModalities: ['IMAGE']
      },
      contents: prompt,
      model
    })
    const candidate = response.candidates?.[0]
    if (
      response.promptFeedback?.blockReason ||
      (candidate?.finishReason && BLOCKED.has(candidate.finishReason))
    ) {
      throw new ImageBlockedError('The image was blocked by safety filters')
    }
    const image = candidate?.content?.parts?.find(
      part => part.inlineData?.data
    )?.inlineData
    if (!image?.data) {
      throw new Error(
        `No image in the response (finishReason ${candidate?.finishReason ?? 'none'})`
      )
    }
    return { base64: image.data, mimeType: image.mimeType ?? 'image/png' }
  }
}
