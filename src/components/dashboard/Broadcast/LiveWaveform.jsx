export default function LiveWaveform({
  levels,
  isLive,
}) {
  return (
    <div className="flex h-14 items-end gap-1">

      {levels.map((height, index) => (
        <span
          key={index}
          className={`
            w-1.5 rounded-full
            transition-all duration-150
            ${
              isLive
                ? "bg-orange-500"
                : "bg-neutral-800"
            }
          `}
          style={{
            height: `${isLive ? height : 6}px`,
          }}
        />
      ))}

    </div>
  );
}