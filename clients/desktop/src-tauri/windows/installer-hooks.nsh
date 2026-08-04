!macro NSIS_HOOK_PREINSTALL
  ; LINAI_UPDATE_INSTALL_DIR_GUARD
  ; Tauri's updater launches this NSIS payload with /UPDATE. Never let an
  ; update fall back to Program Files when the original custom directory is
  ; missing from the registry.
  ${If} $UpdateMode = 1
    ReadRegStr $R9 SHCTX "${MANUPRODUCTKEY}" ""
    ${If} $R9 == ""
      MessageBox MB_ICONSTOP|MB_OK "无法确认当前安装目录，已取消更新。请使用完整安装包修复安装。"
      SetErrorLevel 1
      Quit
    ${EndIf}
    ${IfNot} ${FileExists} "$R9\${MAINBINARYNAME}.exe"
      MessageBox MB_ICONSTOP|MB_OK "安装目录记录与当前程序不匹配，已取消更新。请使用完整安装包修复安装。"
      SetErrorLevel 1
      Quit
    ${EndIf}
    StrCpy $INSTDIR $R9
  ${EndIf}
!macroend

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
