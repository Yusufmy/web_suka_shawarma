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
  devices,
  selectedDeviceId,
}) {
  const activeMicLabel =
      devices.find((d) => d.deviceId === selectedDeviceId)?.label ||
      "Mendeteksi mikrofon...";

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

      <p className="text-sm text-neutral-400">
          🎤 {activeMicLabel}
      </p>

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