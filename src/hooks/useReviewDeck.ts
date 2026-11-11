import { useLayoutEffect, useState } from "react";
import {
  advanceReviewPile,
  currentReviewId,
  reconcileReviewPile,
  reshuffleReviewPile,
  type ReviewPile,
  type ReviewSource,
} from "../domain/reviewDeck";
import type { AtomicQuestion, SyncBlock } from "../domain/types";

export function useReviewDeck(
  syncBlocks: SyncBlock[],
  questions: AtomicQuestion[],
  loading: boolean,
) {
  const [source, setSource] = useState<ReviewSource>("aggregate");
  const [piles, setPiles] = useState<Record<ReviewSource, ReviewPile>>({
    aggregate: { order: [], cursor: 0 },
    question: { order: [], cursor: 0 },
  });
  // Only membership changes rebuild the piles; editing an answer never reshuffles.
  const aggregateIds = JSON.stringify(syncBlocks.filter((block) => !block.hidden).map((block) => block.id));
  const questionIds = JSON.stringify(questions.map((question) => question.id));
  useLayoutEffect(() => {
    if (loading) return;
    setPiles((previous) => ({
      aggregate: reconcileReviewPile(previous.aggregate, JSON.parse(aggregateIds)),
      question: reconcileReviewPile(previous.question, JSON.parse(questionIds)),
    }));
  }, [loading, aggregateIds, questionIds]);

  const pile = piles[source];
  return {
    source,
    setSource,
    currentId: currentReviewId(pile),
    idAt: (offset: number) => currentReviewId(pile, offset),
    total: pile.order.length,
    number: pile.cursor + 1,
    next: () => setPiles((previous) => ({
      ...previous,
      [source]: advanceReviewPile(previous[source]),
    })),
    previous: () => setPiles((previous) => ({
      ...previous,
      [source]: advanceReviewPile(previous[source], -1),
    })),
    prepareReshuffle: () => reshuffleReviewPile(pile),
    reshuffle: (planned: ReviewPile = reshuffleReviewPile(pile)) => setPiles((previous) => ({
      ...previous,
      // Commit exactly the order animated, while respecting any source items
      // removed or added by a workspace update during the animation.
      [source]: reconcileReviewPile(planned, previous[source].order),
    })),
  };
}

export type ReviewDeckController = ReturnType<typeof useReviewDeck>;
