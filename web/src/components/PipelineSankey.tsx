import { useEffect, useMemo, useRef, useState } from "react";
import { sankey, sankeyLinkHorizontal, sankeyJustify, type SankeyNode, type SankeyLink } from "d3-sankey";

export interface SankeyNodeInput {
  key: string;
  name: string;
  total: number;
  color: string;
}

export interface SankeyLinkInput {
  source: number;
  target: number;
  value: number;
}

type LayoutNode = SankeyNode<SankeyNodeInput, SankeyLinkInput>;
type LayoutLink = SankeyLink<SankeyNodeInput, SankeyLinkInput>;

const MARGIN = { top: 30, right: 150, bottom: 16, left: 90 };
const NODE_WIDTH = 12;
const NODE_PADDING = 16;
const MIN_LINK_WIDTH = 2.5;
// Thinner than the allocated slot so stacked flows show a gap instead of packing flush.
const LINK_GAP = 5;
// The labels need this much room; below it the chart scrolls instead of overlapping them.
const MIN_WIDTH = 1300;

// Measure label text so its highlight box hugs it; estimate without a canvas (SSR/tests).
const measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
function labelWidth(text: string, font: number): number {
  if (!measureCtx) return text.length * font * 0.55;
  measureCtx.font = `600 ${font}px ui-sans-serif, system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}

// Custom d3-sankey (not Recharts) so we control flow thickness and label rendering.
export default function PipelineSankey({
  nodes,
  links,
  height = 560,
  onNodeClick,
}: {
  nodes: SankeyNodeInput[];
  links: SankeyLinkInput[];
  height?: number;
  onNodeClick?: (key: string, name: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const chartWidth = width === 0 ? 0 : Math.max(width, MIN_WIDTH);

  const graph = useMemo(() => {
    if (chartWidth === 0) return null;
    const layout = sankey<SankeyNodeInput, SankeyLinkInput>()
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeAlign(sankeyJustify)
      .extent([
        [MARGIN.left, MARGIN.top],
        [chartWidth - MARGIN.right, height - MARGIN.bottom],
      ]);
    return layout({
      nodes: nodes.map(n => ({ ...n })),
      links: links.map(l => ({ ...l })),
    });
  }, [nodes, links, chartWidth, height]);

  return (
    <div ref={ref} className="w-full overflow-x-auto">
      {graph && (
        <svg width={chartWidth} height={height} className="block text-neutral-700 dark:text-neutral-100">
          <g>
            {(graph.links as LayoutLink[]).map((link, i) => (
              <path
                key={i}
                d={sankeyLinkHorizontal<SankeyNodeInput, SankeyLinkInput>()(link) ?? undefined}
                fill="none"
                stroke={(link.source as LayoutNode).color}
                strokeOpacity={0.4}
                strokeWidth={Math.max((link.width ?? 0) - LINK_GAP, MIN_LINK_WIDTH)}
              >
                <title>
                  {(link.source as LayoutNode).name} to {(link.target as LayoutNode).name}: {link.value}
                </title>
              </path>
            ))}
          </g>
          <g>
            {(graph.nodes as LayoutNode[]).map((node, i) => (
              <NodeMark key={i} node={node} onClick={onNodeClick} />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

function NodeMark({ node, onClick }: { node: LayoutNode; onClick?: (key: string, name: string) => void }) {
  const x0 = node.x0 ?? 0;
  const x1 = node.x1 ?? 0;
  const y0 = node.y0 ?? 0;
  const y1 = node.y1 ?? 0;
  const cy = (y0 + y1) / 2;
  const font = 12;
  const label = `${node.name} - ${node.total}`;
  const labelX = x1 + 9;
  const boxHeight = font + 8;
  const boxWidth = labelWidth(label, font) + 12;

  return (
    <g
      onClick={onClick ? () => onClick(node.key, node.name) : undefined}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      <title>{`${node.name}: ${node.total}`}</title>
      <rect x={x0} y={y0} width={x1 - x0} height={Math.max(y1 - y0, 1)} rx={2} fill={node.color} fillOpacity={0.95} />
      <rect
        x={labelX - 6}
        y={cy - boxHeight / 2}
        width={boxWidth}
        height={boxHeight}
        rx={4}
        className="fill-white dark:fill-neutral-900"
        fillOpacity={0.92}
      />
      <text
        x={labelX}
        y={cy + font / 3}
        textAnchor="start"
        fontSize={font}
        fontWeight={600}
        className="fill-neutral-800 dark:fill-neutral-100"
      >
        {label}
      </text>
    </g>
  );
}
