import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  ProminentPeople
} from '@google/genai'

export type GeneratedImage = { base64: string; mimeType: string }

export type ImageGenerator = (prompt: string) => Promise<GeneratedImage>

// Thrown when the model's safety filters refuse the prompt or the result.
export class ImageBlockedError extends Error {}

// Thrown when Vertex is out of per-minute quota for the model (HTTP 429).
export class ImageBusyError extends Error {}

const BLOCKED: ReadonlySet<string> = new Set([
  FinishReason.BLOCKLIST,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
  FinishReason.IMAGE_SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SAFETY,
  FinishReason.SPII
])

// Stricter than the default (medium) threshold: the cards are a friendly
// cartoon style, so a false "try a different idea" beats letting it through.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_IMAGE_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_IMAGE_HARASSMENT,
  HarmCategory.HARM_CATEGORY_IMAGE_HATE,
  HarmCategory.HARM_CATEGORY_IMAGE_SEXUALLY_EXPLICIT
].map(category => ({
  category,
  threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE
}))

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
    const response = await ai.models
      .generateContent({
        config: {
          imageConfig: {
            aspectRatio: '1:1',
            // It's a creature lab: never draw people, let alone real ones.
            // Vertex rejects the SDK's PersonGeneration.DONT_ALLOW enum value;
            // the field's documented values are ALLOW_ALL/ALLOW_ADULT/ALLOW_NONE.
            personGeneration: 'ALLOW_NONE',
            prominentPeople: ProminentPeople.BLOCK_PROMINENT_PEOPLE
          },
          responseModalities: ['IMAGE'],
          safetySettings: SAFETY_SETTINGS
        },
        contents: prompt,
        model
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 429) {
          throw new ImageBusyError(error.message)
        }
        throw error
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
