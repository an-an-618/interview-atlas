import { invoke, isTauri } from "@tauri-apps/api/core";
import { SHARE_GITHUB_URL, shareKindLabels, type ShareDocument, type ShareOptions } from "../domain/share";
import {
  SHARE_WIDTH, SHARE_HEIGHT, SHARE_MARGIN, shareTextStyles,
  type SharePage, type TextStyle,
} from "../domain/shareLayout";

const sans = '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif';
const serif = '"Source Serif 4", "Songti SC", "STSong", serif';

export function shareFont(style: TextStyle) {
  const config = shareTextStyles[style];
  return `${config.weight} ${config.size}px ${config.family === "serif" ? serif : sans}`;
}

export async function loadShareFonts() {
  await Promise.all([
    document.fonts.load(`400 32px ${sans}`),
    document.fonts.load(`500 50px ${serif}`),
    document.fonts.load(`500 24px ${sans}`),
  ]);
  await document.fonts.ready;
}

export function createShareMeasure() {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) throw new Error("当前环境无法生成图片。");
  return (text: string, style: TextStyle) => {
    context.font = shareFont(style);
    return context.measureText(text).width;
  };
}

/** Quiet paper grain and a fine botanical line, drawn entirely on-device. */
function drawStationery(ctx: CanvasRenderingContext2D) {
  const paper = ctx.createLinearGradient(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  paper.addColorStop(0, "#fffdf6");
  paper.addColorStop(0.5, "#faf6eb");
  paper.addColorStop(1, "#f5efdf");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, SHARE_WIDTH, SHARE_HEIGHT);
  let seed = 618;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = "rgba(113, 92, 57, 0.045)";
  for (let i = 0; i < 7000; i++) {
    const x = random() * SHARE_WIDTH;
    const y = random() * SHARE_HEIGHT;
    ctx.fillRect(x, y, 0.5 + random(), 0.5 + random());
  }
  ctx.strokeStyle = "#ded2b8";
  ctx.lineWidth = 1;
  ctx.strokeRect(42.5, 42.5, SHARE_WIDTH - 85, SHARE_HEIGHT - 85);
  ctx.strokeStyle = "#d9c5a5";
  ctx.beginPath();
  ctx.moveTo(SHARE_MARGIN, 112);
  ctx.lineTo(SHARE_MARGIN + 46, 112);
  ctx.stroke();
  const sprig = (x: number, y: number, flipped = false) => {
    ctx.save();
    ctx.translate(x, y);
    if (flipped) ctx.rotate(Math.PI);
    ctx.strokeStyle = "rgba(164, 135, 93, 0.48)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 36);
    ctx.bezierCurveTo(22, 27, 32, 5, 62, -10);
    ctx.stroke();
    for (const [lx, ly, angle] of [[14, 27, -1.1], [28, 13, -0.3], [42, 2, -1.1], [55, -6, -0.3]]) {
      ctx.save();
      ctx.translate(lx!, ly!);
      ctx.rotate(angle!);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(0, -7, 11, -13, 18, -11);
      ctx.bezierCurveTo(14, -3, 6, 1, 0, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };
  sprig(SHARE_WIDTH - 156, 86);
  sprig(SHARE_WIDTH - SHARE_MARGIN, SHARE_HEIGHT - 86, true);
}

export function renderSharePage(
  document: ShareDocument, page: SharePage, index: number, total: number, options: ShareOptions,
): HTMLCanvasElement {
  const canvas = window.document.createElement("canvas");
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前环境无法生成图片。");
  drawStationery(ctx);
  ctx.textBaseline = "top";
  if (document.kind !== "question") {
    ctx.font = `400 21px ${serif}`;
    ctx.fillStyle = "#9d8062";
    ctx.fillText(shareKindLabels[document.kind], SHARE_MARGIN, 77);
  }
  for (const line of page.lines) {
    // Each answer line rests above a soft stationery rule, including blank lines.
    if (line.style === "body") {
      ctx.strokeStyle = "rgba(171, 151, 118, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(SHARE_MARGIN, line.y + shareTextStyles.body.height - 3);
      ctx.lineTo(SHARE_WIDTH - SHARE_MARGIN, line.y + shareTextStyles.body.height - 3);
      ctx.stroke();
    }
    if (line.marker) {
      ctx.font = `400 20px ${serif}`;
      ctx.fillStyle = "#b49877";
      ctx.fillText(line.marker, SHARE_MARGIN, line.y + 9);
    }
    ctx.font = shareFont(line.style);
    ctx.fillStyle = shareTextStyles[line.style].color;
    ctx.fillText(line.text, line.x ?? SHARE_MARGIN, line.y + 5);
  }
  if (options.watermark) {
    ctx.strokeStyle = "#ded2b8";
    ctx.beginPath();
    ctx.moveTo(SHARE_MARGIN, 1326);
    ctx.lineTo(SHARE_WIDTH - SHARE_MARGIN, 1326);
    ctx.stroke();
    ctx.fillStyle = "#8b7964";
    ctx.font = `500 22px ${serif}`;
    ctx.fillText("「见字·如面」提供制图支持", SHARE_MARGIN, 1345);
    ctx.font = `400 18px ${sans}`;
    ctx.fillStyle = "#a28f76";
    ctx.fillText(`产品地址：${SHARE_GITHUB_URL}`, SHARE_MARGIN, 1374);
  }
  if (total > 1) {
    ctx.font = `400 20px ${serif}`;
    ctx.fillStyle = "#a28f76";
    ctx.textAlign = "right";
    ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, SHARE_WIDTH - SHARE_MARGIN, 1371);
  }
  return canvas;
}

export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("图片生成失败，请重试。")),
    "image/png",
  ));
}

export interface ShareImageFile { name: string; blob: Blob }

export async function downloadShareImages(files: ShareImageFile[]): Promise<"desktop" | "browser"> {
  if (isTauri()) {
    // One image at a time bounds memory, including large multi-page interviews.
    for (const file of files) {
      const bytes = Array.from(new Uint8Array(await file.blob.arrayBuffer()));
      await invoke("save_share_image", { name: file.name, bytes });
    }
    return "desktop";
  }
  for (const file of files) {
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Allow the browser to consume the blob before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return "browser";
}
