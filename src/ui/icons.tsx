import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const ArrowRight = () => (
  <svg {...base}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
export const ArrowLeft = () => (
  <svg {...base}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
)
export const Close = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const List = () => (
  <svg {...base}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
)
export const SoundOn = () => (
  <svg {...base}>
    <path d="M4 10v4h3l4 4V6L7 10H4zM15 9a4 4 0 010 6M17.5 6.5a8 8 0 010 11" />
  </svg>
)
export const SoundOff = () => (
  <svg {...base}>
    <path d="M4 10v4h3l4 4V6L7 10H4zM16 9l5 5M21 9l-5 5" />
  </svg>
)
export const Expand = () => (
  <svg {...base}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
)
export const BookOpen = () => (
  <svg {...base}>
    <path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14" />
  </svg>
)

export const Ornament = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 180 18" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M0 9h70M110 9h70" />
    <path d="M90 2l7 7-7 7-7-7z" fill="currentColor" stroke="none" />
    <circle cx="1" cy="9" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="179" cy="9" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)

export const Mandala = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1">
    <circle cx="50" cy="50" r="48" />
    <circle cx="50" cy="50" r="36" />
    <circle cx="50" cy="50" r="22" />
    {Array.from({ length: 12 }).map((_, i) => (
      <g key={i} transform={`rotate(${i * 30} 50 50)`}>
        <path d="M50 14c6 8 6 18 0 24-6-6-6-16 0-24z" />
        <circle cx="50" cy="42" r="1.2" fill="currentColor" />
      </g>
    ))}
    <circle cx="50" cy="50" r="3" fill="currentColor" />
  </svg>
)
