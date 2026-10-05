export type SceneName = 'terminal' | 'scm' | 'debug' | 'testing' | 'extensions' | 'chat' | 'problems' | 'output';
export const DECOY_ACTIONS: Readonly<Record<string, SceneName>> = Object.freeze({
    'reader.decoy.terminal': 'terminal', 'reader.decoy.scm': 'scm', 'reader.decoy.debug': 'debug', 'reader.decoy.testing': 'testing', 'reader.decoy.extensions': 'extensions', 'reader.decoy.chat': 'chat', 'reader.decoy.problems': 'problems', 'reader.decoy.output': 'output'
});
const scenes: Record<SceneName, string[]> = {
    terminal: ['workspace › inventory-service', '> npm run verify', '✓ schema checks  12 / 12', '✓ module registry  8 / 8', 'Completed in 0.42s.', ''],
    scm: ['inventory-service  main', 'Changes (3)', 'M  src/modules/module-0001.ts', 'M  src/config.ts', 'A  test/registry.test.ts'],
    debug: ['Launch: inventory-service', 'Paused on breakpoint', 'Variables', 'request: { id: 1042, status: "ready" }', 'Call stack', 'validateRecord  module-0001.ts:24', 'bootstrap  index.ts:8'],
    testing: ['Registry tests', '✓ accepts valid records', '✓ rejects duplicate identifiers', '✓ keeps insertion order', 'Schema tests', '✓ defaults optional fields', '✓ validates revision'],
    extensions: ['Workspace Color Theme  1.0.0', 'Active in this workspace', 'Module Icons  1.0.0', 'Active in this workspace'],
    chat: ['You: Summarize the module layout.', 'Assistant: Each module exports a revision and a records array. The registry preserves source order.', 'You: What should be reviewed next?', 'Assistant: Check boundary conditions in the registry fixture.'],
    problems: ['No problems have been detected in the workspace.'],
    output: ['[info] Loading workspace configuration', '[info] Module catalog ready', '[info] Schema validation completed']
};
export function getScene(name: SceneName): string[] { if (!Object.hasOwn(scenes, name))
    throw new Error('Unknown scene'); return [...scenes[name]]; }
export function replayTerminal(lines: string[], input: string): string[] {
    const bounded = input.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1024);
    const reply = bounded.trim() === 'clear' ? [] : bounded.trim() === 'help' ? ['Available scene inputs: help, clear, npm run verify.'] : bounded.trim() === 'npm run verify' ? getScene('terminal').slice(1) : ['Scene input recorded; select a fixture command to replay.'];
    return [...lines, `> ${bounded}`, ...reply].slice(-100);
}
export function sceneDocument(scene: SceneName, line: string): {
    name: string;
    source: string;
} {
    const name = scene === 'scm' ? line.trim().split('/').pop() ?? 'config.ts' : scene === 'testing' ? 'registry.test.ts' : scene === 'debug' ? 'module-0001.ts' : 'workspace.ts';
    const source = scene === 'testing' ? 'describe("registry", () => {\n  it("accepts valid records", () => {\n    expect(validate({ id: 1042, revision: 1 })).toEqual(true);\n  });\n});\n' : scene === 'scm' ? 'export const configuration = {\n  revision: 2,\n  strict: true,\n  preserveOrder: true\n};\n' : 'export const module0001 = {\n  revision: 1,\n  records: ["validate schema", "resolve registry"]\n};\n';
    return { name, source };
}
