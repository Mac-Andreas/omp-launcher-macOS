// Gaming ping bands: up to 50 ms is excellent, 100 good, 150 playable, and
// anything above (including an unreachable server's timeout value) is poor.
// Light mode uses darker shades so they stay readable on a white background.
const PING_COLORS = {
  dark: ["#3FB950", "#D29922", "#DB6D28", "#F85149"],
  light: ["#1F883D", "#9A6700", "#BC4C00", "#CF222E"],
} as const;

// Colour for a ping in ms, or undefined when there is no measurement yet (0).
export const pingColor = (
  ping: number,
  themeType: "light" | "dark"
): string | undefined => {
  if (ping <= 0) return undefined;
  const [excellent, good, playable, poor] = PING_COLORS[themeType];
  if (ping <= 50) return excellent;
  if (ping <= 100) return good;
  if (ping <= 150) return playable;
  return poor;
};
