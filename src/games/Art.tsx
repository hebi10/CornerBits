import './art.css';

/** Decorative atlas art; actionable names stay on the enclosing control. */
export function Sprite({ atlas, frame, className = '' }: { atlas: 'mine' | 'garden' | 'charms'; frame: number; className?: string }) {
  return <span aria-hidden="true" className={`game-art ${atlas}-art frame-${frame} ${className}`} />;
}
