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

      {outlets.map((outlet) => {
        const idNum = Number(outlet.id);
        const idStr = String(outlet.id);
        const isAudioPlaying = Boolean(
          playingOutletIds?.has(outlet.id) ||
          playingOutletIds?.has(idNum) ||
          playingOutletIds?.has(idStr)
        );
        const isListeningLive = Boolean(
          listeningOutletIds?.has(outlet.id) ||
          listeningOutletIds?.has(idNum) ||
          listeningOutletIds?.has(idStr)
        );
        const isConfirmed = Boolean(
          confirmedOutletIds?.has(outlet.id) ||
          confirmedOutletIds?.has(idNum) ||
          confirmedOutletIds?.has(idStr)
        );

        return (
          <OutletItem
            key={outlet.id}
            outlet={outlet}
            targetMode={targetMode}
            selected={selected.has(outlet.id)}
            onToggle={onToggle}
            audioConfirmed={isConfirmed}
            audioPlaying={isAudioPlaying}
            listeningLive={isListeningLive}
          />
        );
      })}

    </div>
  );
}