// One-click launcher for RAKSHA-PATH X (Windows).
// Serves the prebuilt app in .\dist on http://localhost and opens the default browser.
// If .\dist is missing it builds it with npm (requires Node.js). Close the window to stop.
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

class Launcher
{
    static string root;

    static int Main()
    {
        Console.Title = "RAKSHA-PATH X";
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        root = Path.Combine(baseDir, "dist");
        Console.WriteLine("RAKSHA-PATH X - Proof-of-Passability Emergency Intelligence Network");
        Console.WriteLine("Simulated prototype. Fictional data only.\n");

        if (!File.Exists(Path.Combine(root, "index.html")))
        {
            Console.WriteLine("No build found in the dist folder - building with npm (first run only)...");
            if (Run(baseDir, "npm install --no-fund --no-audit") != 0 || Run(baseDir, "npm run build") != 0)
            {
                Console.WriteLine("\nBuild failed. Install Node.js 18+ from https://nodejs.org and try again.");
                Console.WriteLine("Press Enter to exit.");
                Console.ReadLine();
                return 1;
            }
        }

        // Try successive ports; another instance (or app) may already hold one.
        HttpListener listener = null;
        string url = null;
        for (int port = 4173; port < 4193 && listener == null; port++)
        {
            var l = new HttpListener();
            l.Prefixes.Add("http://localhost:" + port + "/");
            try { l.Start(); listener = l; url = "http://localhost:" + port + "/"; }
            catch { l.Close(); }
        }
        if (listener == null)
        {
            Console.WriteLine("Could not start local server on ports 4173-4192.");
            Console.ReadLine();
            return 1;
        }

        Console.WriteLine("Running at " + url);
        Console.WriteLine("Close this window to stop the app.\n");
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }

        while (listener.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = listener.GetContext(); } catch { break; }
            ThreadPool.QueueUserWorkItem(_ => Serve(ctx));
        }
        return 0;
    }

    static int Run(string dir, string cmd)
    {
        var p = Process.Start(new ProcessStartInfo("cmd.exe", "/c " + cmd) { WorkingDirectory = dir, UseShellExecute = false });
        p.WaitForExit();
        return p.ExitCode;
    }

    static void Serve(HttpListenerContext ctx)
    {
        try
        {
            string rel = Uri.UnescapeDataString(ctx.Request.Url.AbsolutePath).TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            string full = Path.GetFullPath(Path.Combine(root, rel));
            // Block path traversal outside dist; fall back to index.html for app routes.
            if (!full.StartsWith(Path.GetFullPath(root), StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                full = Path.Combine(root, "index.html");
            byte[] data = File.ReadAllBytes(full);
            ctx.Response.ContentType = Mime(Path.GetExtension(full));
            ctx.Response.Headers["Cache-Control"] = full.EndsWith("index.html") || full.EndsWith("sw.js") ? "no-cache" : "public, max-age=31536000";
            ctx.Response.ContentLength64 = data.Length;
            ctx.Response.OutputStream.Write(data, 0, data.Length);
        }
        catch { try { ctx.Response.StatusCode = 500; } catch { } }
        finally { try { ctx.Response.Close(); } catch { } }
    }

    static string Mime(string ext)
    {
        switch (ext.ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }
}
