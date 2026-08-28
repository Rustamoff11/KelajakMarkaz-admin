// Rishton (Farg'ona) keramikasidagi an'anaviy naqshdan ilhomlangan
// yengil chiziqli medalyon — sahifalarda imzo unsuri sifatida ishlatiladi.
export default function Ornament({ className = "" }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="100" cy="100" r="92" stroke="#1BA9A0" strokeWidth="1" opacity="0.5" />
      <circle cx="100" cy="100" r="68" stroke="#1BA9A0" strokeWidth="1" opacity="0.7" />
      <circle cx="100" cy="100" r="6" fill="#D69A4C" />
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const x1 = 100 + Math.cos(angle) * 68;
        const y1 = 100 + Math.sin(angle) * 68;
        const x2 = 100 + Math.cos(angle) * 92;
        const y2 = 100 + Math.sin(angle) * 92;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#1BA9A0"
            strokeWidth="1"
            opacity="0.35"
          />
        );
      })}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const x = 100 + Math.cos(angle) * 68;
        const y = 100 + Math.sin(angle) * 68;
        return <circle key={i} cx={x} cy={y} r="3.5" fill="#1BA9A0" opacity="0.8" />;
      })}
    </svg>
  );
}
