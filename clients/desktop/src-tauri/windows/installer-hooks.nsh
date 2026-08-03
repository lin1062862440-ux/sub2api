!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LinAI"

  SetShellVarContext current
  Delete "$DESKTOP\LinAI.lnk"
  Delete "$SMPROGRAMS\LinAI.lnk"

  SetShellVarContext all
  Delete "$DESKTOP\LinAI.lnk"
  Delete "$SMPROGRAMS\LinAI.lnk"
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  ; The custom installer may have written per-user settings while the payload
  ; itself is installed per-machine. Clear both registry views so uninstalling
  ; never leaves stale startup, protocol, product, or uninstall entries.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "LinAI"

  DeleteRegKey HKCU "Software\Classes\linai"
  DeleteRegKey HKLM "Software\Classes\linai"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LinAI"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\LinAI"

  DeleteRegKey HKCU "Software\lin\LinAI"
  DeleteRegKey HKLM "Software\lin\LinAI"
  DeleteRegKey /ifempty HKCU "Software\lin"
  DeleteRegKey /ifempty HKLM "Software\lin"
!macroend
