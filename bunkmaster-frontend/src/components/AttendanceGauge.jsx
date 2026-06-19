import { useEffect, useState } from "react";
import { getZone, ZONE_COLORS } from "../utils/quips";
import "./AttendanceGauge.css";

/**
 * Signature visual element: a fuel-gauge style dial showing attendance
 * percentage relative to a target. The needle animates to its resting
 * position with a slight spring overshoot.
 *
 * @param {object} props
 * @param {number} props.percentage 0-100
 * @param {number} props.target target percentage (e.g. 75)
 * @param {string} [props.size] "sm" | "md" | "lg"
 */
export default function AttendanceGauge({ percentage, target, size = "md" }) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const zone = getZone(clamped, target);
  const color = ZONE_COLORS[zone];

  // Animate the needle from 0 to its target angle on mount/update
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    // Trigger on next frame so the CSS transition applies
    const raf = requestAnimationFrame(() => setDisplayValue(clamped));
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  // Gauge spans 180deg (semi-circle), from -90deg (0%) to +90deg (100%)
  const needleAngle = -90 + (displayValue / 100) * 180;
  const targetAngle = -90 + (Math.max(0, Math.min(100, target)) / 100) * 180;

  const sizeMap = { sm: 96, md: 140, lg: 200 };
  const dim = sizeMap[size] || sizeMap.md;
  const radius = dim / 2 - 8;
  const cx = dim / 2;
  const cy = dim / 2;

  // Arc path for the semi-circle track
  const arcPath = describeArc(cx, cy, radius, -90, 90);

  // Tick mark for target threshold
  const targetTick = polarToCartesian(cx, cy, radius, targetAngle);
  const targetTickInner = polarToCartesian(cx, cy, radius - 10, targetAngle);

  return (
    <div className={`gauge gauge--${size}`} role="img" aria-label={`Attendance ${clamped.toFixed(1)}%, target ${target}%`}>
      <svg viewBox={`0 0 ${dim} ${dim * 0.62}`} className="gauge__svg">
        {/* Background track */}
        <path d={arcPath} className="gauge__track" />

        {/* Filled arc up to current value */}
        <path
          d={describeArc(cx, cy, radius, -90, needleAngle)}
          className="gauge__fill"
          style={{ stroke: color }}
        />

        {/* Target threshold tick */}
        <line
          x1={targetTickInner.x}
          y1={targetTickInner.y}
          x2={targetTick.x}
          y2={targetTick.y}
          className="gauge__target-tick"
        />

        {/* Needle */}
        <g className="gauge__needle-group" style={{ transform: `rotate(${needleAngle}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - radius + 4} className="gauge__needle" style={{ stroke: color }} />
        </g>
        <circle cx={cx} cy={cy} r={5} className="gauge__hub" style={{ fill: color }} />
      </svg>
      <div className="gauge__readout">
        <span className="gauge__value mono" style={{ color }}>
          {clamped.toFixed(1)}%
        </span>
        <span className="eyebrow gauge__zone">{zone}</span>
      </div>
    </div>
  );
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}
