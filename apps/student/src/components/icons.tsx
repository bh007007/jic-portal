// 디자인 05(StudentPortal.dc.html)의 선 아이콘.
const base = { 'aria-hidden': true, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IconCalendar = ({ size = 24, w = 1.6 }) => (
  <svg {...base} width={size} height={size} strokeWidth={w}>
    <rect x="3" y="5" width="18" height="16" rx="1.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const IconForm = ({ size = 24, w = 1.6 }) => (
  <svg {...base} width={size} height={size} strokeWidth={w}>
    <path d="M14 3H6v18h12V7z" />
    <path d="M14 3v4h4M9 13h6M9 17h4" />
  </svg>
);

export const IconList = ({ size = 24, w = 1.6 }) => (
  <svg {...base} width={size} height={size} strokeWidth={w}>
    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

export const IconUser = ({ size = 24, w = 1.6 }) => (
  <svg {...base} width={size} height={size} strokeWidth={w}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
  </svg>
);

export const IconHome = ({ size = 22, w = 1.8 }) => (
  <svg {...base} width={size} height={size} strokeWidth={w}>
    <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />
  </svg>
);

export const IconBack = ({ size = 20, w = 1.8 }) => (
  <svg {...base} width={size} height={size} strokeWidth={w}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
