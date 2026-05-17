import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { processManager } from '../core/processManager.js';
import { downloadJdk } from '../java/downloader.js';
import { downloadVersionFiles } from '../download/downloader.js';
import { undoDeleteInstance, listInstances } from '../core/instance.js';
import { PATHS } from '../store/paths.js';
import { t } from '../i18n/index.js';
import * as child_process from 'child_process';

interface Props {
  language: string;
  onExit: () => void;
  onLaunch: (instanceId: string, accountId: string) => void;
  onQuit: (killAll?: boolean, killBesidesInstance?: string) => void;
}

const CommandLine: React.FC<Props> = ({ language, onExit, onLaunch, onQuit }) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const addOutput = (line: string) => {
    setOutput(prev => [...prev.slice(-50), line]);
  };

  const openFolder = (dir: string) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    child_process.exec(`${cmd} "${dir}"`);
  };

  const executeCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    addOutput(`> //${trimmed}`);

    if (trimmed === 'help') {
      addOutput(t('cmd.helpList', language));
      return;
    }

    if (trimmed === 'exit') {
      onExit();
      return;
    }

    // //undodelete
    if (trimmed === 'undodelete') {
      const restored = undoDeleteInstance();
      if (restored) {
        addOutput(`${t('cmd.undeleted', language)}: ${restored.name}`);
      } else {
        addOutput(t('cmd.noUndo', language));
      }
      return;
    }

    // //launch <instance name>
    const launchMatch = trimmed.match(/^launch\s+(.+)$/i);
    if (launchMatch) {
      const name = launchMatch[1].trim();
      const instances = listInstances();
      const inst = instances.find(i => i.name === name);
      if (!inst) {
        addOutput(`${t('cmd.notFound', language)}: ${name}`);
        return;
      }
      addOutput(`${t('cmd.launching', language)}: ${inst.name}`);
      onLaunch(inst.id, '');
      return;
    }

    // //kill (no args = kill all)
    if (trimmed === 'kill') {
      const killed = processManager.killAll();
      addOutput(`${t('cmd.killedAll', language)}: ${killed}`);
      return;
    }

    // //quit
    if (trimmed === 'quit') {
      onQuit(false);
      return;
    }

    // //quit --kill
    if (trimmed === 'quit --kill') {
      onQuit(true);
      return;
    }

    // //quit --killbesides <instance name>
    const quitKillBesidesMatch = trimmed.match(/^quit\s+--killbesides\s+(.+)$/i);
    if (quitKillBesidesMatch) {
      const instanceName = quitKillBesidesMatch[1].trim();
      onQuit(true, instanceName);
      return;
    }

    // //file (no args = open instances parent dir)
    if (trimmed === 'file') {
      openFolder(PATHS.instances);
      addOutput(`${t('cmd.openedFolder', language)}: ${PATHS.instances}`);
      return;
    }

    // //file <instance name>
    const fileMatch = trimmed.match(/^file\s+(.+)$/i);
    if (fileMatch) {
      const name = fileMatch[1].trim();
      const instances = listInstances();
      const inst = instances.find(i => i.name === name);
      if (!inst) {
        addOutput(`${t('cmd.notFound', language)}: ${name}`);
        return;
      }
      openFolder(inst.gameDir);
      addOutput(`${t('cmd.openedFolder', language)}: ${inst.gameDir}`);
      return;
    }

    // //running
    if (trimmed === 'running') {
      const games = processManager.list();
      if (games.length === 0) {
        addOutput(t('cmd.noRunning', language));
      } else {
        for (const game of games) {
          const uptime = Math.floor((Date.now() - game.startTime) / 60000);
          addOutput(`  PID ${game.pid} | ${game.instanceName} | ${game.versionId} | ${uptime}m`);
        }
      }
      return;
    }

    // //download jdk <version>
    const dlJdkMatch = trimmed.match(/^download\s+jdk\s+(\d+)$/i);
    if (dlJdkMatch) {
      const version = parseInt(dlJdkMatch[1]);
      setBusy(true);
      try {
        addOutput(`${t('cmd.downloading', language)} JDK ${version}...`);
        await downloadJdk(version, 'azul', () => {});
        addOutput(`JDK ${version} ${t('common.success', language)}`);
      } catch (err: any) {
        addOutput(`${t('common.error', language)}: ${err.message}`);
      }
      setBusy(false);
      return;
    }

    // //download game <version>
    const dlGameMatch = trimmed.match(/^download\s+game\s+(.+)$/i);
    if (dlGameMatch) {
      const version = dlGameMatch[1].trim();
      setBusy(true);
      try {
        addOutput(`${t('cmd.downloading', language)} ${version}...`);
        await downloadVersionFiles(version, () => {});
        addOutput(`${version} ${t('common.success', language)}`);
      } catch (err: any) {
        addOutput(`${t('common.error', language)}: ${err.message}`);
      }
      setBusy(false);
      return;
    }

    addOutput(t('cmd.unknown', language));
  };

  useInput((inputChar, key) => {
    if (key.escape) {
      onExit();
      return;
    }
    if (busy) return;

    if (key.return) {
      if (input.trim()) {
        executeCommand(input);
      }
      setInput('');
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (inputChar && !key.ctrl && !key.meta) {
      setInput(prev => prev + inputChar);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>{t('cmd.prompt', language)}: //{input}<Text color="gray">▎</Text></Text>
      {output.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {output.slice(-8).map((line, i) => (
            <Text key={i} color="white">{line}</Text>
          ))}
        </Box>
      )}
      <Text color="gray">{t('cmd.help', language)} //help  |  Esc {t('common.back', language)}</Text>
    </Box>
  );
};

export default CommandLine;
