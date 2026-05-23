import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { AppState } from './App.js';
import { AuthAccount, AuthType } from '../types/auth.js';
import { createOfflineAccount } from '../auth/offline.js';
import { createMicrosoftAccount, authenticateWithDeviceCode } from '../auth/microsoft.js';
import { authenticateYggdrasil, createYggdrasilAccount, DEFAULT_YGGDRASIL_SERVERS } from '../auth/yggdrasil.js';
import { saveAccounts, loadAccounts } from '../store/config.js';
import { t } from '../i18n/index.js';

interface Props {
  state: AppState;
  onBack: () => void;
}

type SubScreen = 'list' | 'add-offline' | 'add-microsoft' | 'add-yggdrasil';

const AccountManager: React.FC<Props> = ({ state, onBack }) => {
  const [selected, setSelected] = useState(0);
  const [subScreen, setSubScreen] = useState<SubScreen>('list');
  const [accounts, setAccounts] = useState(state.accounts);
  const [offlineName, setOfflineName] = useState('');
  const [msStatus, setMsStatus] = useState('');
  const [msCode, setMsCode] = useState('');
  const [msUrl, setMsUrl] = useState('');
  const [yggdrasilEmail, setYggdrasilEmail] = useState('');
  const [yggdrasilPassword, setYggdrasilPassword] = useState('');
  const [yggdrasilServerIdx, setYggdrasilServerIdx] = useState(0);
  const [inputMode, setInputMode] = useState<'email' | 'password' | 'name'>('name');
  const [status, setStatus] = useState('');

  const lang = state.config.language || 'zh-CN';

  useInput((input, key) => {
    if (subScreen === 'list') {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) setSelected(prev => (prev - 1 + accounts.length) % Math.max(accounts.length, 1));
      if (key.downArrow) setSelected(prev => (prev + 1) % Math.max(accounts.length, 1));
      if (input === '1') { setSubScreen('add-offline'); setOfflineName(''); setInputMode('name'); }
      if (input === '2') { setSubScreen('add-microsoft'); setMsStatus('waiting'); }
      if (input === '3') { setSubScreen('add-yggdrasil'); setYggdrasilEmail(''); setYggdrasilPassword(''); setInputMode('email'); }
      if ((key.delete || key.backspace) && accounts.length > 0) {
        const updated = accounts.filter((_, i) => i !== selected);
        saveAccounts(updated);
        setAccounts(updated);
        setSelected(0);
      }
      if (key.return && accounts.length > 0) {
        // Login: go back to main menu with this account selected (implicitly selected)
        onBack();
      }
    } else if (subScreen === 'add-offline') {
      if (key.escape) { setSubScreen('list'); return; }
      if (key.return && offlineName.trim()) {
        const account = createOfflineAccount(offlineName.trim());
        const updated = [...accounts, account];
        saveAccounts(updated);
        setAccounts(updated);
        setSubScreen('list');
        setStatus(`${t('accounts.added', lang)}: ${account.username}`);
      } else if (key.backspace || key.delete) {
        setOfflineName(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setOfflineName(prev => prev + input);
      }
    } else if (subScreen === 'add-microsoft') {
      if (key.escape) { setSubScreen('list'); return; }
      if (input === 'y' && msStatus === 'waiting') {
        setMsStatus('authenticating');
        authenticateWithDeviceCode((code, verificationUri, message) => {
          setMsCode(code);
          setMsUrl(verificationUri);
          setMsStatus('code');
        }).then(result => {
          const account = createMicrosoftAccount(result);
          const updated = [...loadAccounts(), account];
          saveAccounts(updated);
          setAccounts(updated);
          setSubScreen('list');
          setStatus(`${t('accounts.added', lang)}: ${account.username}`);
        }).catch(err => {
          setMsStatus(`error:${err.message}`);
        });
      }
    } else if (subScreen === 'add-yggdrasil') {
      if (key.escape) { setSubScreen('list'); return; }
      if (key.tab) {
        setInputMode(prev => prev === 'email' ? 'password' : 'email');
        return;
      }
      if (key.return) {
        if (inputMode === 'email') {
          setInputMode('password');
          return;
        }
        // Submit
        const server = DEFAULT_YGGDRASIL_SERVERS[yggdrasilServerIdx];
        if (!server?.url) { setStatus('Please select a valid server'); return; }
        authenticateYggdrasil(server.url, yggdrasilEmail, yggdrasilPassword)
          .then(result => {
            const account = createYggdrasilAccount(server.url, server.name, result);
            const updated = [...loadAccounts(), account];
            saveAccounts(updated);
            setAccounts(updated);
            setSubScreen('list');
            setStatus(`${t('accounts.added', lang)}: ${account.username}`);
          })
          .catch(err => {
            setStatus(`Auth failed: ${err.message}`);
          });
        return;
      }
      if (key.backspace || key.delete) {
        if (inputMode === 'email') setYggdrasilEmail(prev => prev.slice(0, -1));
        else setYggdrasilPassword(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        if (inputMode === 'email') setYggdrasilEmail(prev => prev + input);
        else setYggdrasilPassword(prev => prev + '*');
      }
    }
  });

  const getTypeIcon = (type: AuthType) => {
    switch (type) {
      case 'offline': return '👤';
      case 'microsoft': return '🪟';
      case 'yggdrasil': return '🔗';
    }
  };

  if (subScreen === 'add-offline') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('accounts.addOffline', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Box marginTop={1}>
          <Text color="white">{t('accounts.username', lang)}: </Text>
          <Text color="green">{offlineName}<Text color="gray">▎</Text></Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Type username, Enter to confirm, Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (subScreen === 'add-microsoft') {
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('accounts.addMicrosoft', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Box marginTop={1}>
          {msStatus === 'waiting' && (
            <Box flexDirection="column">
              <Text color="yellow">{t('accounts.msWaiting', lang)}</Text>
              <Text color="yellow">{t('accounts.msConfirm', lang)}</Text>
            </Box>
          )}
          {msStatus === 'authenticating' && (
            <Text color="cyan">{t('accounts.msAuthing', lang)}</Text>
          )}
          {msStatus === 'code' && (
            <Box flexDirection="column">
              <Text color="green" bold>{t('accounts.msVisit', lang)}{msUrl}</Text>
              <Text color="white" bold>{t('accounts.msCode', lang)}{msCode}</Text>
              <Text color="cyan">{t('accounts.msWaitingAuth', lang)}</Text>
            </Box>
          )}
          {msStatus.startsWith('error:') && (
            <Box flexDirection="column">
              <Text color="red">{msStatus.slice(6)}</Text>
              <Text color="yellow">{t('accounts.msError', lang)}</Text>
              <Text color="gray">Press Esc to go back</Text>
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  if (subScreen === 'add-yggdrasil') {
    const server = DEFAULT_YGGDRASIL_SERVERS[yggdrasilServerIdx];
    return (
      <Box flexDirection="column">
        <Text color="cyan" bold>{t('accounts.addYggdrasil', lang)}</Text>
        <Text color="green">{t('common.navHint', lang)}</Text>
        <Box marginTop={1}>
          <Text color="white">Server: </Text>
          <Text color="yellow">{server?.name || 'Custom'}</Text>
        </Box>
        <Box>
          <Text color={inputMode === 'email' ? 'white' : 'gray'}>{t('accounts.email', lang)}: </Text>
          <Text color={inputMode === 'email' ? 'green' : 'gray'}>
            {inputMode === 'email' ? `${yggdrasilEmail}▎` : yggdrasilEmail.replace(/./g, '*')}
          </Text>
        </Box>
        <Box>
          <Text color={inputMode === 'password' ? 'white' : 'gray'}>{t('accounts.password', lang)}: </Text>
          <Text color={inputMode === 'password' ? 'green' : 'gray'}>
            {inputMode === 'password' ? `${yggdrasilPassword}▎` : yggdrasilPassword.replace(/./g, '*')}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Tab to switch fields, Enter to submit, Esc to cancel</Text>
        </Box>
        {status && <Text color="red">{status}</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>{t('accounts.title', lang)}</Text>
      <Text color="green">{t('common.navHint', lang)}</Text>
      <Box marginBottom={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">{t('accounts.actions', lang)}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {accounts.length === 0 ? (
          <Text color="yellow">{t('accounts.empty', lang)}</Text>
        ) : (
          accounts.map((acc, idx) => (
            <Box key={acc.id}>
              <Text color={idx === selected ? 'cyan' : 'gray'}>
                {idx === selected ? '❯ ' : '  '}
              </Text>
              <Text color={idx === selected ? 'white' : 'gray'}>
                {getTypeIcon(acc.type)} [{acc.type}] {acc.username}
              </Text>
            </Box>
          ))
        )}
      </Box>
      {status && <Text color="green">{status}</Text>}
    </Box>
  );
};

export default AccountManager;
