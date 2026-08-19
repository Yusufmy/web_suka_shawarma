import api from "./api";

/**
 * Start Broadcast
 *
 * targetMode:
 * - all
 * - specific
 *
 * selectedOutletIds:
 * array ID outlet jika targetMode = specific
 */
export async function startBroadcast(
    targetMode = "all",
    selectedOutletIds = []
) {
    const payload = {
        target_mode: targetMode,
    };

    if (targetMode === "specific") {
        payload.outlet_ids = selectedOutletIds;
    }

    console.log("📢 START BROADCAST REQUEST:", payload);

    const response = await api.post(
        "/broadcast/start",
        payload
    );

    console.log(
        "✅ BROADCAST CREATED:",
        response.data
    );

    return response.data;
}


/**
 * End Broadcast
 */
export async function endBroadcast(broadcastId) {
    if (!broadcastId) {
        throw new Error(
            "Broadcast ID tidak tersedia"
        );
    }

    console.log(
        "🛑 END BROADCAST:",
        broadcastId
    );

    const response = await api.post(
        `/broadcast/${broadcastId}/end`
    );

    console.log(
        "✅ BROADCAST ENDED:",
        response.data
    );

    return response.data;
}