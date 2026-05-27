/*
 * vorbisFile.dll open.mp/SA-MP loader proxy (32-bit, for GTA SA under
 * Wine/macOS).
 *
 * GTA SA statically imports vorbisFile.dll for Ogg user-track playback, so
 * Windows/Wine loads this DLL automatically at process start. Every export
 * is forwarded to the renamed real DLL (vorbisFile_o.dll, see loader.def),
 * so game audio is unaffected. DllMain starts a small worker that loads
 * samp.dll first, then the open.mp client into gta_sa.exe.
 *
 * Once the client DLLs are in the process they parse gta_sa.exe's command line
 * (-c -n <name> -h <ip> -p <port> [-z <pass>]) and connects to that server.
 *
 * The client DLLs are loaded ONLY when the game was started in connect mode
 * (the "-c" flag). A plain launch — double-clicking gta-sa.exe in CrossOver,
 * or any start that does not come from the launcher — has no "-c", so the
 * proxy just forwards audio and the game runs as normal single-player GTA SA.
 */
#include <windows.h>

/*
 * True if gta_sa.exe was launched to connect to a server. The launcher always
 * passes "-c" (SA-MP/open.mp connect mode); a normal launch never does. The
 * flag is matched only as a standalone argument (surrounded by whitespace,
 * a quote, or a string boundary) so an exe path is never mistaken for it.
 */
static BOOL LaunchedForMultiplayer(void)
{
    const char *cmd = GetCommandLineA();
    if (!cmd)
    {
        return FALSE;
    }

    for (const char *p = cmd; *p; ++p)
    {
        if (p[0] != '-' || (p[1] != 'c' && p[1] != 'C'))
        {
            continue;
        }

        char before = (p == cmd) ? ' ' : p[-1];
        char after = p[2];
        BOOL boundary_before =
            (before == ' ' || before == '\t' || before == '"');
        BOOL boundary_after =
            (after == '\0' || after == ' ' || after == '\t' || after == '"');

        if (boundary_before && boundary_after)
        {
            return TRUE;
        }
    }

    return FALSE;
}

static DWORD WINAPI LoadClients(LPVOID reserved)
{
    (void)reserved;

    /*
     * Order matters: samp.dll must be mapped (and given a moment to apply its
     * own patches) before omp-client.dll. omp-client.dll patches samp.dll/GTA
     * code at attach time; loading it first faults 0xC0000005 because samp.dll
     * is not yet in the process. This matches the Windows injector order
     * (injector.rs run_samp: samp.dll, then omp_file). If omp-client.dll is
     * missing or disabled, SA-MP still loads normally.
     */
    LoadLibraryA("samp.dll");
    Sleep(1500);
    LoadLibraryA("omp-client.dll");

    return 0;
}

BOOL WINAPI DllMain(HINSTANCE inst, DWORD reason, LPVOID reserved)
{
    (void)reserved;
    if (reason == DLL_PROCESS_ATTACH)
    {
        DisableThreadLibraryCalls(inst);

        /* Plain single-player launch: forward audio only, load no client. */
        if (!LaunchedForMultiplayer())
        {
            return TRUE;
        }

        HANDLE thread = CreateThread(NULL, 0, LoadClients, NULL, 0, NULL);
        if (thread)
        {
            CloseHandle(thread);
        }
    }
    return TRUE;
}
