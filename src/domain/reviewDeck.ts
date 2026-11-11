export type ReviewSource = "aggregate" | "question";

export interface ReviewPile {
  order: string[];
  cursor: number;
}

export function shuffleReviewIds(
  ids: readonly string[],
  random: () => number = Math.random,
): string[] {
  const order = [...new Set(ids)];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

/** Keep this session's order and progress when content or favorites change. */
export function reconcileReviewPile(
  pile: ReviewPile,
  ids: readonly string[],
  random: () => number = Math.random,
): ReviewPile {
  const available = new Set(ids);
  const previous = new Set(pile.order);
  const order = [
    ...pile.order.filter((id) => available.has(id)),
    ...shuffleReviewIds(ids.filter((id) => !previous.has(id)), random),
  ];
  // Prefer the same card; if removed, continue to its next surviving neighbour.
  const current = currentReviewId(pile);
  const successor = pile.order.slice(pile.cursor).concat(pile.order.slice(0, pile.cursor))
    .find((id) => available.has(id));
  const cursor = order.indexOf(current && available.has(current) ? current : successor ?? "");
  return {
    order,
    cursor: Math.max(0, cursor),
  };
}

export function currentReviewId(pile: ReviewPile, offset = 0): string | null {
  const length = pile.order.length;
  return length ? pile.order[((pile.cursor + offset) % length + length) % length] : null;
}

export function advanceReviewPile(pile: ReviewPile, direction: 1 | -1 = 1): ReviewPile {
  return pile.order.length > 1
    ? { ...pile, cursor: (pile.cursor + direction + pile.order.length) % pile.order.length }
    : pile;
}

export function reshuffleReviewPile(pile: ReviewPile, random: () => number = Math.random): ReviewPile {
  const order = shuffleReviewIds(pile.order, random);
  // Make a deliberate reshuffle perceptible even when randomness returns the
  // identical permutation (common with only two cards).
  if (order.length > 1 && order.every((id, index) => id === pile.order[index])) {
    order.push(order.shift()!);
  }
  return { order, cursor: 0 };
}
