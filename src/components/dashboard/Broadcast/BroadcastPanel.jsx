import TargetSelector from "./TargetSelector";
import MicControl from "./MicControl";
import BroadcastStatus from "./BroadcastStatus";
import LiveWaveform from "./LiveWaveform";
import BroadcastInfo from "./BroadcastInfo";

export default function BroadcastPanel({
  targetMode,
  onTargetModeChange,
  isLive,
  canStart,
  onStart,
  onStop,
  duration,
  targetCount,
  connectedOutlets,
  levels,
  devices,          // 👈 tambahin
  selectedDeviceId, // 👈 tambahin
  onSelectDevice,   // 👈 tambahin
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-8 sm:gap-8 sm:px-8 sm:py-10">

      {/* Target */}
      <TargetSelector
        targetMode={targetMode}
        onChange={onTargetModeChange}
      />

      {/* Microphone */}
      <MicControl
        isLive={isLive}
        canStart={canStart}
        onStart={onStart}
        onStop={onStop}
      />

      <select
          value={selectedDeviceId || ""}
          onChange={(e) => onSelectDevice(e.target.value)}
          disabled={isLive}
          className="rounded bg-neutral-800 px-3 py-2 text-sm text-white"
      >
          {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
              </option>
          ))}
      </select>

      {/* Status */}
      <BroadcastStatus
        isLive={isLive}
        duration={duration}
        targetMode={targetMode}
        targetCount={targetCount}
        connectedOutlets={connectedOutlets}
      />

      {/* Waveform */}
      <LiveWaveform
        levels={levels}
        isLive={isLive}
      />

      {/* Info */}
      <BroadcastInfo />

    </div>
  );
}