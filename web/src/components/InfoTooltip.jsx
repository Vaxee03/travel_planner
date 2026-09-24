/** A small "?" icon that reveals an explanatory tooltip on hover — for
 * labeling how a feature actually works (e.g. what an AI recommendation is
 * based on) right where the control lives, instead of a separate help page. */
export default function InfoTooltip({ text }) {
  return (
    <span className="info-tooltip">
      <span className="info-tooltip-icon">?</span>
      <span className="info-tooltip-bubble">{text}</span>
    </span>
  );
}
