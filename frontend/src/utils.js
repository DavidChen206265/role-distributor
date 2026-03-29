export const TEXT_SHADOW =
  "text-shadow: 1px 1px 3px rgba(0,0,0,0.9), -1px -1px 3px rgba(0,0,0,0.9);";

export function hslToHex(h, s, l) {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function getRandomHexColor() {
  const h = Math.floor(Math.random() * 360);
  return hslToHex(h, 85, 65);
}

export function parseBatchList(text) {
  return text
    .split(/[\s,，]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
