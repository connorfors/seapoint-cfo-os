import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
export { money, date, runway } from "../format";
export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "live" | "demo" | "warning";
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
export function Back({
  onClick,
  children = "Next moves",
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button className="back" onClick={onClick}>
      <ArrowLeft size={15} />
      {children}
    </button>
  );
}
