import { getPlatformSettings } from "../../../lib/platform-settings";
import { getRuntime } from "../../../lib/server-api";

export async function GET() {
  try {
    const { DB } = await getRuntime();
    const settings = await getPlatformSettings(DB);
    return Response.json(
      { maintenanceMode: settings.maintenanceMode, maintenanceMessage: settings.maintenanceMessage,
        betaAccessOnly: settings.betaAccessOnly, registrationOpen: settings.registrationOpen && !settings.betaAccessOnly },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ maintenanceMode: false, maintenanceMessage: "", betaAccessOnly: false, registrationOpen: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
