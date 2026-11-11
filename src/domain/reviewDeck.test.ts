import { describe, expect, it } from "vitest";
import {
  advanceReviewPile,
  currentReviewId,
  reconcileReviewPile,
  reshuffleReviewPile,
  shuffleReviewIds,
} from "./reviewDeck";
import { createDemoWorkspace } from "../data/demo";
import { setQuestionFavorite, updateQuestion } from "./workspace";

describe("session review cards", () => {
  it("shuffles every item once without mutating the source", () => {
    const ids = ["a", "b", "c", "d"];
    expect(shuffleReviewIds(ids, () => 0)).toEqual(["b", "c", "d", "a"]);
    expect(ids).toEqual(["a", "b", "c", "d"]);
    expect(shuffleReviewIds(["a", "a", "b"], () => 0)).toEqual(["b", "a"]);
    expect(shuffleReviewIds([])).toEqual([]);
    expect(shuffleReviewIds(["a"])).toEqual(["a"]);
  });

  it("navigates in both directions and wraps without changing the shuffled order", () => {
    let pile = { order: ["c", "a", "b"], cursor: 0 };
    for (const id of ["c", "a", "b"]) {
      expect(currentReviewId(pile)).toBe(id);
      pile = advanceReviewPile(pile);
    }
    expect(currentReviewId(pile)).toBe("c");
    pile = advanceReviewPile(pile, -1);
    expect(currentReviewId(pile)).toBe("b");
    expect(currentReviewId(pile, 1)).toBe("c");
    expect(currentReviewId(pile, -1)).toBe("a");
    expect(pile.order).toEqual(["c", "a", "b"]);
    const empty = { order: [], cursor: 0 };
    const single = { order: ["a"], cursor: 0 };
    expect(currentReviewId(empty)).toBeNull();
    expect(advanceReviewPile(empty, -1)).toBe(empty);
    expect(advanceReviewPile(single)).toBe(single);
  });

  it("retains session order and progress across edits, additions and removals", () => {
    const pile = { order: ["c", "a", "b"], cursor: 1 };
    expect(reconcileReviewPile(pile, ["a", "b", "c"])).toEqual(pile);
    const changed = reconcileReviewPile(pile, ["a", "b", "d", "e"], () => 0);
    expect(changed).toEqual({ order: ["a", "b", "e", "d"], cursor: 0 });
    expect(currentReviewId(changed)).toBe("a");
    expect(currentReviewId(reconcileReviewPile(pile, ["b", "c"]))).toBe("b");
    expect(reconcileReviewPile(pile, [])).toEqual({ order: [], cursor: 0 });
  });

  it("reshuffles the same membership, resets position and avoids an identical result", () => {
    const pile = { order: ["a", "b", "c"], cursor: 2 };
    const shuffled = reshuffleReviewPile(pile, () => 0);
    expect(shuffled).toEqual({ order: ["b", "c", "a"], cursor: 0 });
    expect(reshuffleReviewPile(pile, () => 0.999)).toEqual(shuffled);
    expect(pile).toEqual({ order: ["a", "b", "c"], cursor: 2 });
    expect(reshuffleReviewPile({ order: ["a", "b"], cursor: 1 }, () => 0.999)).toEqual({ order: ["b", "a"], cursor: 0 });
    expect(reshuffleReviewPile({ order: [], cursor: 0 })).toEqual({ order: [], cursor: 0 });
    expect(reshuffleReviewPile({ order: ["a"], cursor: 0 })).toEqual({ order: ["a"], cursor: 0 });
  });

  it("favorites atomic cards without changing content or relationships", () => {
    const workspace = createDemoWorkspace();
    const original = workspace.questions[0];
    const next = setQuestionFavorite(workspace, original.id, true);
    expect(next.questions[0]).toMatchObject({ ...original, updatedAt: expect.any(String), favorite: true });
    expect(original.favorite).toBeUndefined();
    expect(next.syncBlocks).toBe(workspace.syncBlocks);
    expect(setQuestionFavorite(next, original.id, true)).toBe(next);
    const edited = updateQuestion(next, original.id, { title: original.title, answer: "新回答", notes: original.notes, tags: original.tags }).workspace;
    expect(edited.questions[0].favorite).toBe(true);
    expect(setQuestionFavorite(edited, original.id, false).questions[0].favorite).toBe(false);
    expect(() => setQuestionFavorite(workspace, "missing", true)).toThrow("Question not found");
  });
});
