// These bootstrap globals must exist before retained core modules evaluate FileAccess.
globalThis._VSCODE_FILE_ROOT = 'reader://app/';
Object.assign(window, { vscodeWindowId: 1 });
