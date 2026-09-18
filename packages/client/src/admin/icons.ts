// Ícones do painel, desenhados à mão em SVG (24×24) para não depender de fonte de ícone.

const PATHS: Record<string, string> = {
  home: "M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  chart: "M4 20h16M7 17V9m5 8V5m5 12v-6",
  users:
    "M8 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 8 11m8 .5a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4M2.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5m3-6c2.6.2 4.5 2.1 4.5 4.6",
  globe:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 0c2.6 2.2 3.9 5.2 3.9 9s-1.3 6.8-3.9 9c-2.6-2.2-3.9-5.2-3.9-9S9.4 5.2 12 3M3.4 9.4h17.2M3.4 14.6h17.2",
  scroll: "M6 3h11a2 2 0 0 1 2 2v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6m2-3a2 2 0 0 0-2 3h2zm3 6h7M9 13h7M9 17h4",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 8c0-3.6 3.1-6 7-6s7 2.4 7 6",
  group:
    "M9 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8M17 12a2.8 2.8 0 1 0 0-5.6A2.8 2.8 0 0 0 17 12M3 20c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4m2-6c2.6.2 4.5 2 4.5 4.6",
  wifi: "M12 19.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6M8.2 14.6a5.5 5.5 0 0 1 7.6 0M5 11.2a10 10 0 0 1 14 0M2.2 7.9a14 14 0 0 1 19.6 0",
  level: "M12 3 7 9h3v4h4V9h3zM7 17h10M7 21h10",
  diamond: "M12 3 21 10.2 12 21 3 10.2zM3 10.2h18M12 3 8.4 10.2 12 21l3.6-10.8z",
  monster: "M5 10c0-4 3-6 7-6s7 2 7 6v4c0 3.5-3 6-7 6s-7-2.5-7-6zM3.5 6.5 6 9m14.5-2.5L18 9M9.2 11.5h.01M14.8 11.5h.01M9 16h6",
  box: "M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.6l8.5-4.1M12 11.6V20.5",
  crown: "m4 18 1.3-10L9.5 12 12 5.4 14.5 12l4.2-4L20 18zM4 20.5h16",
  coin: "M12 20.5c4.7 0 8.5-1.6 8.5-3.6V7.1C20.5 5.1 16.7 3.5 12 3.5S3.5 5.1 3.5 7.1v9.8c0 2 3.8 3.6 8.5 3.6m8.5-13.4c0 2-3.8 3.6-8.5 3.6S3.5 9.1 3.5 7.1",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18m0-14v5.2l3.4 2",
  lock: "M6.5 10.5V8a5.5 5.5 0 0 1 11 0v2.5M5 10.5h14v9H5zM12 14v2.5",
  calendar: "M4.5 6.5h15v14h-15zM4.5 11h15M8.5 3.5V8m7-4.5V8",
  xp: "m6 6 5 6-5 6m6.5 0h5.5",
  megaphone:
    "M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5h2l8 4.5V6L7.5 10.5h-2A1.5 1.5 0 0 0 4 12m14-2.2a3.4 3.4 0 0 1 0 4.4M6.5 15v4.5h3V15",
  door: "M5 3.5h14v17H5zM15 12h.01",
  sword: "M4 3h3.5L20 15.5 17 18.5 4.5 6zM14.5 18l3.5 3.5M3 18.5 7.5 14l2.5 2.5L5.5 21z",
  heart: "M12 20.5C6.5 17 3.5 13.6 3.5 10a4.5 4.5 0 0 1 8.5-2.2A4.5 4.5 0 0 1 20.5 10c0 3.6-3 7-8.5 10.5",
  shield: "M12 3.5 20 6v6c0 4.3-3.3 7.6-8 9.5-4.7-1.9-8-5.2-8-9.5V6z",
  logout: "M14.5 7V4.5h-10v15h10V17M9.5 12h11m-3.5-3.5L20.5 12 17 15.5",
  gem: "M8 3.5h8l4 5.5-8 11.5L4 9zM4 9h16M8 3.5 9.6 9 12 20.5 14.4 9 16 3.5",
  check: "m4 12.5 5.5 5.5L20 6",
  mute: "M4 9.5h3l4.5-3.5v12L7 14.5H4zM15.5 9.5l5 5m0-5-5 5",
  trash: "M5 6.5h14M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20h9l1-13.5M10 10v6.5M14 10v6.5",
  bolt: "M13 3 5.5 13.5H11L10 21l7.5-10.5H12z",
};

/** Ícone em SVG. `className` entra no elemento para dar cor e tamanho pelo CSS. */
export function icon(name: keyof typeof PATHS | string, className = ""): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `icon ${className}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", PATHS[name] ?? PATHS.gem);
  svg.append(path);
  return svg;
}
