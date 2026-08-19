import { AlertCircle } from "lucide-react";

export default function LoginError({ message }) {
  if (!message) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
      <AlertCircle
        size={14}
        className="mt-0.5 flex-shrink-0"
      />

      <span>{message}</span>
    </div>
  );
}