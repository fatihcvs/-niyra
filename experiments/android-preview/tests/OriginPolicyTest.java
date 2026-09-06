package app.kampira.preview;

public final class OriginPolicyTest {
    private static int checks;
    private static void check(boolean condition, String message) { checks++; if (!condition) throw new AssertionError(message); }
    private static void invalid(String origin) { try { new OriginPolicy(origin); throw new AssertionError("Accepted invalid origin"); } catch (IllegalArgumentException expected) { checks++; } }
    public static void main(String[] args) {
        OriginPolicy local = new OriginPolicy("http://192.168.0.4:5173");
        check(local.contains("http://192.168.0.4:5173/?view=notes"), "Same-origin route");
        check(local.contains("http://192.168.0.4:5173/api/messages"), "Same-origin API");
        check(!local.contains("http://192.168.0.4:5180/"), "Port fence");
        check(!local.contains("https://192.168.0.4:5173/"), "Scheme fence");
        check(!local.contains("http://192.168.0.4.evil.example:5173/"), "Host suffix fence");
        check(!local.contains("http://user@192.168.0.4:5173/"), "No userinfo");
        check(!local.contains("javascript:alert(1)"), "No JS URL");
        check(!local.contains("file:///data/private"), "No file URL");
        check(!local.contains("content://private/file"), "No content URL");
        check(!local.contains("http://%31%39%32.168.0.4:5173/"), "No encoded host alias");
        check(!local.contains(null), "Null is not a route");
        OriginPolicy production = new OriginPolicy("https://web-production-da44f.up.railway.app");
        check(production.contains("https://WEB-PRODUCTION-DA44F.UP.RAILWAY.APP:443/?view=notes"), "Case and default port");
        check(!production.contains("https://web-production-da44f.up.railway.app.evil.example/"), "HTTPS suffix fence");
        check(local.startUrl().equals("http://192.168.0.4:5173/"), "Start URL");
        check(new OriginPolicy("http://10.0.2.2:5173").isHttp(), "Private development origin");
        invalid("http://8.8.8.8"); invalid("http://172.32.0.1"); invalid("http://192.168.0.999");
        invalid("http://localhost"); invalid("https://example.com/path"); invalid("https://example.com?secret=x");
        invalid("https://user:password@example.com"); invalid("file:///tmp/preview"); invalid("https://example.com:0");
        System.out.println("OriginPolicy checks passed: " + checks + "; no Android SDK, device, or WebView execution implied.");
    }
}
