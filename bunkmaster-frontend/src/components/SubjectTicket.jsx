import { useMemo } from "react";
import { getQuip, getZone } from "../utils/quips";
import "./SubjectTicket.css";

export default function SubjectTicket({ stat, target }) {
  const quip = useMemo(() => getQuip(stat.percentage, target), [stat.subjectId, stat.percentage]);
  const zone  = getZone(stat.percentage, target);

  const width = Math.max(0, Math.min(100, stat.percentage));

  return (
    <div className={`ticket ticket--${zone}`}>
      <div className="ticket__main">
        <div className="ticket__top">
          <div className="ticket__subject">{stat.name}</div>
          <div className="ticket__fraction mono">
            {stat.attended}/{stat.conducted}
          </div>
        </div>

        <div className="ticket__track">
          <div className="ticket__fill" style={{ width: `${width}%` }} />
        </div>

        <p className="ticket__quip">&ldquo;{quip}&rdquo;</p>

        <div className="ticket__footer">
          <span className="ticket__prediction">{stat.prediction}</span>
          {stat.semesterTotal ? (
            <span className="eyebrow">
              Max <span className="mono">{stat.maxPossiblePercentage}%</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="ticket__stub">
        <div className="ticket__pct">{stat.percentage.toFixed(1)}%</div>
        <div className="ticket__zone eyebrow">{zone}</div>
      </div>
    </div>
  );
}
