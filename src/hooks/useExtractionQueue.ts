import { useEffect, useRef, useState } from "react";
import { ExtractionQueue, type SaveTask } from "../ai/extractionQueue";
import type { AIClient, AIProviderConfig } from "../ai/types";
import type { Interview, SyncBlock } from "../domain/types";

export function useExtractionQueue(
  client: AIClient,
  config: AIProviderConfig,
  apiKey: string,
  syncBlocks: SyncBlock[],
  save: SaveTask,
) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const [queue] = useState(() => new ExtractionQueue((...args) => saveRef.current(...args)));
  useEffect(() => () => queue.dispose(), [queue]);
  return {
    start: (interview: Interview) => queue.enqueue(interview, (signal, onProgress) =>
      client.extractInterview(config, apiKey, { interview, syncBlocks }, signal, onProgress)),
    cancel: (interviewId: string) => queue.cancel(interviewId),
    reset: () => queue.reset(),
  };
}
