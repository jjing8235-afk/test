import { copyFile, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { patchChatRenderer, patchMessageTags } from './chat-renderer-patch.mjs';
import { patchKeyboardScan } from './keyboard-scan-patch.mjs';

const files = [
    ['public/script.js', patchChatRenderer],
    ['public/scripts/tags.js', patchMessageTags],
    ['public/scripts/keyboard.js', patchKeyboardScan],
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

async function main() {
    const [action, directory, ...extra] = process.argv.slice(2);
    if (!['apply', 'revert'].includes(action) || !directory || extra.length) {
        throw new Error('Usage: node prepare.mjs <apply|revert> <SillyTavern directory>');
    }
    const host = await realpath(directory);
    const version = JSON.parse(await readFile(path.join(host, 'package.json'), 'utf8')).version;
    if (version !== '1.18.0') throw new Error(`Unsupported SillyTavern version: ${version}`);
    const backupDirectory = path.join(host, '.nvwa-host-performance');
    const entries = [];

    // Check the entire set of source files and backups before writing anything.
    for (const [name, patch] of files) {
        const file = path.join(host, name);
        if (await realpath(file) !== file) throw new Error(`Unexpected linked host file: ${name}`);
        const current = await readFile(file, 'utf8');
        const backup = path.join(backupDirectory, path.basename(name));
        const existingBackup = await readOptional(backup);
        if (existingBackup !== undefined && await realpath(backup) !== backup) {
            throw new Error(`Unexpected linked backup: ${backup}`);
        }
        const original = existingBackup ?? current;
        let patched = patch(original);
        if (original.includes('\r\n') && !original.replaceAll('\r\n', '').includes('\n')) {
            patched = patched.replaceAll('\n', '\r\n');
        }
        if (current !== original && current !== patched) throw new Error(`Unrecognized local change: ${name}`);
        entries.push({ file, backup, existingBackup, current, next: action === 'apply' ? patched : original });
    }

    const changes = entries.filter(entry => entry.current !== entry.next);
    if (!changes.length) {
        console.log(action === 'apply' ? 'NVWA host performance bridge is already enabled.' : 'SillyTavern host files already use the original code.');
        return;
    }
    if (action === 'apply') {
        await mkdir(backupDirectory, { recursive: true });
        if (await realpath(backupDirectory) !== backupDirectory) throw new Error('Unexpected linked backup directory.');
        for (const entry of entries) {
            if (entry.existingBackup === undefined) await copyFile(entry.file, entry.backup, constants.COPYFILE_EXCL);
        }
    }

    const completed = [];
    try {
        for (const entry of changes) {
            if (await readFile(entry.file, 'utf8') !== entry.current) throw new Error(`Host file changed during setup: ${entry.file}`);
            await replaceFile(entry.file, entry.next);
            completed.push(entry);
        }
    } catch (error) {
        for (const entry of completed.reverse()) {
            if (await readFile(entry.file, 'utf8') === entry.next) await replaceFile(entry.file, entry.current);
        }
        throw error;
    }
    console.log(action === 'apply' ? 'NVWA host performance bridge enabled.' : 'Original SillyTavern host files restored.');
}

try { await main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
