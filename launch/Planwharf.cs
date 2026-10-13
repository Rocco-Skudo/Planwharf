using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class Planwharf
{
    static string logFile;
    static readonly object logGate = new object();
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            string logDir = Environment.GetEnvironmentVariable("PLANWHARF_LAUNCH_LOG_DIR");
            if (string.IsNullOrWhiteSpace(logDir)) logDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Planwharf", "logs");
            Directory.CreateDirectory(logDir);
            logFile = Path.Combine(logDir, "launch-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff") + "-" + Process.GetCurrentProcess().Id + ".log");
            Record("Launcher started.");
        }
        catch { logFile = null; }
        try { return Launch(args); }
        catch (Exception ex) { Fail("Could not launch Planwharf.\n" + ex.Message); return 1; }
    }

    static int Launch(string[] args)
    {
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string script = Path.Combine(root, "planwharf.cjs");
        if (!File.Exists(script))
        {
            Fail("planwharf.cjs is missing next to Planwharf.exe.");
            return 1;
        }
        string node = FindNode();
        if (node == null)
        {
            Fail("Node.js was not found. Install Node.js, then double-click Planwharf.exe again.");
            return 1;
        }

        var psi = new ProcessStartInfo();
        Record("Node.js: " + node);
        Record("Application: " + script);
        psi.FileName = node;
        psi.Arguments = Quote(script) + JoinArgs(args);
        psi.WorkingDirectory = root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;

        Process child;
        var log = new StringBuilder();
        try
        {
            child = Process.Start(psi);
        }
        catch (Exception ex)
        {
            Fail("Could not start Node.js.\n" + ex.Message);
            return 1;
        }
        if (child == null)
        {
            Fail("Could not start Node.js.");
            return 1;
        }
        child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) { Record(e.Data); lock (log) { log.AppendLine(e.Data); if (log.Length > 65536) log.Remove(0, log.Length - 65536); } }
        };
        child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) { Record(e.Data); lock (log) { log.AppendLine(e.Data); if (log.Length > 65536) log.Remove(0, log.Length - 65536); } }
        };
        child.BeginOutputReadLine();
        child.BeginErrorReadLine();
        child.WaitForExit();
        Record("Node.js exited with code " + child.ExitCode + ".");
        if (child.ExitCode != 0)
        {
            string text;
            lock (log) text = log.ToString().Trim();
            if (text.Length == 0) text = "Planwharf stopped with code " + child.ExitCode + ".";
            Fail(text);
        }
        return child.ExitCode;
    }

    static string FindNode()
    {
        string env = Environment.GetEnvironmentVariable("PLANWHARF_NODE");
        if (!string.IsNullOrWhiteSpace(env) && File.Exists(env)) return env;
        string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in pathEnv.Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            string exe = Path.Combine(dir.Trim().Trim('"'), "node.exe");
            if (File.Exists(exe)) return exe;
        }
        string nvm = Environment.GetEnvironmentVariable("NVM_SYMLINK");
        string[] extra = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
            nvm == null ? null : Path.Combine(nvm, "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe")
        };
        foreach (string exe in extra)
        {
            if (!string.IsNullOrWhiteSpace(exe) && File.Exists(exe)) return exe;
        }
        return null;
    }

    static string JoinArgs(string[] args)
    {
        if (args == null || args.Length == 0) return "";
        var text = new StringBuilder();
        foreach (string arg in args) text.Append(' ').Append(Quote(arg));
        return text.ToString();
    }

    static string Quote(string value)
    {
        if (value == null) return "\"\"";
        // Windows doubles backslashes before quotes, including the closing quote.
        var text = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            text.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
            text.Append(c);
            slashes = 0;
        }
        text.Append('\\', slashes * 2);
        text.Append('"');
        return text.ToString();
    }

    static void Record(string message)
    {
        if (logFile == null) return;
        try { lock (logGate) File.AppendAllText(logFile, DateTime.UtcNow.ToString("o") + " " + message + Environment.NewLine, Encoding.UTF8); }
        catch { /* Diagnostics must not prevent application startup. */ }
    }

    static void Fail(string message)
    {
        Record(message);
        if (logFile != null) message += "\n\nStartup log: " + logFile;
        MessageBox.Show(message, "Planwharf", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
