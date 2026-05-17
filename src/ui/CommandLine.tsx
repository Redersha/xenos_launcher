import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { processManager, RunningGame } from '../core/processManager.js';
import { downloadJdk } from '../java/downloader.js';
import { downloadVersionFiles } from '../download/downloader.js';
import { t } from '../i18n/index.js';

interface Props {
  language: string;
  onExit: () => void;
}

const CommandLine: React.FC<Props> = ({ language, onExit }) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const addOutput = (line: string) => {
    setOutput(prev => [...prev.slice(-50), line]);
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

    // //kill <pid|name|version>
    const killMatch = trimmed.match(/^kill\s+(.+)$/);
    if (killMatch) {
      const target = killMatch[1].trim();
      const pidNum = parseInt(target);

      if (!isNaN(pidNum)) {
        const game = processManager.findByPid(pidNum);
        if (game && processManager.killByPid(pidNum)) {
          addOutput(`${t('cmd.killed', language)}: PID ${pidNum} (${game.instanceName})`);
        } else {
          addOutput(`${t('cmd.notFound', language)}: PID ${pidNum}`);
        }
      } else {
        // Try by instance name first
        let killed = processManager.killByName(target);
        if (killed > 0) {
          addOutput(`${t('cmd.killed', language)}: ${killed} ${target}`);
        } else {
          // Try by version
          killed = processManager.killByVersion(target);
          if (killed > 0) {
            addOutput(`${t('cmd.killed', language)}: ${killed} x ${target}`);
          } else {
            addOutput(`${t('cmd.notFound', language)}: ${target}`);
          }
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
        await downloadJdk(version, 'azul', (p) => {
          // Minimal progress feedback
        });
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
        await downloadVersionFiles(version, (p) => {
          // Minimal progress feedback
        });
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
