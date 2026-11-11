import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, Layers, Link2, Plus, Rotate3D, Shuffle, Star } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { currentReviewId, type ReviewPile, type ReviewSource } from "../domain/reviewDeck";
import type { AtomicQuestion, SyncBlock } from "../domain/types";
import type { ReviewDeckController } from "../hooks/useReviewDeck";
import { AnswerOutline } from "./AnswerOutline";

type Direction = "previous" | "next";
type Card = AtomicQuestion | SyncBlock;
const SHUFFLE_MS = 2500;
const SHUFFLE_STOP = 0.88;

const smoothStep = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// Integral of a steady speed followed by smooth braking. Unlike changing an
// infinite animation's playback rate, this reaches a known angle exactly.
function shuffleTravel(progress: number) {
  const cruise = 0.25;
  const braking = SHUFFLE_STOP - cruise;
  const t = Math.max(0, Math.min(1, (progress - cruise) / braking));
  return (Math.min(progress, cruise) + braking * (t - t ** 3 + t ** 4 / 2)) / (cruise + braking / 2);
}

function Flashcard({
  card, source, number, total, preview, flipped, onOpen, onFlip, onFavorite, compact,
}: {
  card: Card;
  source: ReviewSource;
  number: number;
  total: number;
  preview: boolean;
  flipped: boolean;
  onOpen: () => void;
  onFlip: () => void;
  onFavorite: () => void;
  compact: boolean;
}) {
  const block = source === "aggregate" ? card as SyncBlock : undefined;
  const answer = block ? block.body : (card as AtomicQuestion).answer;
  const label = block ? "聚合块" : "原子问答";
  const length = Array.from(card.title).length;
  const linkProps = {
    role: "link",
    tabIndex: preview ? -1 : 0,
    onClick: onOpen,
    onKeyDown: (event: KeyboardEvent) => { if (event.key === "Enter") onOpen(); },
  };
  const header = (
    <header className="review-card-header">
      <span className="review-card-kind">{block ? <Layers size={13} aria-hidden="true" /> : <BookOpen size={13} aria-hidden="true" />}{label}</span>
      <span className="review-card-number">{String(number).padStart(2, "0")}<span> / {String(total).padStart(2, "0")}</span></span>
      <button className={`review-card-star${card.favorite ? " active" : ""}`} type="button"
        aria-label={card.favorite ? "取消收藏当前卡片" : "收藏当前卡片"} aria-pressed={Boolean(card.favorite)} onClick={onFavorite}>
        <Star size={18} fill={card.favorite ? "currentColor" : "none"} aria-hidden="true" />
      </button>
    </header>
  );
  const footer = (
    <footer className="review-card-footer">
      {block ? (
        <button type="button" className="review-related-link" onClick={onOpen} aria-label={`查看关联的 ${block.linkedQuestionIds.length} 个原子问答`}>
          <Link2 size={13} aria-hidden="true" /> 关联问答 <span className="review-related-count">{block.linkedQuestionIds.length}</span>
        </button>
      ) : <span className="review-atomic-caption">一问一答</span>}
      <button type="button" className="review-detail-link" onClick={onOpen}>查看详情 <ArrowRight size={13} aria-hidden="true" /></button>
    </footer>
  );
  return (
    <div className={`review-flipper${flipped ? " is-flipped" : ""}`}>
      <div className="review-card-face review-card-front" inert={preview || flipped} aria-hidden={preview || flipped || undefined}>
        {header}
        <div className="review-card-question">
          <span className="review-part-label">问题</span>
          <div className={`review-card-content-link review-question-link${length > 120 ? " is-extra-long" : length > (compact ? 28 : 55) ? " is-long" : ""}`}
            {...linkProps} aria-label={`查看${label}问题：${card.title}`}>
            <h2 id={preview ? undefined : "review-card-title"}>{card.title}</h2>
          </div>
        </div>
        <button className="review-flip-button" type="button" onClick={onFlip} aria-label="翻转卡片查看答案">
          <Rotate3D size={17} strokeWidth={1.4} aria-hidden="true" /> 翻转查看答案
        </button>
        {footer}
      </div>
      <div className="review-card-face review-card-back" inert={preview || !flipped} aria-hidden={preview || !flipped || undefined}>
        {header}
        <section className="review-card-answer" aria-label="卡片回答">
          <span className="review-part-label">{block ? "聚合回答" : "回答"}</span>
          <div className="review-card-content-link review-answer-link" {...linkProps} aria-label={`查看${label}回答详情`}>
            <AnswerOutline answer={answer} emptyText="还没有填写回答，点击前往详情补充。" />
          </div>
        </section>
        <button className="review-flip-button" type="button" onClick={onFlip} aria-label="翻转卡片回到问题">
          <Rotate3D size={17} strokeWidth={1.4} aria-hidden="true" /> 回到问题
        </button>
        {footer}
      </div>
    </div>
  );
}

export function ReviewCards({
  deck, syncBlocks, questions, onOpenSync, onOpenQuestion, onCreateSync, onCreateQuestion, onFavorite, compact = false,
}: {
  deck: ReviewDeckController;
  syncBlocks: SyncBlock[];
  questions: AtomicQuestion[];
  onOpenSync: (id: string) => void;
  onOpenQuestion: (id: string) => void;
  onCreateSync: () => void;
  onCreateQuestion: () => void;
  onFavorite: (source: ReviewSource, id: string, favorite: boolean) => void;
  compact?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const [step, setStep] = useState(0);
  const [offset, setOffset] = useState(0);
  const [turning, setTurning] = useState<Direction | null>(null);
  const [shufflePlan, setShufflePlan] = useState<ReviewPile | null>(null);
  const shufflePhase = shufflePlan ? "orbit" : null;
  const [announcement, setAnnouncement] = useState("");
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitioning = useRef(false);
  const shuffleCommit = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);
  const wheelGesture = useRef({ distance: 0, lastEvent: 0, locked: false });
  const findCard = (id: string | null) => deck.source === "aggregate"
    ? syncBlocks.find((block) => block.id === id && !block.hidden)
    : questions.find((question) => question.id === id);
  const card = findCard(deck.currentId);
  const availableBlocks = syncBlocks.filter((item) => !item.hidden).length;
  const today = new Intl.DateTimeFormat("zh-CN", { dateStyle: "full" }).format(new Date());

  useEffect(() => {
    setFlipped(false);
    setOffset(0);
    gesture.current = null;
  }, [deck.currentId, deck.source]);
  useEffect(() => () => {
    if (turnTimer.current) clearTimeout(turnTimer.current);
  }, []);
  useEffect(() => {
    if (!shufflePlan) return;
    const stage = stageRef.current!;
    const stack = stage.querySelector(".review-card-stack")!;
    const axis = stage.querySelector(".review-carousel-axis")!.getBoundingClientRect();
    const box = stack.getBoundingClientRect();
    const radiusX = axis.width / 2;
    const radiusY = axis.height / 2;
    const axisX = axis.left + radiusX - box.left - box.width / 2;
    const axisY = axis.top - box.top - box.height / 2;
    const animations = Array.from(stack.querySelectorAll<HTMLElement>(".review-card")).map((element) => {
      // Every animated node is already the actual card in its final slot.
      // Capture the responsive resting transform rather than approximating it.
      const position = Number(element.dataset.shufflePosition);
      const rest = getComputedStyle(element);
      const matrix = new DOMMatrixReadOnly(rest.transform);
      const restScale = Math.hypot(matrix.a, matrix.b);
      const restAngle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
      const restOpacity = Number(rest.opacity);
      const restFilter = rest.filter;
      const restTransform = rest.transform;
      const frames = Array.from({ length: 151 }, (_, index): Keyframe => {
        const progress = index / 150;
        const angle = (shuffleTravel(progress) + position / 7) * Math.PI * 2;
        const depth = (1 + Math.cos(angle)) / 2;
        const entering = smoothStep(progress / 0.08);
        const landing = smoothStep((progress - 0.58) / (SHUFFLE_STOP - 0.58));
        const orbitWeight = entering * (1 - landing);
        const blend = (orbit: number, final: number) => final + (orbit - final) * orbitWeight;
        return {
          offset: progress,
          transform: progress >= SHUFFLE_STOP ? restTransform
            : `translate3d(${blend(axisX + radiusX * Math.sin(angle), matrix.m41)}px, ${blend(axisY + radiusY * (1 - Math.cos(angle)), matrix.m42)}px, 0) rotate(${blend(Math.sin(angle) * 16, restAngle)}deg) scale(${blend(0.5 + 0.5 * depth, restScale)})`,
          opacity: progress >= SHUFFLE_STOP ? restOpacity
            : blend(0.18 + 0.82 * depth, restOpacity) * entering,
          filter: progress >= SHUFFLE_STOP ? restFilter : `brightness(${blend(0.7 + 0.3 * depth, position === 0 ? 1 : 0.87)}) saturate(${blend(0.5 + 0.5 * depth, position === 0 ? 1 : 0.45)})`,
          zIndex: progress >= SHUFFLE_STOP ? rest.zIndex : String(Math.round(blend(1 + depth * 6, Number(rest.zIndex)))),
        };
      });
      return element.animate(frames, { duration: SHUFFLE_MS, easing: "linear", fill: "both" });
    });
    // Stop at 2.2s, hold the exact resting geometry for 0.3s, then remove only
    // the animation. The card node, title, number and dimensions remain intact.
    animations.find((animation) => (animation.effect as KeyframeEffect).target?.classList.contains("review-card-active"))!.onfinish = () => {
      shuffleCommit.current?.();
      shuffleCommit.current = null;
      setShufflePlan(null);
      transitioning.current = false;
      setAnnouncement("洗牌完成，新的顺序已就绪");
    };
    return () => animations.forEach((animation) => animation.cancel());
  }, [shufflePlan]);

  const openCard = () => {
    if (!card || transitioning.current) return;
    if (deck.source === "aggregate") onOpenSync(card.id);
    else onOpenQuestion(card.id);
  };
  const flipCard = () => {
    if (!card || transitioning.current) return;
    const nextFlipped = !flipped;
    // The old face becomes inert; retain focus on the matching new-face control.
    const focused = stageRef.current?.querySelector(".review-flip-button:focus");
    setFlipped(nextFlipped);
    setAnnouncement(nextFlipped ? "已翻到答案面" : "已回到问题面");
    if (focused) requestAnimationFrame(() => {
      stageRef.current?.querySelector<HTMLButtonElement>(
        `.review-card-active .review-card-${nextFlipped ? "back" : "front"} .review-flip-button`,
      )?.focus({ preventScroll: true });
    });
  };
  const turn = (direction: Direction) => {
    if (!card || deck.total < 2 || transitioning.current) { setOffset(0); return; }
    transitioning.current = true;
    // Moving focus out of the departing card avoids an inert focused control.
    if (stageRef.current?.querySelector(".review-card-active")?.contains(document.activeElement)) {
      stageRef.current.focus({ preventScroll: true });
    }
    setTurning(direction);
    setOffset(0);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
    turnTimer.current = setTimeout(() => {
      if (direction === "next") deck.next();
      else deck.previous();
      setStep((value) => value + (direction === "next" ? 1 : -1));
      setFlipped(false);
      setTurning(null);
      transitioning.current = false;
      turnTimer.current = null;
      setAnnouncement(`已切换到${direction === "next" ? "下一张" : "上一张"}`);
    }, delay);
  };
  const shuffle = () => {
    const stage = stageRef.current;
    if (!card || deck.total < 2 || transitioning.current || !stage) return;
    transitioning.current = true;
    const restoreFocus = document.activeElement?.classList.contains("review-shuffle-button");
    gesture.current = null;
    suppressClick.current = false;
    setOffset(0);
    setFlipped(false);
    const planned = deck.prepareReshuffle();
    setStep(0);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const commit = () => {
      deck.reshuffle(planned);
      if (restoreFocus && (document.activeElement === document.body || document.activeElement?.classList.contains("review-shuffle-button"))) {
        requestAnimationFrame(() =>
          stageRef.current?.closest(".review-hero")?.querySelector<HTMLButtonElement>(".review-shuffle-button")?.focus({ preventScroll: true }),
        );
      }
    };
    if (reduced) {
      commit();
      transitioning.current = false;
      setAnnouncement("洗牌完成，新的顺序已就绪");
    } else {
      shuffleCommit.current = commit;
      setShufflePlan(planned);
      setAnnouncement("正在洗牌");
    }
  };
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.25) return;
    event.preventDefault();
    const wheel = wheelGesture.current;
    const now = Date.now();
    if (now - wheel.lastEvent > 220) { wheel.distance = 0; wheel.locked = false; }
    wheel.lastEvent = now;
    if (wheel.locked || transitioning.current) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stageRef.current?.clientWidth ?? 1 : 1;
    wheel.distance += event.deltaX * unit;
    if (Math.abs(wheel.distance) < 85) return;
    const direction = wheel.distance > 0 ? "next" : "previous";
    wheel.locked = true;
    wheel.distance = 0;
    turn(direction);
  });
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, []);
  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !event.isPrimary || transitioning.current) return;
    suppressClick.current = false;
    if ((event.target as HTMLElement).closest("button, a, input, textarea, summary")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
  };
  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (!start.active) {
      if (Math.abs(y) > 12 && Math.abs(y) > Math.abs(x)) { gesture.current = null; return; }
      if (Math.abs(x) < 12 || Math.abs(x) < Math.abs(y) * 1.25) return;
      start.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    suppressClick.current = true;
    setOffset(Math.max(-180, Math.min(180, x)));
  };
  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!start.active) return;
    const x = event.clientX - start.x;
    const threshold = Math.max(48, Math.min(90, event.currentTarget.clientWidth * 0.2));
    if (Math.abs(x) >= threshold) turn(x > 0 ? "previous" : "next");
    else setOffset(0);
  };
  const changeSource = (source: ReviewSource) => {
    if (transitioning.current || source === deck.source) return;
    setAnnouncement("");
    setStep(0);
    deck.setSource(source);
  };
  const shift = turning === "next" ? -1 : turning === "previous" ? 1 : 0;
  return (
    <section className={`review-hero${compact ? " review-hero-compact" : ""}`} aria-label="闪卡复习" aria-busy={Boolean(shufflePhase)}>
      {compact ? <div className="home-review-intro">
        <p>01 / 今日复习</p>
      </div> : null}
      <header className="review-hero-header">
        {!compact ? <p className="eyebrow">
          <span className="review-date-full">{today}</span>
          <span className="review-date-compact">{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date())}</span>
        </p> : null}
        <div className="review-hero-controls">
          <div className="review-source-picker" aria-label="卡片内容">
            <button type="button" disabled={Boolean(shufflePhase)} aria-pressed={deck.source === "aggregate"} onClick={() => changeSource("aggregate")}><Layers size={14} aria-hidden="true" /> 聚合块</button>
            <button type="button" disabled={Boolean(shufflePhase)} aria-pressed={deck.source === "question"} onClick={() => changeSource("question")}><BookOpen size={14} aria-hidden="true" /> 原子问答</button>
          </div>
          {card ? <button className="review-shuffle-button" type="button" aria-label="洗牌"
            aria-busy={Boolean(shufflePhase)} disabled={Boolean(turning) || Boolean(shufflePhase) || deck.total < 2} onClick={shuffle}>
            <Shuffle size={14} strokeWidth={1.5} aria-hidden="true" /> 洗牌
          </button> : null}
        </div>
      </header>
      <div className={`review-stage${shufflePhase ? ` is-shuffling-${shufflePhase}` : ""}`} ref={stageRef} role="group" tabIndex={0}
        aria-label="闪卡轮盘，左方向键上一张，右方向键下一张，空格翻面"
        onKeyDown={(event) => {
          if (event.altKey || event.metaKey || event.ctrlKey || (event.target as HTMLElement).closest("button, input, textarea, [role='link']")) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault(); turn(event.key === "ArrowLeft" ? "previous" : "next");
          } else if (event.key === " ") { event.preventDefault(); flipCard(); }
        }}>
        <div className="review-carousel-axis" aria-hidden="true"><span /></div>
        <div className={`review-card-stack${turning ? " is-turning" : ""}${offset ? " is-dragging" : ""}${shufflePhase ? ` is-shuffling-${shufflePhase}` : ""}`}
          style={{ "--drag-x": `${offset}px` } as CSSProperties}>
          {(card ? deck.total > 1 ? [-3, -2, -1, 0, 1, 2, 3] : [0] : []).map((position) => {
            const item = findCard(shufflePlan ? currentReviewId(shufflePlan, position) : deck.idAt(position));
            if (!item) return null;
            const preview = position !== 0;
            const visualPosition = position + shift;
            // Virtual indices preserve the incoming card's DOM node as it reaches
            // the centre, including cyclic decks with only two cards.
            return (
              <article key={`${deck.source}-${step + position}-${item.id}`}
                className={`review-card ${preview ? "review-card-preview" : "review-card-active"}`}
                data-position={Math.max(-2, Math.min(2, visualPosition))}
                data-card-id={item.id}
                data-shuffle-position={position}
                inert={preview || Boolean(turning) || Boolean(shufflePhase)} aria-hidden={preview || undefined}
                aria-label={`${flipped ? "回答" : "问题"}闪卡`}
                onPointerDown={preview ? undefined : pointerDown} onPointerMove={preview ? undefined : pointerMove}
                onPointerUp={preview ? undefined : pointerUp}
                onPointerCancel={preview ? undefined : () => { gesture.current = null; setOffset(0); }}
                onClickCapture={preview ? undefined : (event) => {
                  if (suppressClick.current && event.detail !== 0) {
                    event.preventDefault(); event.stopPropagation(); suppressClick.current = false;
                  }
                }}>
                <Flashcard card={item} source={deck.source} number={(((shufflePlan ? 0 : deck.number - 1) + position) % deck.total + deck.total) % deck.total + 1}
                  total={deck.total} preview={preview} flipped={!preview && flipped} compact={compact}
                  onOpen={openCard} onFlip={flipCard} onFavorite={() => {
                    if (transitioning.current || preview) return;
                    try {
                      onFavorite(deck.source, item.id, !item.favorite);
                      setAnnouncement(item.favorite ? "已取消收藏" : "已加入收藏夹");
                    } catch (reason) { setAnnouncement(reason instanceof Error ? reason.message : "收藏失败，请重试。"); }
                  }} />
              </article>
            );
          })}
          {!card ? (
            <div className="review-card review-card-empty" data-position="0">
              <span className="review-empty-mark" aria-hidden="true"><Layers size={34} strokeWidth={1.2} /></span>
              <p className="review-part-label">从一张卡片开始</p>
              <h1>{deck.source === "aggregate" ? "把零散的回答，\n汇成自己的见解。" : "你的第一张卡片，\n从一个问题开始。"}</h1>
              <p>{deck.source === "aggregate" ? "创建聚合块，整理可复用的回答；也可以先用原子问答来抽卡。" : "添加原子问答，把值得记住的问题放进这一叠卡片。"}</p>
              <div className="review-empty-actions">
                <button className="button primary" type="button" onClick={deck.source === "aggregate" ? onCreateSync : onCreateQuestion}>
                  <Plus size={16} aria-hidden="true" />{deck.source === "aggregate" ? "创建聚合块" : "添加原子问答"}
                </button>
                {deck.source === "aggregate" && questions.length ? (
                  <button className="button secondary" type="button" onClick={() => changeSource("question")}>用原子问答抽卡 <ArrowRight size={15} aria-hidden="true" /></button>
                ) : deck.source === "question" && availableBlocks ? (
                  <button className="button secondary" type="button" onClick={() => changeSource("aggregate")}>用聚合块抽卡 <ArrowRight size={15} aria-hidden="true" /></button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {shufflePhase ? <span className="review-shuffle-status" aria-hidden="true">
          {shufflePhase === "orbit" ? "正在洗牌" : "新的顺序已就绪"}
        </span> : null}
        {card && deck.total > 1 ? <>
          <button type="button" className="review-edge review-edge-previous" aria-label="上一张卡片" onClick={() => turn("previous")} disabled={Boolean(turning) || Boolean(shufflePhase)}>
            <span><ArrowLeft size={22} strokeWidth={1.5} aria-hidden="true" /></span><small>上一张</small>
          </button>
          <button type="button" className="review-edge review-edge-next" aria-label="下一张卡片" onClick={() => turn("next")} disabled={Boolean(turning) || Boolean(shufflePhase)}>
            <span><ArrowRight size={22} strokeWidth={1.5} aria-hidden="true" /></span><small>下一张</small>
          </button>
        </> : null}
      </div>
      <footer className="review-hero-footer">
        <span className="review-gesture-hint"><ArrowLeft size={13} aria-hidden="true" /> 左右滑动切换 <ArrowRight size={13} aria-hidden="true" /><i aria-hidden="true" /> 点击翻面查看答案</span>
        {!compact ? <button type="button" className="review-scroll-cue" onClick={(event) => {
          event.currentTarget.closest(".overview-page")?.querySelector(".overview-content")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
        }}>收藏与近况 <ArrowDown size={13} aria-hidden="true" /></button> : null}
      </footer>
      <span className="review-announcement" role="status" aria-live="polite">{announcement}</span>
    </section>
  );
}
