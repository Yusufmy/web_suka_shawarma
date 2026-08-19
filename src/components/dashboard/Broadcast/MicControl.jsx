import {
  Mic,
  Square,
} from "lucide-react";

export default function MicControl({
  isLive,
  canStart,
  onStart,
  onStop,
}) {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center sm:h-56 sm:w-56">

      {isLive && (
        <span className="absolute h-full w-full animate-ping rounded-full bg-red-500/10" />
      )}

      <div
        className={`
          absolute h-36 w-36 rounded-full border
          sm:h-44 sm:w-44
          ${
            isLive
              ? "border-red-500/30"
              : "border-neutral-800"
          }
        `}
      />

      <button
        onClick={isLive ? onStop : onStart}
        disabled={!isLive && !canStart}
        className={`
          relative flex h-24 w-24
          items-center justify-center
          rounded-full transition
          sm:h-32 sm:w-32

          ${
            isLive
              ? "bg-red-600 shadow-lg shadow-red-900/50"
              : canStart
              ? "bg-gradient-to-br from-orange-500 to-orange-700 shadow-lg shadow-orange-900/40 hover:scale-[1.03]"
              : "cursor-not-allowed bg-neutral-800"
          }
        `}
      >
        {isLive ? (
          <Square
            size={30}
            className="fill-white text-white"
          />
        ) : (
          <Mic
            size={34}
            className="text-white"
          />
        )}
      </button>

    </div>
  );
}