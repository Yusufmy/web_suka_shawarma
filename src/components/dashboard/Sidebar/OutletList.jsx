import OutletItem from "./OutletItem";

export default function OutletList({
  outlets,
  targetMode,
  selected,
  onToggle,
  confirmedOutletIds,
  playingOutletIds,
  listeningOutletIds,
}) {
  return (
    <div className="outlet-list-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">

      {outlets.map((outlet) => (
        <OutletItem
          key={outlet.id}
          outlet={outlet}
          targetMode={targetMode}
          selected={selected.has(outlet.id)}
          onToggle={onToggle}
          audioConfirmed={confirmedOutletIds?.has(outlet.id)}
          audioPlaying={playingOutletIds?.has(outlet.id)}
          listeningLive={listeningOutletIds?.has(outlet.id)}
        />
      ))}

    </div>
  );
}