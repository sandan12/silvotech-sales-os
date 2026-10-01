import type { SVGProps } from "react";

function IconBase({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  Today: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <path d="M5 4h14a2 2 0 0 1 2 2v13H3V6a2 2 0 0 1 2-2Z" />
      <path d="M8 2v4M16 2v4M3 9h18M8 13h3M8 16h6" />
    </IconBase>
  ),
  Opportunity: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M18 6 21 3M18 3h3v3" />
    </IconBase>
  ),
  Result: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </IconBase>
  ),
  Discovery: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 5 5M8 11h6M11 8v6" />
    </IconBase>
  ),
  Brain: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <path d="M9.5 4A3.5 3.5 0 0 0 6 7.5v.3A3.5 3.5 0 0 0 4 11v1a3 3 0 0 0 3 3v.5A3.5 3.5 0 0 0 10.5 19H12V5.5A2.5 2.5 0 0 0 9.5 3Z" />
      <path d="M14.5 4A3.5 3.5 0 0 1 18 7.5v.3a3.5 3.5 0 0 1 2 3.2v1a3 3 0 0 1-3 3v.5a3.5 3.5 0 0 1-3.5 3.5H12V5.5A2.5 2.5 0 0 1 14.5 3ZM8 9h4M12 14h4" />
    </IconBase>
  ),
  Mail: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </IconBase>
  ),
  Mic: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
    </IconBase>
  ),
  Spark: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
      <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
    </IconBase>
  ),
  Arrow: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </IconBase>
  ),
  Check: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <path d="m5 12 4 4L19 6" />
    </IconBase>
  ),
  Close: (props: SVGProps<SVGSVGElement>) => (
    <IconBase {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconBase>
  ),
};