import { answerPoints } from "../domain/answerFormat";

export function AnswerOutline({
  answer,
  emptyText = "尚未填写回答。",
  className = "",
}: {
  answer: string;
  emptyText?: string;
  className?: string;
}) {
  const points = answerPoints(answer);
  const classes = ["answer-outline", className].filter(Boolean).join(" ");

  if (!points.length) {
    return <p className={`${classes} muted`}>{emptyText}</p>;
  }

  if (points.length === 1) {
    return <p className={`${classes} single`}>{points[0]}</p>;
  }

  return (
    <ol className={`${classes} multiple`}>
      {points.map((point, index) => (
        <li key={`${index}-${point}`}>
          <span className="answer-outline-node" aria-hidden="true" />
          <p>{point}</p>
        </li>
      ))}
    </ol>
  );
}
