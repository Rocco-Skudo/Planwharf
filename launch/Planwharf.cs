using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class Planwharf
{
    [STAThread]
    static int Main(string[] args)
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
            if (e.Data != null) lock (log) log.AppendLine(e.Data);
        };
        child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) lock (log) log.AppendLine(e.Data);
        };
        child.BeginOutputReadLine();
        child.BeginErrorReadLine();
        child.WaitForExit();
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
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    static void Fail(string message)
    {
        MessageBox.Show(message, "Planwharf", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
