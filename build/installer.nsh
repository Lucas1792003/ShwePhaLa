# electron-builder reuses the same "cannot be closed" text for three different
# conditions: a live app process, the old uninstaller failing to move a busy
# file, and the new installer failing to replace a busy file. Real Task Manager
# checks showed that the dialog can appear after every app process is gone, so
# process absence alone is not a sufficient readiness check.
#
# Wait in two phases:
#   1. Let electron-updater's app.quit() finish gracefully. Only use taskkill
#      if an exact-name tasklist query proves the app is still alive after the
#      bounded grace period. Do not use /T: the detached installer is a child of
#      the old app and must never be included in a process-tree kill.
#   2. Probe the files NSIS must remove/replace by opening them for write. This
#      tests the actual failure condition instead of guessing with a fixed
#      "settle" sleep after Task Manager looks clean.

!macro waitForWritableFile FILE DESCRIPTION
  !define UniqueID ${__LINE__}
  ${if} ${FileExists} "${FILE}"
    StrCpy $R3 0
    waitForWritableFile_${UniqueID}:
      IntOp $R3 $R3 + 1
      ClearErrors
      FileOpen $R4 "${FILE}" a
      IfErrors fileStillLocked_${UniqueID} fileIsWritable_${UniqueID}

    fileStillLocked_${UniqueID}:
      ${if} $R3 < 60
        DetailPrint `Waiting for ${DESCRIPTION} to become writable...`
        !insertmacro diagLog "Waiting for ${DESCRIPTION} to become writable... (${FILE})"
        Sleep 500
        Goto waitForWritableFile_${UniqueID}
      ${endIf}
      DetailPrint `Timed out waiting for ${DESCRIPTION}; continuing so NSIS can report the exact install failure.`
      !insertmacro diagLog "TIMED OUT waiting for ${DESCRIPTION} to become writable (${FILE})"
      Goto writableProbeDone_${UniqueID}

    fileIsWritable_${UniqueID}:
      FileClose $R4
      DetailPrint `${DESCRIPTION} is writable.`
      !insertmacro diagLog "${DESCRIPTION} is writable (${FILE})"

    writableProbeDone_${UniqueID}:
  ${endIf}
  !undef UniqueID
!macroend

# ============================================================
# DIAGNOSTIC-ONLY instrumentation.
#
# Added to pin down which specific file/step actually fails the next time
# "cannot be closed" reproduces on a build that already has the v1.0.10
# wait-then-probe fix above — v1.0.10 only probes 2 files (the exe and
# app.asar), but the extraction step that actually generates this dialog
# (electron-builder's own extractAppPackage.nsh, NOT customizable) copies
# the entire unpacked app in one CopyFiles batch: every Chromium runtime
# DLL, every .pak/.dat/.bin resource, and the locales folder too. Any one
# of those being transiently locked (most likely: Windows hasn't finished
# releasing a memory-mapped DLL, or AV is scanning it, right after the old
# process exited) fails the whole batch and triggers the same generic
# dialog electron-builder also reuses for two OTHER, unrelated conditions
# (a live process, or the old uninstaller failing).
#
# IMPORTANT: this installer sets `ShowInstDetails nevershow` (electron-
# builder's own common.nsh, not ours — not something we're changing here).
# That means the installer's details/log pane is never exposed to the
# user through the UI at all, in EITHER one-click or assisted mode — a
# plain DetailPrint alone would be invisible. So every diagnostic line
# below goes through diagLog, which DetailPrints (harmless, matches
# existing style, costs nothing) AND appends to a real log file on disk —
# that file is the only reliable way to actually retrieve this output.
# See the file path in diagLog below.
#
# Nothing in this file waits, retries, kills a process, or changes what
# NSIS actually does — every new line is DetailPrint/file-write only.
# Safe to ship in a release build and leave running indefinitely.
#
# One limitation this can't close without patching electron-builder's own
# template (not done here): extractAppPackage.nsh's retry loop DetailPrints
# `Can't modify "${PRODUCT_NAME}"'s files.` on every failed attempt right
# before it shows the dialog, which *would* distinguish "extraction failed"
# from "old-uninstaller failed" for free — but that DetailPrint is inside
# electron-builder's own file, not ours, so it is NOT mirrored into
# installer-diagnostics.log and is invisible under ShowInstDetails
# nevershow. Our diagLogHeader/diagProbeKnownFiles/diagScanTopLevelFiles
# calls above run immediately before both of those steps, and our
# customInstall hook below fires only if BOTH steps succeeded — so the log
# still narrows a failure to "old-uninstall or extraction" (by whether
# customInstall's line appears at all) even without seeing that specific
# built-in print.
# ============================================================

!macro diagLog TEXT
  DetailPrint `${TEXT}`
  CreateDirectory "$APPDATA\retails-shop\logs"
  FileOpen $R5 "$APPDATA\retails-shop\logs\installer-diagnostics.log" a
  ${if} $R5 != ""
    FileSeek $R5 0 END
    FileWrite $R5 `${TEXT}$\r$\n`
    FileClose $R5
  ${endIf}
!macroend

!macro diagLogHeader
  !insertmacro diagLog "================================================"
  !insertmacro diagLog "[diag] PRODUCT_NAME            = ${PRODUCT_NAME}"
  !insertmacro diagLog "[diag] APP_EXECUTABLE_FILENAME = ${APP_EXECUTABLE_FILENAME}"
  !insertmacro diagLog "[diag] This run's $$INSTDIR    = $INSTDIR"
  ReadRegStr $R6 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  !insertmacro diagLog "[diag] Registered InstallLocation (previous install, if any) = $R6"
  ${if} $R6 != ""
  ${andIf} $R6 != $INSTDIR
    !insertmacro diagLog "[diag] *** MISMATCH: this run is targeting a different directory than the previously-registered install ***"
  ${endIf}
  !insertmacro diagLog "[diag] Win32 error code legend for the lines below:"
  !insertmacro diagLog "[diag]   32 = ERROR_SHARING_VIOLATION -> a real lock: another handle has the file open right now"
  !insertmacro diagLog "[diag]    5 = ERROR_ACCESS_DENIED      -> permissions or a read-only attribute, not necessarily a live lock"
  !insertmacro diagLog "[diag]    2 = ERROR_FILE_NOT_FOUND     -> file vanished between the exists-check and the open attempt"
  !insertmacro diagLog "[diag]    3 = ERROR_PATH_NOT_FOUND     -> directory mismatch, the expected folder isn't there"
  !insertmacro diagLog "[diag]   19 = ERROR_WRITE_PROTECT      -> the volume/media itself is write-protected"
  !insertmacro diagLog "[diag]   (any other number: look it up at https://learn.microsoft.com/windows/win32/debug/system-error-codes)"
  !insertmacro diagLog "================================================"
!macroend

# One-shot probe: does FILE exist, and can it be opened for write right
# now? No retry, no wait — this is a snapshot, not the gate that decides
# whether install proceeds (waitForWritableFile above is still what
# actually gates that, unchanged). On failure, decodes the real Win32
# error via GetLastError so "locked" and "permission denied" aren't
# guessed apart — also separately reports the read-only attribute bit,
# since that's a distinct condition from a live handle lock.
!macro diagProbeFile FILE LABEL
  ${if} ${FileExists} "${FILE}"
    System::Call 'kernel32::GetFileAttributes(t "${FILE}") i.r7'
    IntOp $R8 $7 & 1
    ClearErrors
    FileOpen $R6 "${FILE}" a
    ${if} ${errors}
      System::Call 'kernel32::GetLastError() i.r9'
      !insertmacro diagLog "[diag] NOT WRITABLE  ${LABEL} | winerr=$9 | read-only-attr=$R8 | ${FILE}"
    ${else}
      FileClose $R6
      !insertmacro diagLog "[diag] writable OK   ${LABEL} | read-only-attr=$R8 | ${FILE}"
    ${endIf}
  ${else}
    !insertmacro diagLog "[diag] not present    ${LABEL} | ${FILE}"
  ${endIf}
!macroend

# Named checks cover the specific files most likely to matter (the exe,
# app.asar, the Chromium/Electron runtime files that ship next to it, and
# one representative locale file). This does NOT enumerate the new
# version's file list, because it can't: $PLUGINSDIR\7z-out (the unpacked
# new version) doesn't exist yet at this point in the install — it's only
# created inside electron-builder's own extractUsing7za, which we are not
# patching. What we CAN check ahead of time is the CURRENTLY INSTALLED
# (old-version) copy of every file about to be overwritten, which is
# exactly where a transient lock would show up.
!macro diagProbeKnownFiles
  !insertmacro diagLog "[diag] --- probing known application files under $INSTDIR ---"
  !insertmacro diagProbeFile "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "main executable"
  !insertmacro diagProbeFile "$INSTDIR\resources\app.asar" "app bundle"
  !insertmacro diagProbeFile "$INSTDIR\chrome_100_percent.pak" "chromium resource"
  !insertmacro diagProbeFile "$INSTDIR\chrome_200_percent.pak" "chromium resource"
  !insertmacro diagProbeFile "$INSTDIR\d3dcompiler_47.dll" "chromium runtime dll"
  !insertmacro diagProbeFile "$INSTDIR\ffmpeg.dll" "chromium runtime dll"
  !insertmacro diagProbeFile "$INSTDIR\icudtl.dat" "chromium resource"
  !insertmacro diagProbeFile "$INSTDIR\libEGL.dll" "chromium runtime dll"
  !insertmacro diagProbeFile "$INSTDIR\libGLESv2.dll" "chromium runtime dll"
  !insertmacro diagProbeFile "$INSTDIR\resources.pak" "chromium resource"
  !insertmacro diagProbeFile "$INSTDIR\snapshot_blob.bin" "v8 snapshot (older electron)"
  !insertmacro diagProbeFile "$INSTDIR\v8_context_snapshot.bin" "v8 snapshot"
  !insertmacro diagProbeFile "$INSTDIR\vk_swiftshader.dll" "chromium runtime dll"
  !insertmacro diagProbeFile "$INSTDIR\vk_swiftshader_icd.json" "chromium runtime config"
  !insertmacro diagProbeFile "$INSTDIR\vulkan-1.dll" "chromium runtime dll"
  !insertmacro diagProbeFile "$INSTDIR\locales\en-US.pak" "locale (representative sample)"
  !insertmacro diagLog "[diag] --- end known-file probe ---"
!macroend

# Generic sweep to catch anything the named list above missed — every
# top-level file directly in $INSTDIR (not recursing into subfolders,
# to keep output readable; the named list above already covers the one
# subfolder file most worth checking). Directories are skipped via the
# FILE_ATTRIBUTE_DIRECTORY bit (0x10), not the fragile "\*.*" exists trick.
!macro diagScanTopLevelFiles DIR
  !insertmacro diagLog "[diag] --- scanning every top-level file in ${DIR} ---"
  FindFirst $R7 $8 "${DIR}\*.*"
  diagScanLoop:
    StrCmp $8 "" diagScanDone
    StrCmp $8 "." diagScanNext
    StrCmp $8 ".." diagScanNext
    System::Call 'kernel32::GetFileAttributes(t "${DIR}\$8") i.r7'
    IntOp $7 $7 & 16
    ${if} $7 == 16
      Goto diagScanNext
    ${endIf}
    !insertmacro diagProbeFile "${DIR}\$8" "top-level scan"
    diagScanNext:
    FindNext $R7 $8
    Goto diagScanLoop
  diagScanDone:
  FindClose $R7
  !insertmacro diagLog "[diag] --- end top-level scan ---"
!macroend

!macro customCheckAppRunning
  !insertmacro diagLogHeader
  DetailPrint `Waiting for "${PRODUCT_NAME}" to exit cleanly...`
  !insertmacro diagLog "[diag] Waiting for ${APP_EXECUTABLE_FILENAME} to exit (tasklist poll, up to 15s)..."
  StrCpy $R2 0
  waitForAppExit:
    IntOp $R2 $R2 + 1
    nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $0
    ${if} $0 == 0
    ${andIf} $R2 < 30
      Sleep 500
      Goto waitForAppExit
    ${endIf}

  # tasklist exit code 0 means an exact executable-name match still exists.
  # At this point the bounded graceful wait has expired, so a targeted force
  # close is evidence-based. /T is intentionally omitted to protect setup.exe.
  ${if} $0 == 0
    DetailPrint `"${PRODUCT_NAME}" is still running after 15 seconds; forcing only ${APP_EXECUTABLE_FILENAME} to close...`
    !insertmacro diagLog "[diag] ${APP_EXECUTABLE_FILENAME} STILL RUNNING after 15s tasklist poll -- taskkill /F /IM issued (evidence: tasklist exit code 0)"
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $0

    StrCpy $R2 0
    waitAfterTargetedClose:
      IntOp $R2 $R2 + 1
      nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
      Pop $0
      ${if} $0 == 0
      ${andIf} $R2 < 20
        Sleep 500
        Goto waitAfterTargetedClose
      ${endIf}
  ${else}
    !insertmacro diagLog "[diag] ${APP_EXECUTABLE_FILENAME} was already gone from tasklist -- no taskkill needed (matches the user-reported repro: Task Manager shows nothing, dialog still fires later)"
  ${endIf}

  !insertmacro waitForWritableFile "$INSTDIR\${APP_EXECUTABLE_FILENAME}" `the installed application`
  !insertmacro waitForWritableFile "$INSTDIR\resources\app.asar" `the application package`

  # Diagnostic snapshot taken right after the two waits above — i.e. at
  # the exact moment control is about to pass to uninstallOldVersion and
  # then extraction, the two remaining steps that can show "cannot be
  # closed". Purely informational; does not affect what happens next.
  !insertmacro diagProbeKnownFiles
  !insertmacro diagScanTopLevelFiles "$INSTDIR"
  !insertmacro diagLog "[diag] Probe complete. Proceeding to uninstall the old version, then extract the new one."
!macroend

# Fires once file installation has actually succeeded (electron-builder's
# own hook, inserted right after extraction — see installSection.nsh).
# Reaching this line at all is itself useful evidence: it means neither
# the old-uninstaller step nor the extraction step showed the dialog this
# run. Also confirms extraction actually wrote to the directory we
# expected (see diagLogHeader's $INSTDIR log above).
!macro customInstall
  !insertmacro diagLog "[diag] File installation completed with no 'cannot be closed' dialog this run."
  !insertmacro diagLog "[diag] Files were written to $$OUTDIR = $OUTDIR (should equal $$INSTDIR = $INSTDIR)"
  ${if} $OUTDIR != $INSTDIR
    !insertmacro diagLog "[diag] *** MISMATCH: $$OUTDIR does not equal $$INSTDIR ***"
  ${endIf}
!macroend

# ============================================================
# Closes the one remaining blind spot: uninstallOldVersion (installSection.nsh)
# silently runs the OLD version's own already-compiled uninstaller.exe to
# remove the previous install, then calls handleUninstallResult to check
# whether that succeeded. That check is what customUnInstallCheck /
# customUnInstallCheckCurrentUser below replace — so this tells us, for the
# very first time, whether the "old uninstall" step or the "extraction" step
# is the one actually failing, without needing to touch or rebuild the old
# (undiagnosed) uninstaller.exe itself.
#
# Unlike everything above, this one is NOT purely additive: electron-builder
# only calls a hook here AT ALL if we define one, and if we do, we own the
# ENTIRE result-check — there's no "run theirs, then also run mine". So the
# logic below is copied verbatim from handleUninstallResult's Function body
# (installUtil.nsh) — same IfErrors check, same MessageBox/DetailPrint text,
# same SetErrorLevel 2 + Quit on real failure — with diagLog calls added
# around it and named labels used instead of their relative "+3"-style jumps
# (safer to hand-maintain; a relative offset silently breaks if anyone ever
# adds a line above it, a named label can't).
# ============================================================
!macro diagHandleUninstallResult CONTEXT
  !insertmacro diagLog "[diag] Old-version uninstall (${CONTEXT}) step reached. Raw ExecWait exit code in $$R0 = $R0"
  IfErrors diagUninstallLaunchFailed_${CONTEXT} diagUninstallLaunchOk_${CONTEXT}

  diagUninstallLaunchFailed_${CONTEXT}:
    !insertmacro diagLog "[diag] Old-version uninstall (${CONTEXT}): the OLD uninstaller.exe could NOT be launched at all (IfErrors was set before/instead of a real exit code)."
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
    Return

  diagUninstallLaunchOk_${CONTEXT}:
  ${if} $R0 != 0
    !insertmacro diagLog "[diag] Old-version uninstall (${CONTEXT}) FAILED -- non-zero exit code $R0 from the OLD uninstaller.exe."
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0"
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${else}
    !insertmacro diagLog "[diag] Old-version uninstall (${CONTEXT}) succeeded (exit code 0). If the dialog still appears after this line, extraction is the confirmed failure point."
  ${endIf}
!macroend

!macro customUnInstallCheck
  !insertmacro diagHandleUninstallResult "SHELL_CONTEXT"
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro diagHandleUninstallResult "HKEY_CURRENT_USER"
!macroend
