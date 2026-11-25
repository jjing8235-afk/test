import { copyFile, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { patchChatRenderer, patchMessageTags } from './chat-renderer-patch.mjs';
import { patchKeyboardScan } from './keyboard-scan-patch.mjs';

const files = [
    ['public/script.js', 'nvwa.liquidGlass.chatPerformance', patchChatRenderer],
    ['public/scripts/tags.js', 'nvwa.liquidGlass.messageTags', patchMessageTags],
    ['public/scripts/keyboard.js', 'nvwa.liquidGlass.keyboard', patchKeyboardScan],
];

async function readOptional(file) {
    try { return await readFile(file, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return undefined; }
}

async function replaceFile(file, contents) {
    const temp = `${file}.nvwa-${randomUUID()}`;
    try {
        await writeFile(temp, contents, { flag: 'wx', mode: (await stat(file)).mode });
        await rename(temp, file);
    } finally {
        await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
}

function patchForFile(original, patch) {
    const patched = patch(original);
    return original.includes('\r\n') && !original.replaceAll('\r\n', '').includes('\n')
        ? patched.replaceAll('\n', '\r\n') : patched;
}

async function inspect(host, backupDirectory, [name, marker, patch], action) {
    const file = path.join(host, name);
    const backup = path.join(backupDirectory, path.basename(name));
    const current = await readOptional(file);
    if (current === undefined) return { name, status: 'skipped (host file missing)' };
    if (await realpath(file) !== file) throw new Error(`Unexpected linked host file: ${name}`);
    const oldBackup = await readOptional(backup);
    if (oldBackup !== undefined && await realpath(backup) !== backup) {
        throw new Error(`Unexpected linked backup: ${backup}`);
    }
    const entry = { name, file, backup, current, oldBackup };
    if (current.includes(marker)) {
        let matches = false;
        try { matches = oldBackup !== undefined && patchForFile(oldBackup, patch) === current; }
        catch { /* Preserve patched files with an unrecognized backup. */ }
        if (!matches) return { name, status: 'skipped (existing bridge or backup differs)' };
        return action === 'revert' ? { ...entry, next: oldBackup, status: 'restored' }
            : { name, status: 'already enabled' };
    }
    if (action === 'revert') return { name, status: 'original' };

    let next;
    try { next = patchForFile(current, patch); }
    catch (error) { return { name, status: `skipped (${error.message})` }; }
    const syntax = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: next });
    if (syntax.error) throw syntax.error;
    if (syntax.status !== 0) return { name, status: 'skipped (generated source did not pass syntax check)' };
    return action === 'status' ? { name, status: 'available' } : { ...entry, next, status: 'enabled' };
}

async function main() {
    const [action, directory, ...extra] = process.argv.slice(2);
    if (!['apply', 'revert', 'status'].includes(action) || !directory || extra.length) {
        throw new Error('Usage: node prepare.mjs <apply|revert|status> <SillyTavern directory>');
    }
    const host = await realpath(directory);
    const { name, version } = JSON.parse(await readFile(path.join(host, 'package.json'), 'utf8'));
    if (!['sillytavern', 'tauritavern'].includes(name?.toLowerCase())) throw new Error('Not a SillyTavern or TauriTavern source directory.');
    const backupDirectory = path.join(host, '.nvwa-host-performance');
    const backupLocation = await realpath(backupDirectory).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return backupDirectory;
    });
    if (backupLocation !== backupDirectory) throw new Error('Unexpected linked backup directory.');

    const entries = [];
    for (const file of files) entries.push(await inspect(host, backupDirectory, file, action));
    const changes = entries.filter(entry => entry.next !== undefined);

    if (action === 'apply' && changes.length) {
        await mkdir(backupDirectory, { recursive: true });
        if (await realpath(backupDirectory) !== backupDirectory) throw new Error('Unexpected linked backup directory.');
        for (const entry of changes) {
            if (await readFile(entry.file, 'utf8') !== entry.current) throw new Error(`Host file changed during setup: ${entry.name}`);
            if (entry.oldBackup === undefined) await copyFile(entry.file, entry.backup, constants.COPYFILE_EXCL);
            else if (entry.oldBackup !== entry.current) {
                if (await readFile(entry.backup, 'utf8') !== entry.oldBackup) throw new Error(`Backup changed during setup: ${entry.name}`);
                await replaceFile(entry.backup, entry.current);
            }
        }
    }

    const completed = [];
    try {
        for (const entry of changes) {
            if (await readFile(entry.file, 'utf8') !== entry.current) throw new Error(`Host file changed during setup: ${entry.name}`);
            await replaceFile(entry.file, entry.next);
            completed.push(entry);
        }
    } catch (error) {
        for (const entry of completed.reverse()) {
            if (await readFile(entry.file, 'utf8') === entry.next) await replaceFile(entry.file, entry.current);
        }
        throw error;
    }
    console.log(`${name} ${version ?? ''}`.trim());
    for (const entry of entries) console.log(`${entry.name}: ${entry.status}`);
}

try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
