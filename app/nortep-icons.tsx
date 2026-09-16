import type { CSSProperties } from "react";

export type IconName = "compass" | "ballot" | "compare" | "chart" | "book" | "people" | "message" | "shield" | "wallet" | "arrow" | "back" | "search" | "bookmark" | "check" | "close" | "menu" | "pin" | "clock" | "download" | "info" | "grid" | "trash" | "chevron";
const paths: Record<IconName, React.ReactNode> = {
  compass: <><circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4Z"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></>,
  ballot: <><path d="m4 13 3-3m10 0 3 3v7H4v-7h16M9 16h6"/><path d="m8 5 5-3 5 7-5 3Z"/><path d="m11 6 2 1 1-2"/></>,
  compare: <><path d="M12 3v18M3 18V9h5v9Zm13 0V6h5v12ZM2 21h20"/><path d="m5 5 2-2 2 2m6-1h6"/></>,
  chart: <><path d="M3 3v18h18M7 16v-4m5 4V8m5 8V5"/><path d="m6 7 5-3 5-1"/></>,
  book: <><path d="M12 6c-3-3-7-3-10-2v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/><path d="M5 8h3m-3 4h3m8-4h3m-3 4h3"/></>,
  people: <><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/></>,
  message: <><path d="M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6 4V4a1 1 0 0 1 1-1Z"/><path d="M7 7h10M7 11h7"/></>,
  shield: <><path d="m12 2 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5Z"/><path d="m8 11 3 3 5-6"/></>,
  wallet: <><path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7m0 4h-6v6h6"/><path d="M17 14h.01"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, back: <path d="M20 12H4m6-6-6 6 6 6"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  bookmark: <path d="M6 3h12v18l-6-4-6 4Z"/>, check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>, menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
};
export function NortePIcon({ name, size = 22, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}
