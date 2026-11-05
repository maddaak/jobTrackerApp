import { useEffect, useMemo, useRef, useState } from "react";
import { sankey, sankeyLinkHorizontal, sankeyJustify, type SankeyNode, type SankeyLink } from "d3-sankey";
import type { SankeyPath } from "../api/metricsApi";
import { jobsByLink, journeyThrough } from "../sankeyNodes";
import StageDetails from "./metrics/StageDetails";

export interface SankeyNodeInput {
  key: string;
  name: string;
  total: number;
  color: string;
  // Top-to-bottom place within its column; lower is higher up.
  rank: number;
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
const NODE_PADDING = 26;
// Room per node so labels in a busy column don't sit on each other; the chart grows past minHeight for it.
const HEIGHT_PER_NODE = 38;
const MIN_LINK_WIDTH = 2.5;
const LINK_OPACITY = 0.4;
// While a stage is shown its own flows stand out and the rest fade back.
const LINK_OPACITY_FOCUSED = 0.7;
const LINK_OPACITY_FADED = 0.06;
// A traced route of one job inside a band of dozens is a sliver; this keeps it visible end to end.
const MIN_TRACED_WIDTH = 5;
const TRACED_OPACITY = 0.9;
// Thinner than the allocated slot so stacked flows show a gap instead of packing flush.
const LINK_GAP = 5;
// The labels need this much room; below it the chart scrolls instead of overlapping them.
const MIN_WIDTH = 1300;
// Moving from one stage to the next, or down to the details, crosses a gap; waiting this long before letting
// go keeps the chart from flashing back to normal in between.
const UNFOCUS_DELAY_MS = 150;

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
  paths = [],
  minHeight = 560,
}: {
  nodes: SankeyNodeInput[];
  links: SankeyLinkInput[];
  // Each route jobs took, by node key, with its companies; without them a hovered stage lights only its own links.
  paths?: SankeyPath[];
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Hovered or keyboard-focused stage, previewed over the pinned one, which comes back once it lets go.
  const [focused, setFocused] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  // A route row hovered in the details, by its node keys joined; it narrows the chart and the companies to it.
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  // A company hovered, by job id; the chart and the route list pick out the route it took.
  const [hoveredJob, setHoveredJob] = useState<number | null>(null);
  // A route clicked, or the route of a company clicked (marked within it), held on the pinned stage until clicked
  // again or the pin changes.
  const [held, setHeld] = useState<{ routeKey: string; jobId: number | null } | null>(null);
  const unfocusTimer = useRef<number | undefined>(undefined);
  const height = Math.max(minHeight, nodes.length * HEIGHT_PER_NODE);
  const shown = focused ?? pinned;

  function changeFocus(key: string | null) {
    window.clearTimeout(unfocusTimer.current);
    if (key !== null) setFocused(key);
    else unfocusTimer.current = window.setTimeout(() => setFocused(null), UNFOCUS_DELAY_MS);
  }
  useEffect(() => () => window.clearTimeout(unfocusTimer.current), []);

  // A new pin starts clean: otherwise re-pinning a stage brought back a selection let go of earlier, and a hover
  // on a row the unpin removed (it fires no leave) stayed lit on the next stage.
  function pin(key: string | null) {
    setPinned(key);
    setHeld(null);
    setHoveredRoute(null);
    setHoveredJob(null);
  }

  useEffect(() => {
    if (pinned === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") pin(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pinned]);

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
      // A fixed order in every column (earlier stages up top, open outcomes above closed ones) keeps flows in
      // bands; d3's own ordering shuffles them per column, which is what made them cross.
      .nodeSort((a, b) => a.rank - b.rank)
      .extent([
        [MARGIN.left, MARGIN.top],
        [chartWidth - MARGIN.right, height - MARGIN.bottom],
      ]);
    return layout({
      nodes: nodes.map(n => ({ ...n })),
      links: links.map(l => ({ ...l })),
    });
  }, [nodes, links, chartWidth, height]);

  const journey = useMemo(
    () => (shown === null || paths.length === 0 ? null : journeyThrough(paths, shown)),
    [shown, paths],
  );
  const routeByKey = (key: string | null) => journey?.routes.find(r => r.nodes.join(">") === key) ?? null;
  const holding = shown === pinned ? held : null;
  const heldRoute = routeByKey(holding?.routeKey ?? null);
  // Hovering previews over what's held; letting go of the hover brings it back.
  const listedRoute = routeByKey(hoveredRoute) ?? heldRoute;
  const hoveredJobRoute = journey?.routes.find(r => r.applications.some(a => a.jobId === hoveredJob)) ?? null;
  const route = hoveredJobRoute ?? listedRoute;
  const job = hoveredJobRoute ? hoveredJob : holding?.jobId ?? null;

  function hold(routeKey: string, jobId: number | null) {
    // The stage is pinned with it, or leaving the details would take the selection away too.
    if (shown === null) return;
    const same = holding?.routeKey === routeKey && holding.jobId === jobId;
    if (shown !== pinned) pin(shown);
    setHeld(same ? null : { routeKey, jobId });
  }
  const traced = journey ? (route ? [route] : journey.routes) : [];
  const tracedJobs = jobsByLink(traced);
  const onRoute = new Set(traced.flatMap(r => r.nodes));
  const nameOf = new Map(nodes.map(node => [node.key, node.name]));

  return (
    <div ref={ref} className="w-full overflow-x-auto">
      {graph && (
        <svg width={chartWidth} height={height} className="block text-neutral-700 dark:text-neutral-100">
          <g>
            {(graph.links as LayoutLink[]).map((link, i) => {
              const source = link.source as LayoutNode;
              const target = link.target as LayoutNode;
              const d = sankeyLinkHorizontal<SankeyNodeInput, SankeyLinkInput>()(link) ?? undefined;
              const fullWidth = Math.max((link.width ?? 0) - LINK_GAP, MIN_LINK_WIDTH);
              // With routes, the shown stage's jobs are traced end to end; without, only its own links light.
              const jobs = tracedJobs.get(`${source.key}->${target.key}`) ?? 0;
              const lit = !journey && (shown === source.key || shown === target.key);
              return (
                <g key={i}>
                  <path
                    d={d}
                    fill="none"
                    stroke={source.color}
                    strokeOpacity={shown === null ? LINK_OPACITY : lit ? LINK_OPACITY_FOCUSED : LINK_OPACITY_FADED}
                    strokeWidth={fullWidth}
                  >
                    <title>
                      {source.name} to {target.name}: {link.value}
                    </title>
                  </path>
                  {jobs > 0 && (
                    // As thick as the share of this link's jobs that went through the shown stage.
                    <path
                      d={d}
                      fill="none"
                      stroke={source.color}
                      strokeOpacity={TRACED_OPACITY}
                      strokeWidth={Math.max(fullWidth * jobs / link.value, MIN_TRACED_WIDTH)}
                      pointerEvents="none"
                      data-traced={jobs}
                    />
                  )}
                </g>
              );
            })}
          </g>
          <g>
            {(graph.nodes as LayoutNode[]).map((node, i) => (
              <NodeMark
                key={i}
                node={node}
                faded={journey !== null && !onRoute.has(node.key)}
                pinned={pinned === node.key}
                onPin={() => pin(pinned === node.key ? null : node.key)}
                onFocusChange={changeFocus}
              />
            ))}
          </g>
        </svg>
      )}
      {paths.length > 0 && (
        <StageDetails
          stage={shown === null ? null : { key: shown, name: nameOf.get(shown) ?? shown }}
          pinned={pinned === null ? null : { key: pinned, name: nameOf.get(pinned) ?? pinned }}
          journey={journey}
          listedRoute={listedRoute}
          tracedRoute={route}
          heldRoute={heldRoute}
          job={job}
          heldJob={holding?.jobId ?? null}
          nameOf={key => nameOf.get(key) ?? key}
          onRouteHover={setHoveredRoute}
          onRouteHold={routeKey => hold(routeKey, null)}
          onJobHover={setHoveredJob}
          onJobHold={jobId => {
            const jobRoute = journey?.routes.find(r => r.applications.some(a => a.jobId === jobId));
            if (jobRoute) hold(jobRoute.nodes.join(">"), jobId);
          }}
          onUnpin={() => pin(null)}
          // Reading the details keeps the hovered stage; leaving them lets it go like leaving the stage does.
          onMouseEnter={() => window.clearTimeout(unfocusTimer.current)}
          onMouseLeave={() => changeFocus(null)}
        />
      )}
    </div>
  );
}

function NodeMark({ node, faded, pinned, onPin, onFocusChange }: {
  node: LayoutNode;
  // Off the shown stage's journey, so it steps back with the links it isn't on.
  faded: boolean;
  pinned: boolean;
  onPin: () => void;
  onFocusChange: (key: string | null) => void;
}) {
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
      onMouseEnter={() => onFocusChange(node.key)}
      onMouseLeave={() => onFocusChange(null)}
      onFocus={() => onFocusChange(node.key)}
      onBlur={() => onFocusChange(null)}
      onClick={onPin}
      role="button"
      tabIndex={0}
      aria-pressed={pinned}
      aria-label={`${node.name}, ${node.total}`}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPin();
        }
      }}
      style={{ cursor: "pointer", opacity: faded ? 0.3 : 1 }}
    >
      <title>{`${node.name}: ${node.total}`}</title>
      {/* One unbroken hover area over the bar, the gap, and the label, so crossing between them doesn't flicker. */}
      <rect
        x={x0}
        y={Math.min(y0, cy - boxHeight / 2)}
        width={labelX - 6 + boxWidth - x0}
        height={Math.max(y1, cy + boxHeight / 2) - Math.min(y0, cy - boxHeight / 2)}
        fill="transparent"
      />
      <rect x={x0} y={y0} width={x1 - x0} height={Math.max(y1 - y0, 1)} rx={2} fill={node.color} fillOpacity={0.95} />
      <rect
        x={labelX - 6}
        y={cy - boxHeight / 2}
        width={boxWidth}
        height={boxHeight}
        rx={4}
        className="fill-white dark:fill-neutral-900"
        fillOpacity={0.92}
        // The pinned stage is outlined, so it reads as held while another is previewed.
        stroke={pinned ? "currentColor" : undefined}
        strokeWidth={pinned ? 1.5 : undefined}
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
