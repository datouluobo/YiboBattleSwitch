# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['E:\\Program\\YiboBattleSwitch\\prototype\\web\\desktop_app.py'],
    pathex=[],
    binaries=[],
    datas=[('E:\\Program\\YiboBattleSwitch\\prototype\\web\\index.html', '.'), ('E:\\Program\\YiboBattleSwitch\\prototype\\newbeebox_account_switcher_prototype.pyw', '.'), ('E:\\Program\\YiboBattleSwitch\\logo.png', '.'), ('E:\\Program\\YiboBattleSwitch\\prototype\\web\\app-icon.ico', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='YiboBattleSwitch',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['E:\\Program\\YiboBattleSwitch\\prototype\\web\\app-icon.ico'],
    manifest='E:\\Program\\YiboBattleSwitch\\prototype\\web\\app.manifest',
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='YiboBattleSwitch',
)
