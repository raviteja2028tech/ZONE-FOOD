import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-lg place-items-center p-6">
      <EmptyState page icon={Compass} title="Page not found" action={<Link href="/" className={buttonClass("primary")}>Back to overview</Link>}>
        The page you are looking for does not exist or has moved.
      </EmptyState>
    </div>
  );
}
