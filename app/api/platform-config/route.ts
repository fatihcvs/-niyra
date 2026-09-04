import { getPlatformSettings } from "../../../lib/platform-settings";
import { getRuntime } from "../../../lib/server-api";

export async function GET() {
  try {
    const { DB } = await getRuntime();
    const settings = await getPlatformSettings(DB);
    return Response.json(
      { maintenanceMode: settings.maintenanceMode, maintenanceMessage: settings.maintenanceMessage },
      { headers: { "cache-control": "public, max-age=30" } },
    );
  } catch {
    return Response.json({ maintenanceMode: false, maintenanceMessage: "" }, { headers: { "cache-control": "no-store" } });
  }
}
