import type { CSSProperties } from 'react';

const paths: Record<string, string> = {
  home: 'm3 10 9-7 9 7v10H14v-6h-4v6H3z',
  box: 'm12 3 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9 M7 5l9 5',
  bike: 'M5 16m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M19 16m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M5 16l5-9 5 9H5 M10 7h7l2 9 M8 4h4 M16 3h3v4',
  order: 'M6 5H4v16h16V5h-2 M8 3h8v4H8z M8 12h8 M8 16h5',
  store: 'M3 10V5h18v5 M2 10h20l-2 4H4z M5 14v7h14v-7 M9 21v-5h6v5',
  users: 'M9 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M3 21v-3a6 6 0 0 1 12 0v3z M17 5a3 3 0 0 1 0 6 M18 15a5 5 0 0 1 4 5',
  user: 'M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 21v-2a8 8 0 0 1 16 0v2z',
  tool: 'm4 3 17 17-2 2L2 5z M15 9l5-5 M13 15l-7 7-4-4 7-7 M15 3l3 3 4-4',
  file: 'M5 3h9l5 5v13H5z M14 3v6h5 M8 13h8 M8 17h6',
  settings: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M3 5l3-3 3 2h6l3-2 3 3-2 3v6l2 3-3 3-3-2H9l-3 2-3-3 2-3V8z',
  truck: 'M2 5h12v12H2z M14 10h4l4 5v2h-8 M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M18 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  search: 'M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M15 15l6 6',
  bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z M10 21h4 M12 2v2',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  chevron: 'm6 9 6 6 6-6',
  shield: 'm12 2 8 4v7c0 5-8 9-8 9s-8-4-8-9V6z M9 12l2 2 4-4',
};

export function Icon({ name, size = 20, style }: { name: string; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name] ?? paths.box} /></svg>;
}
